import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildApiFetcher } from "./fetcher";

describe("buildApiFetcher", () => {
  const mockFetch = vi.fn();
  const mockInput = {
    method: "get" as const,
    url: new URL("https://api.example.com/test"),
    path: "/test",
  };
  const ok = (data = {}) => ({
    ok: true,
    status: 200,
    json: () => Promise.resolve(data),
  });
  const err = (status: number) => ({
    ok: false,
    status,
    json: () => Promise.resolve({ error: status }),
  });

  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal("fetch", mockFetch);
  });

  it("makes request with bearer token", async () => {
    mockFetch.mockResolvedValueOnce(ok());
    const fetcher = buildApiFetcher({ apiToken: "my-token" });

    await fetcher.fetch(mockInput);

    expect(mockFetch.mock.calls[0][1].headers.get("Authorization")).toBe(
      "Bearer my-token",
    );
  });

  it("retries with new token on 401", async () => {
    const onTokenRefresh = vi.fn().mockResolvedValue("new-token");
    mockFetch.mockResolvedValueOnce(err(401)).mockResolvedValueOnce(ok());

    const fetcher = buildApiFetcher({ apiToken: "old-token", onTokenRefresh });
    const response = await fetcher.fetch(mockInput);

    expect(response.ok).toBe(true);
    expect(onTokenRefresh).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[1][1].headers.get("Authorization")).toBe(
      "Bearer new-token",
    );
  });

  it("uses refreshed token for subsequent requests", async () => {
    const onTokenRefresh = vi.fn().mockResolvedValue("refreshed-token");
    mockFetch
      .mockResolvedValueOnce(err(401))
      .mockResolvedValueOnce(ok())
      .mockResolvedValueOnce(ok());

    const fetcher = buildApiFetcher({
      apiToken: "initial-token",
      onTokenRefresh,
    });
    await fetcher.fetch(mockInput);
    await fetcher.fetch(mockInput);

    expect(mockFetch.mock.calls[2][1].headers.get("Authorization")).toBe(
      "Bearer refreshed-token",
    );
  });

  it("does not refresh on non-401 errors", async () => {
    const onTokenRefresh = vi.fn();
    mockFetch.mockResolvedValueOnce(err(403));

    const fetcher = buildApiFetcher({ apiToken: "token", onTokenRefresh });

    await expect(fetcher.fetch(mockInput)).rejects.toThrow("[403]");
    expect(onTokenRefresh).not.toHaveBeenCalled();
  });

  it("throws on 401 without refresh callback", async () => {
    mockFetch.mockResolvedValueOnce(err(401));
    const fetcher = buildApiFetcher({ apiToken: "token" });

    await expect(fetcher.fetch(mockInput)).rejects.toThrow("[401]");
  });

  it("throws when refresh fails", async () => {
    const onTokenRefresh = vi.fn().mockRejectedValue(new Error("failed"));
    mockFetch.mockResolvedValueOnce(err(401));

    const fetcher = buildApiFetcher({ apiToken: "token", onTokenRefresh });

    await expect(fetcher.fetch(mockInput)).rejects.toThrow("[401]");
  });

  it("handles network errors", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network failure"));
    const fetcher = buildApiFetcher({ apiToken: "token" });

    await expect(fetcher.fetch(mockInput)).rejects.toThrow(
      "Network request failed",
    );
  });
});
