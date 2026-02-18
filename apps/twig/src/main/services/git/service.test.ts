import { beforeEach, describe, expect, it, vi } from "vitest";

const mockExecGh = vi.hoisted(() => vi.fn());

vi.mock("@twig/git/gh", () => ({
  execGh: mockExecGh,
}));

vi.mock("../../lib/logger.js", () => ({
  logger: {
    scope: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

import type { LlmGatewayService } from "../llm-gateway/service.js";
import { GitService } from "./service.js";

describe("GitService.getPrChangedFiles", () => {
  let service: GitService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new GitService({} as LlmGatewayService);
  });

  it("flattens paginated GH API results and maps file statuses", async () => {
    mockExecGh.mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify([
        [
          {
            filename: "src/new.ts",
            status: "added",
            additions: 10,
            deletions: 0,
          },
          {
            filename: "src/old.ts",
            status: "removed",
            additions: 0,
            deletions: 3,
          },
        ],
        [
          {
            filename: "src/renamed-new.ts",
            status: "renamed",
            previous_filename: "src/renamed-old.ts",
            additions: 1,
            deletions: 1,
          },
          {
            filename: "src/changed.ts",
            status: "changed",
            additions: 4,
            deletions: 2,
          },
        ],
      ]),
    });

    const result = await service.getPrChangedFiles(
      "https://github.com/posthog/twig/pull/123",
    );

    expect(mockExecGh).toHaveBeenCalledWith([
      "api",
      "repos/posthog/twig/pulls/123/files",
      "--paginate",
      "--slurp",
    ]);

    expect(result).toEqual([
      {
        path: "src/new.ts",
        status: "added",
        originalPath: undefined,
        linesAdded: 10,
        linesRemoved: 0,
      },
      {
        path: "src/old.ts",
        status: "deleted",
        originalPath: undefined,
        linesAdded: 0,
        linesRemoved: 3,
      },
      {
        path: "src/renamed-new.ts",
        status: "renamed",
        originalPath: "src/renamed-old.ts",
        linesAdded: 1,
        linesRemoved: 1,
      },
      {
        path: "src/changed.ts",
        status: "modified",
        originalPath: undefined,
        linesAdded: 4,
        linesRemoved: 2,
      },
    ]);
  });

  it("returns empty array for non-GitHub PR URL", async () => {
    const result = await service.getPrChangedFiles(
      "https://example.com/pull/1",
    );
    expect(result).toEqual([]);
    expect(mockExecGh).not.toHaveBeenCalled();
  });

  it("throws when gh command fails", async () => {
    mockExecGh.mockResolvedValue({
      exitCode: 1,
      stdout: "",
      stderr: "auth required",
    });

    await expect(
      service.getPrChangedFiles("https://github.com/posthog/twig/pull/123"),
    ).rejects.toThrow("Failed to fetch PR files");
  });
});
