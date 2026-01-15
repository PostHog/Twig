import { usePathname, useSegments } from "expo-router";
import { usePostHog } from "posthog-react-native";
import { useEffect, useRef } from "react";

/**
 * PostHog configuration - used by PostHogProvider in _layout.tsx
 */
export const POSTHOG_API_KEY = process.env.EXPO_PUBLIC_POSTHOG_API_KEY ?? "";
export const POSTHOG_OPTIONS = {
  host: process.env.EXPO_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
  captureAppLifecycleEvents: true,
  enableSessionReplay: true,
  sessionReplayConfig: {
    maskAllTextInputs: false,
    maskAllImages: false,
    captureLog: true,
    captureNetworkTelemetry: true,
  },
};

/**
 * Screen tracking hook for expo-router.
 * Must be used inside PostHogProvider.
 */
export function useScreenTracking() {
  const pathname = usePathname();
  const segments = useSegments();
  const posthog = usePostHog();
  const previousPathname = useRef<string | null>(null);

  useEffect(() => {
    if (posthog && pathname && pathname !== previousPathname.current) {
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
