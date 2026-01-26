export interface AgentServerConfig {
    apiUrl: string
    apiKey: string
    projectId: number
    taskId: string
    runId: string
    repositoryPath: string
    initialPrompt?: string
}

export interface DeviceInfo {
    id: string
    type: 'cloud'
    name: string
}

export interface TreeSnapshot {
    treeHash: string
    filesChanged: string[]
    device?: DeviceInfo
}
