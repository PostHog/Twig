"use client";

import { useEffect, useRef, useState } from "react";

const CODE_LINES = [
  "$ twig status",
  "",
  "┌─ Active Tasks ──────────────────────────┐",
  "│                                         │",
  "│  ● auth-refactor      running   2m 34s  │",
  "│  ○ api-optimization   queued            │",
  "│  ✓ db-migration       complete  12m ago │",
  "│                                         │",
  "└─────────────────────────────────────────┘",
  "",
  "$ twig logs auth-refactor --tail",
  "",
  "[agent] Analyzing authentication flow...",
  "[agent] Found 3 files to modify:",
  "        src/auth/session.ts",
  "        src/auth/middleware.ts",
  "        src/api/routes/login.ts",
  "[agent] Refactoring session handling...",
  "[agent] Updating JWT validation logic...",
  "[agent] Running type checks... ✓",
  "[agent] Running tests...",
  "        ✓ session.test.ts (12 passed)",
  "        ✓ middleware.test.ts (8 passed)",
  "        ✓ login.test.ts (15 passed)",
  "[agent] All tests passing.",
  "[agent] Creating commit...",
  "",
  "$ git diff --stat",
  "",
  " src/auth/session.ts    | 47 +++++++++++-------",
  " src/auth/middleware.ts | 23 ++++------",
  " src/api/routes/login.ts| 18 +++++---",
  " 3 files changed, 52 insertions(+), 36 deletions(-)",
  "",
  "$ _",
];

export function TerminalDemo() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visibleLines, setVisibleLines] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setVisibleLines((prev) => {
        if (prev >= CODE_LINES.length) {
          return prev;
        }
        return prev + 1;
      });
    }, 120);

    return () => clearInterval(interval);
  }, []);

  return (
    <div
      ref={containerRef}
      className="h-full w-full overflow-hidden bg-bg p-6 font-mono text-body-sm"
    >
      <div className="flex flex-col gap-0.5">
        {CODE_LINES.slice(0, visibleLines).map((line, i) => (
          <div
            key={i}
            className="whitespace-pre text-fg"
            style={{
              opacity: Math.max(0.4, 1 - (visibleLines - i - 1) * 0.03),
            }}
          >
            {line || "\u00A0"}
          </div>
        ))}
        {visibleLines >= CODE_LINES.length && (
          <span className="inline-block h-4 w-2 animate-pulse bg-fg" />
        )}
      </div>
    </div>
  );
}
