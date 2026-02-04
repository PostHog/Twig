export interface AgentServerConfig {
  port: number;
  repositoryPath: string;
  apiUrl: string;
  apiKey: string;
  projectId: number;
  jwtPublicKey: string; // RS256 public key for JWT verification
}
