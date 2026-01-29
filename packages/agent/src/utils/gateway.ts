export function getLlmGatewayUrl(posthogHost: string): string {
  const url = new URL(posthogHost);
  const hostname = url.hostname;

  // Local development (normalize 127.0.0.1 to localhost)
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return `${url.protocol}//localhost:3308/array`;
  }

  // Docker containers accessing host
  if (hostname === "host.docker.internal") {
    return `${url.protocol}//host.docker.internal:3308/array`;
  }

  // Production - extract region from hostname, default to US
  const region = hostname.match(/^(us|eu)\.posthog\.com$/)?.[1] ?? "us";
  return `https://gateway.${region}.posthog.com/array`;
}
