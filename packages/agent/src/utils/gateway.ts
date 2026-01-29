export function getLlmGatewayUrl(posthogHost: string): string {
  const url = new URL(posthogHost);
  const hostname = url.hostname;

  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "host.docker.internal") {
    // For Docker containers, use host.docker.internal to reach the local gateway
    const gatewayHost = hostname === "host.docker.internal" ? "host.docker.internal" : "localhost";
    return `${url.protocol}//${gatewayHost}:3308/array`;
  }

  const regionMatch = hostname.match(/^(us|eu)\.posthog\.com$/);
  const region = regionMatch ? regionMatch[1] : "us";

  return `https://gateway.${region}.posthog.com/array`;
}
