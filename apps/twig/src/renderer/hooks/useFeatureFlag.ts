import { useAuthStore } from "@features/auth/stores/authStore";
import { logger } from "@renderer/lib/logger";
import { useEffect, useState } from "react";

const log = logger.scope("useFeatureFlag");

// Cache for to avoid having too many repeated API calls
const flagCache = new Map<string, { value: boolean; timestamp: number }>();
const CACHE_TTL_MS = 60 * 1000; // 1 minute

export function useFeatureFlag(
  flagKey: string,
  defaultValue: boolean = false,
): boolean {
  const client = useAuthStore((state) => state.client);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const [enabled, setEnabled] = useState(defaultValue);

  useEffect(() => {
    if (!isAuthenticated || !client) {
      log.debug(`Cannot check flag "${flagKey}": not authenticated`);
      setEnabled(defaultValue);
      return;
    }

    // Check cache first
    const cached = flagCache.get(flagKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      log.debug(`Flag "${flagKey}" from cache:`, cached.value);
      setEnabled(cached.value);
      return;
    }

    // Fetch from API
    client
      .isFeatureFlagEnabled(flagKey)
      .then((value) => {
        log.debug(`Flag "${flagKey}" from API:`, value);
        flagCache.set(flagKey, { value, timestamp: Date.now() });
        setEnabled(value);
      })
      .catch((error) => {
        log.warn(`Error checking flag "${flagKey}":`, error);
        setEnabled(defaultValue);
      });
  }, [flagKey, client, isAuthenticated, defaultValue]);

  return enabled;
}

export function clearFeatureFlagCache(): void {
  flagCache.clear();
}
