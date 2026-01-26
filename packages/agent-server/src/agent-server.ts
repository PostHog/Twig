import {
    createAcpConnection,
    PostHogAPIClient,
    Logger,
    getLlmGatewayUrl,
    TreeTracker,
    resumeFromLog,
} from '@posthog/agent'
import type { InProcessAcpConnection } from '@posthog/agent'
import { ClientSideConnection, ndJsonStream, PROTOCOL_VERSION } from '@agentclientprotocol/sdk'
import type { AgentServerConfig, DeviceInfo, TreeSnapshot } from './types.js'

export class AgentServer {
    private config: AgentServerConfig
    private isRunning = false
    private sseAbortController: AbortController | null = null
    private logger: Logger
    private acpConnection: InProcessAcpConnection | null = null
    private clientConnection: ClientSideConnection | null = null
    private treeTracker: TreeTracker | null = null
    private apiClient: PostHogAPIClient | null = null
    private lastHeartbeatTime = 0
    private lastEventId: string | null = null
    private deviceInfo: DeviceInfo

    constructor(config: AgentServerConfig) {
        this.config = config
        this.logger = new Logger({ debug: true, prefix: '[AgentServer]' })
        this.deviceInfo = {
            id: `cloud-${config.runId}`,
            type: 'cloud',
            name: process.env.HOSTNAME || 'cloud-sandbox',
        }
    }

    async start(): Promise<void> {
        this.isRunning = true
        await this.connect()
        await this.initializeAcpConnection()
        await this.resumeFromPreviousState()

        if (this.config.initialPrompt) {
            this.logger.info('Processing initial prompt')
            await this.handleUserMessage({ content: this.config.initialPrompt })
        }

        await new Promise<void>((resolve) => {
            const checkRunning = () => {
                if (!this.isRunning) {
                    resolve()
                } else {
                    setTimeout(checkRunning, 1000)
                }
            }
            checkRunning()
        })
    }

    async stop(): Promise<void> {
        this.isRunning = false
        this.logger.info('Stopping agent server...')

        try {
            await this.captureTreeState({ interrupted: true, force: true })
            this.logger.info('Final tree state captured')
        } catch (error) {
            this.logger.warn('Failed to capture final tree state:', (error as Error).message)
        }

        if (this.acpConnection) {
            await this.acpConnection.cleanup()
        }

        if (this.sseAbortController) {
            this.sseAbortController.abort()
        }

        this.logger.info('Agent server stopped')
    }

    private async connect(): Promise<void> {
        const { apiUrl, apiKey, projectId, taskId, runId } = this.config
        const syncUrl = `${apiUrl}/api/projects/${projectId}/tasks/${taskId}/runs/${runId}/sync`

        this.logger.info(`Connecting to SSE stream: ${syncUrl}`)

        this.sseAbortController = new AbortController()

        this.startSseStream(syncUrl).catch((error) => {
            this.logger.error('SSE stream error:', (error as Error).message)
        })

        this.isRunning = true
        await this.sendStatusNotification('connected', 'Agent server connected')
    }

    private async startSseStream(url: string): Promise<void> {
        const { apiKey } = this.config
        const headers: Record<string, string> = {
            Authorization: `Bearer ${apiKey}`,
            Accept: 'text/event-stream',
        }

        if (this.lastEventId) {
            headers['Last-Event-ID'] = this.lastEventId
        }

        while (this.isRunning) {
            try {
                const response = await fetch(url, {
                    headers,
                    signal: this.sseAbortController?.signal,
                })

                if (!response.ok) {
                    throw new Error(`SSE connection failed: ${response.status}`)
                }

                this.logger.info('SSE connection established')

                const reader = response.body!.getReader()
                const decoder = new TextDecoder()
                let buffer = ''

                while (this.isRunning) {
                    const { done, value } = await reader.read()

                    if (done) {
                        this.logger.info('SSE stream ended')
                        break
                    }

                    buffer += decoder.decode(value, { stream: true })
                    const lines = buffer.split('\n')
                    buffer = lines.pop() || ''

                    let currentEventId: string | null = null
                    let currentData: string | null = null

                    for (const line of lines) {
                        if (line.startsWith('id: ')) {
                            currentEventId = line.slice(4).trim()
                        } else if (line.startsWith('data: ')) {
                            currentData = line.slice(6)
                        } else if (line === '' && currentData) {
                            if (currentEventId) {
                                this.lastEventId = currentEventId
                            }
                            try {
                                const event = JSON.parse(currentData)
                                await this.handleSseEvent(event)
                            } catch {
                                this.logger.warn('Failed to parse SSE data:', currentData)
                            }
                            currentData = null
                            currentEventId = null
                        }
                    }
                }
            } catch (error) {
                if ((error as Error).name === 'AbortError') {
                    this.logger.info('SSE connection aborted')
                    break
                }
                this.logger.error('SSE error, reconnecting in 1s:', (error as Error).message)
                await new Promise((resolve) => setTimeout(resolve, 1000))
            }
        }
    }

