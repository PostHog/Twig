import { AgentServer } from './agent-server.js'
import type { AgentServerConfig } from './types.js'

export { AgentServer } from './agent-server.js'
export type { AgentServerConfig, DeviceInfo, TreeSnapshot } from './types.js'

function parseArgs(): Record<string, string> {
    const args = process.argv.slice(2)
    const parsed: Record<string, string> = {}

    for (let i = 0; i < args.length; i += 2) {
        const key = args[i].replace(/^--/, '')
        const value = args[i + 1]
        if (value !== undefined) {
            parsed[key] = value
        }
    }

    return parsed
}

async function main(): Promise<void> {
    const { taskId, runId, repositoryPath, initialPrompt } = parseArgs()

    if (!taskId) {
        console.error('Missing required argument: --taskId')
        process.exit(1)
    }

    if (!runId) {
        console.error('Missing required argument: --runId')
        process.exit(1)
    }

    if (!repositoryPath) {
        console.error('Missing required argument: --repositoryPath')
        process.exit(1)
    }

    const apiUrl = process.env.POSTHOG_API_URL
    const apiKey = process.env.POSTHOG_PERSONAL_API_KEY
    const projectId = process.env.POSTHOG_PROJECT_ID

    if (!apiUrl) {
        console.error('Missing required environment variable: POSTHOG_API_URL')
        process.exit(1)
    }

    if (!apiKey) {
        console.error('Missing required environment variable: POSTHOG_PERSONAL_API_KEY')
        process.exit(1)
    }

    if (!projectId) {
        console.error('Missing required environment variable: POSTHOG_PROJECT_ID')
        process.exit(1)
    }

    let decodedPrompt: string | undefined
    if (initialPrompt) {
        try {
            decodedPrompt = Buffer.from(initialPrompt, 'base64').toString('utf-8')
        } catch {
            console.error('Failed to decode initialPrompt (expected base64)')
            process.exit(1)
        }
    }

    const config: AgentServerConfig = {
        apiUrl,
        apiKey,
        projectId: parseInt(projectId, 10),
        taskId,
        runId,
        repositoryPath,
        initialPrompt: decodedPrompt,
    }

    const server = new AgentServer(config)

    process.on('SIGINT', async () => {
        await server.stop()
        process.exit(0)
    })

    process.on('SIGTERM', async () => {
        await server.stop()
        process.exit(0)
    })

    try {
        await server.start()
    } catch (error) {
        console.error('Agent server error:', error)
        process.exit(1)
    }
}

const isMainModule = import.meta.url === `file://${process.argv[1]}`
if (isMainModule) {
    main()
}
