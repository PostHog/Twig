import { PostHog } from "posthog-node";

let posthogClient: PostHog | null = null;
let currentUserId: string | null = null;

export function initializePostHog() {
  if (posthogClient) {
    return posthogClient;
  }

  const apiKey = process.env.VITE_POSTHOG_API_KEY;
  const apiHost = process.env.VITE_POSTHOG_API_HOST;

  if (!apiKey) {
    return null;
  }

  posthogClient = new PostHog(apiKey, {
    host: apiHost || "https://internal-c.posthog.com",
  });

  return posthogClient;
}

export function setCurrentUserId(userId: string | null) {
  currentUserId = userId;
}

export function getCurrentUserId() {
  return currentUserId;
}

export function trackAppEvent(
  eventName: string,
  properties?: Record<string, string | number | boolean>,
) {
  if (!posthogClient) {
    return;
  }

  // Use real user ID if available, otherwise use anonymous ID
  const distinctId = currentUserId || "anonymous-app-event";

  properties = {
    ...properties,
    $process_person_profile: !!currentUserId,
  };

  posthogClient.capture({
    distinctId,
    event: eventName,
    properties,
  });
}

export function identifyUser(
  userId: string,
  properties?: Record<string, string | number | boolean>,
) {
  if (!posthogClient) {
    return;
  }

  currentUserId = userId;

  posthogClient.identify({
    distinctId: userId,
    properties,
  });
}

export async function shutdownPostHog() {
  if (posthogClient) {
    await posthogClient.shutdown();
    posthogClient = null;
  }
}

export function getPostHogClient() {
  return posthogClient;
}

export function resetUser() {
  currentUserId = null;
}

export function captureException(
  error: unknown,
  additionalProperties?: Record<string, unknown>,
) {
  if (!posthogClient) {
    return;
  }

  const distinctId = currentUserId || "anonymous-app-event";
  posthogClient.captureException(error, distinctId, additionalProperties);
}
