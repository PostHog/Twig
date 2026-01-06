import posthog from "posthog-js/dist/module.full.no-external";
// Import the recorder to set up __PosthogExtensions__.initSessionRecording
// The module.full.no-external bundle includes rrweb but not the initSessionRecording function
// This import adds the missing piece needed for session replay in Electron
import "posthog-js/dist/lazy-recorder";
import type {
  EventPropertyMap,
  UserIdentifyProperties,
} from "../../types/analytics";
import { logger } from "./logger";

const log = logger.scope("analytics");

let isInitialized = false;

export function initializePostHog() {
  const apiKey = import.meta.env.VITE_POSTHOG_API_KEY;
  const apiHost =
    import.meta.env.VITE_POSTHOG_API_HOST || "https://internal-c.posthog.com";
  const uiHost =
    import.meta.env.VITE_POSTHOG_UI_HOST || "https://us.i.posthog.com";

  if (!apiKey || isInitialized) {
    return;
  }

  posthog.init(apiKey, {
    api_host: apiHost,
    ui_host: uiHost,
    capture_pageview: false,
    capture_pageleave: false,
    disable_session_recording: false,
    debug: true, // Enable debug mode for now (TODO: turn this off before launch)
    loaded: () => {
      log.info("PostHog loaded");
      // Log session recording status after remote config loads
      setTimeout(() => {
        logSessionRecordingStatus();
      }, 3000);
    },
  });

  isInitialized = true;
}

/**
 * Log the current session recording status for debugging
 */
export function logSessionRecordingStatus() {
  if (!isInitialized) {
    log.warn("PostHog not initialized");
    return;
  }

  const sessionRecording = posthog.sessionRecording;
  const remoteConfig = posthog.get_property("$session_recording_remote_config");

  log.info("Session Recording Debug:", {
    started: sessionRecording?.started,
    status: sessionRecording?.status,
    remoteConfigEnabled: remoteConfig?.enabled,
    remoteConfig,
    windowLocationHref: window.location?.href,
    configDisableSessionRecording: posthog.config?.disable_session_recording,
  });
}

/**
 * Manually start session recording.
 * Use this to force start recording regardless of triggers.
 */
export function startSessionRecording() {
  if (!isInitialized) {
    log.warn("PostHog not initialized, cannot start session recording");
    return;
  }

  log.info("Attempting to start session recording...");

  // Use PostHog's startSessionRecording API which overrides triggers
  posthog.startSessionRecording();

  // Log status after attempting to start
  setTimeout(() => {
    log.info("Session recording status after manual start:");
    logSessionRecordingStatus();
  }, 1000);
}

export function identifyUser(
  userId: string,
  properties?: UserIdentifyProperties,
) {
  if (!isInitialized) return;

  posthog.identify(userId, properties);
}

export function resetUser() {
  if (!isInitialized) return;

  posthog.reset();
}

export function track<K extends keyof EventPropertyMap>(
  eventName: K,
  ...args: EventPropertyMap[K] extends never
    ? []
    : EventPropertyMap[K] extends undefined
      ? [properties?: EventPropertyMap[K]]
      : [properties: EventPropertyMap[K]]
) {
  if (!isInitialized) return;
  posthog.capture(eventName, args[0]);
}
