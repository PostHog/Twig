export interface AgentServerConfig {
  port: number;
  repositoryPath: string;
  apiUrl: string;
  apiKey: string;
  projectId: number;
  jwtSecret?: string; // Only needed for Docker (Modal uses X-Verified-User-Data)
}
