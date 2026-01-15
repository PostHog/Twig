import { usePathname, useSegments } from "expo-router";
import PostHog, { usePostHog } from "posthog-react-native";
import { useEffect, useRef } from "react";

export const posthog = new PostHog(
  process.env.EXPO_PUBLIC_POSTHOG_API_KEY ?? "",
  {
    host: process.env.EXPO_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
    captureAppLifecycleEvents: true,
    enableSessionReplay: true,
    sessionReplayConfig: {
      maskAllTextInputs: false,
      maskAllImages: false,
      captureLog: true,
      captureNetworkTelemetry: true,
    },
  },
);

export function useScreenTracking() {
  const pathname = usePathname();
  const segments = useSegments();
  const posthog = usePostHog();
  const previousPathname = useRef<string | null>(null);

  useEffect(() => {
    if (pathname && pathname !== previousPathname.current) {
      // Convert segments to a readable screen name
      // e.g., ["(tabs)", "tasks"] -> "tasks", ["chat", "[id]"] -> "chat/[id]"
      const screenName =
        segments.filter((segment) => !segment.startsWith("(")).join("/") ||
        "index";

      posthog.screen(screenName, {
        pathname,
        segments: segments.join("/"),
      });

      previousPathname.current = pathname;
    }
  }, [pathname, segments, posthog]);
}