    private async handleSseEvent(event: Record<string, unknown>): Promise<void> {
        const notification = event.notification as Record<string, unknown> | undefined
        const method = (event.method as string) || (notification?.method as string)

        if (method === '_posthog/user_message' || event.type === 'client_message') {
            this.logger.info(`[SSE] Received client message: ${method}`)
            const message = event.message as Record<string, unknown> | undefined
            const params =
                (event.params as Record<string, unknown>) ||
                (notification?.params as Record<string, unknown>) ||
                (message?.params as Record<string, unknown>)
            if (params) {
                await this.handleMessage({ method: '_posthog/user_message', params })
            }
        } else if (method === '_posthog/cancel') {
            await this.handleCancel()
        } else if (method === '_posthog/close') {
            await this.handleClose()
        }
    }

    private async sendStatusNotification(status: string, message: string): Promise<void> {
        const statusEmoji: Record<string, string> = {
            connected: '☁️',
            error: '❌',
            warning: '⚠️',
        }
        const notification = {
            type: 'notification',
            timestamp: new Date().toISOString(),
            notification: {
                jsonrpc: '2.0',
                method: 'session/update',
                params: {
                    sessionId: this.config.runId,
                    update: {
                        sessionUpdate: 'system_message',
                        content: {
                            type: 'text',
                            text: `${statusEmoji[status] || 'ℹ️'} ${message}`,
                        },
                    },
                },
            },
        }
        await this.sendEvent(notification)
    }

    private async sendEvent(event: Record<string, unknown>): Promise<void> {
        const notification = event.notification as Record<string, unknown> | undefined
        this.logger.info(
            `[SEND_EVENT] Sending event: method=${notification?.method || (event.method as string) || 'unknown'}`
        )

        this.maybeHeartbeat()

        try {
            await this.persistEvent(event)
            this.logger.info(`[SEND_EVENT] Persisted to Kafka successfully`)
        } catch (error) {
            this.logger.error('[SEND_EVENT] Failed to persist event:', (error as Error).message)
        }
    }

    private maybeHeartbeat(): void {
        const now = Date.now()
        const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000

        if (now - this.lastHeartbeatTime > HEARTBEAT_INTERVAL_MS) {
            this.lastHeartbeatTime = now
            this.sendHeartbeat().catch((err) => {
                this.logger.warn('Failed to send heartbeat:', (err as Error).message)
            })
        }
    }

