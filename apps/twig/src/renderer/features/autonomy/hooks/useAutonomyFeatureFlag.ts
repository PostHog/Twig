import posthog from "posthog-js/dist/module.full.no-external";
import { useEffect, useState } from "react";

/**
 * Hook to check if the Autonomy feature is enabled via PostHog feature flag `max-session-summarization-video-as-base`.
 * All Autonomy UI must be gated behind this flag.
 */
export function useAutonomyFeatureFlag(): boolean {
  const [isEnabled, setIsEnabled] = useState(() => {
    // Initial synchronous check
    return (
      posthog.isFeatureEnabled("max-session-summarization-video-as-base") ??
      false
    );
  });

  useEffect(() => {
    // Listen for feature flag updates after they load from the server
    const handleFlagsLoaded = () => {
      setIsEnabled(
        posthog.isFeatureEnabled("max-session-summarization-video-as-base") ??
          false,
      );
    };
    posthog.onFeatureFlags(handleFlagsLoaded);
    // Check immediately in case flags are already loaded
    handleFlagsLoaded();
  }, []);

  return isEnabled || import.meta.env.DEV;
}
