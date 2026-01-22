export function getLlmGatewayUrl(posthogHost: string): string {
  const url = new URL(posthogHost);
  const hostname = url.hostname;

  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return `${url.protocol}//localhost:3308/array`;
  }

  const regionMatch = hostname.match(/^(us|eu)\.posthog\.com$/);
  const region = regionMatch ? regionMatch[1] : "us";

  return `https://gateway.${region}.posthog.com/array`;
}