    private async sendHeartbeat(): Promise<void> {
        const { apiUrl, apiKey, projectId, taskId, runId } = this.config
        const url = `${apiUrl}/api/projects/${projectId}/tasks/${taskId}/runs/${runId}/heartbeat`

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
        })

        if (!response.ok) {
            throw new Error(`Heartbeat failed: ${response.status}`)
        }

        this.logger.info('Heartbeat sent successfully')
    }

    private async persistEvent(event: Record<string, unknown>): Promise<void> {
        const { apiUrl, apiKey, projectId, taskId, runId } = this.config
        const url = `${apiUrl}/api/projects/${projectId}/tasks/${taskId}/runs/${runId}/append_log`

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                entries: [event],
            }),
        })

        if (!response.ok) {
            throw new Error(`Failed to persist: ${response.status}`)
        }
    }

    private async handleMessage(message: { method: string; params?: Record<string, unknown> }): Promise<void> {
        const method = message.method
        this.logger.info(`Received message: ${method}`)

        switch (method) {
            case '_posthog/user_message':
                await this.handleUserMessage(message.params as { content: string })
                break
            case '_posthog/cancel':
                await this.handleCancel()
                break
            case '_posthog/close':
                await this.handleClose()
                break
            default:
                this.logger.info(`Unknown method: ${method}`)
        }
    }

    private async handleUserMessage(params: { content: string }): Promise<void> {
        const content = params.content
        this.logger.info(`[USER_MSG] Processing user message: ${content.substring(0, 100)}...`)

        if (!this.clientConnection) {
            this.logger.info(`[USER_MSG] No ACP connection, initializing...`)
            await this.initializeAcpConnection()
        }

        try {
            this.logger.info(`[USER_MSG] Sending prompt via ACP protocol`)
            const result = await this.clientConnection!.prompt({
                sessionId: this.config.runId,
                prompt: [{ type: 'text', text: content }],
            })

            this.logger.info(`[USER_MSG] Prompt completed with stopReason: ${result.stopReason}`)
        } catch (error) {
            this.logger.error('[USER_MSG] Agent error:', error)
            await this.sendStatusNotification('error', (error as Error).message)
        }
    }

    private async initializeAcpConnection(): Promise<void> {
        this.logger.info('Initializing ACP connection')

        const gatewayUrl = process.env.LLM_GATEWAY_URL || getLlmGatewayUrl(this.config.apiUrl)
        this.logger.info(`Using LLM gateway URL: ${gatewayUrl}`)

        const envOverrides = {
            POSTHOG_API_KEY: this.config.apiKey,
            POSTHOG_API_HOST: this.config.apiUrl,
            POSTHOG_AUTH_HEADER: `Bearer ${this.config.apiKey}`,
            ANTHROPIC_API_KEY: this.config.apiKey,
            ANTHROPIC_AUTH_TOKEN: this.config.apiKey,
            ANTHROPIC_BASE_URL: gatewayUrl,
        }
        Object.assign(process.env, envOverrides)

        this.apiClient = new PostHogAPIClient({
            apiUrl: this.config.apiUrl,
            getApiKey: () => this.config.apiKey,
            projectId: this.config.projectId,
        })

        this.treeTracker = new TreeTracker({
            repositoryPath: this.config.repositoryPath,
            taskId: this.config.taskId,
            runId: this.config.runId,
            apiClient: this.apiClient,
            logger: new Logger({ debug: true, prefix: '[TreeTracker]' }),
        })

        this.acpConnection = createAcpConnection({
            sessionId: this.config.runId,
            taskId: this.config.taskId,
        })

        const clientStream = ndJsonStream(
            this.acpConnection.clientStreams.writable,
            this.acpConnection.clientStreams.readable
        )

        const self = this

        const cloudClient = {
            async requestPermission(params: { options: Array<{ kind: string; optionId: string }> }) {
                const allowOption = params.options.find((o) => o.kind === 'allow_once' || o.kind === 'allow_always')
                return {
                    outcome: {
                        outcome: 'selected' as const,
                        optionId: allowOption?.optionId ?? params.options[0].optionId,
                    },
                }
            },
            async sessionUpdate(params: { sessionId: string; update?: Record<string, unknown> }) {
                self.logger.info(
                    `[SESSION_UPDATE] Received sessionUpdate: ${(params.update?.sessionUpdate as string) || 'unknown'}`
                )

                const normalizedParams = {
                    ...params,
                    sessionId: self.config.runId,
                }

                const notification = {
                    type: 'notification',
                    timestamp: new Date().toISOString(),
                    notification: {
                        jsonrpc: '2.0',
                        method: 'session/update',
                        params: normalizedParams,
                    },
                }
                await self.sendEvent(notification)

                if (params.update?.sessionUpdate === 'tool_call_update') {
                    const meta = (params.update?._meta as Record<string, unknown>)?.claudeCode as
                        | Record<string, unknown>
                        | undefined
                    const toolName = meta?.toolName as string | undefined
                    const toolResponse = meta?.toolResponse as Record<string, unknown> | undefined
                    if ((toolName === 'Write' || toolName === 'Edit') && toolResponse?.filePath) {
                        self.logger.info(`[TREE_CAPTURE] Detected ${toolName} for file: ${toolResponse.filePath}`)
                        await self.captureTreeState({})
                    }
                }
            },
        }

        this.clientConnection = new ClientSideConnection((_agent) => cloudClient, clientStream)

        await this.clientConnection.initialize({
            protocolVersion: PROTOCOL_VERSION,
            clientCapabilities: {},
        })

        await this.clientConnection.newSession({
            cwd: this.config.repositoryPath,
            mcpServers: [],
            _meta: { sessionId: this.config.runId },
        })

        this.logger.info('ACP connection initialized')
    }

    private async captureTreeState(options: { interrupted?: boolean; force?: boolean }): Promise<void> {
        if (!this.treeTracker) {
            this.logger.warn('TreeTracker not initialized')
            return
        }

        try {
            const hasChanges = await this.treeTracker.hasChanges()
            if (!hasChanges && !options.force) {
                this.logger.debug('No changes to capture')
                return
            }

            const snapshot = await this.treeTracker.captureTree({
                interrupted: options.interrupted,
            })

            if (snapshot) {
                const snapshotWithDevice: TreeSnapshot = {
                    ...snapshot,
                    device: this.deviceInfo,
                }

                this.logger.info('Tree state captured', {
                    treeHash: snapshot.treeHash,
                    filesChanged: snapshot.filesChanged.length,
                    interrupted: options.interrupted,
                })

                await this.sendTreeSnapshotEvent(snapshotWithDevice)
            }
        } catch (error) {
            this.logger.error('Failed to capture tree state:', (error as Error).message)
        }
    }

    private async sendTreeSnapshotEvent(snapshot: TreeSnapshot): Promise<void> {
        const notification = {
            type: 'notification',
            timestamp: new Date().toISOString(),
            notification: {
                jsonrpc: '2.0',
                method: '_posthog/tree_snapshot',
                params: snapshot,
            },
        }
        await this.sendEvent(notification)
    }

    private async handleCancel(): Promise<void> {
        this.logger.info('Cancel requested')
        if (this.clientConnection) {
            try {
                await this.clientConnection.cancel({ sessionId: this.config.runId })
            } catch (error) {
                this.logger.error('Failed to cancel:', error)
            }
        }
    }

    private async handleClose(): Promise<void> {
        this.logger.info('Close requested')
        await this.stop()
    }

    private async resumeFromPreviousState(): Promise<void> {
        const { apiUrl, apiKey, projectId, taskId, runId, repositoryPath } = this.config
        this.logger.info('Attempting to resume from previous state', { taskId, runId })

        try {
            const tempApiClient = new PostHogAPIClient({
                apiUrl,
                getApiKey: () => apiKey,
                projectId,
            })

            const resumeState = await resumeFromLog({
                taskId,
                runId,
                repositoryPath,
                apiClient: tempApiClient,
                logger: new Logger({ debug: true, prefix: '[Resume]' }),
            })

            if (resumeState.latestSnapshot) {
                this.logger.info('Resumed from tree snapshot', {
                    treeHash: resumeState.latestSnapshot.treeHash,
                    filesChanged: resumeState.latestSnapshot.filesChanged.length,
                    interrupted: resumeState.interrupted,
                })

                if (this.treeTracker) {
                    this.treeTracker.setLastTreeHash(resumeState.latestSnapshot.treeHash)
                }
            } else {
                this.logger.info('No previous state found, starting fresh')
            }
        } catch (error) {
            this.logger.warn('Failed to resume from previous state:', (error as Error).message)
        }
    }
}
