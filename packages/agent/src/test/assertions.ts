import { expect } from "vitest";

export interface NotificationEntry {
  notification?: {
    method?: string;
    params?: {
      sessionId?: string;
      update?: {
        sessionUpdate?: string;
        content?: {
          type?: string;
          text?: string;
        };
      };
    };
  };
}

export interface NotificationMatcher {
  method?: string;
  text?: string;
  sessionId?: string;
  sessionUpdate?: string;
}

function entryMatchesNotification(
  entry: unknown,
  matcher: NotificationMatcher,
): boolean {
  const notification = (entry as NotificationEntry).notification;
  if (!notification) return false;

  if (matcher.method && notification.method !== matcher.method) {
    return false;
  }
  if (matcher.sessionId && notification.params?.sessionId !== matcher.sessionId) {
    return false;
  }
  if (matcher.sessionUpdate && notification.params?.update?.sessionUpdate !== matcher.sessionUpdate) {
    return false;
  }
  if (matcher.text) {
    const text = notification.params?.update?.content?.text;
    if (!text || !text.includes(matcher.text)) {
      return false;
    }
  }
  return true;
}

export function findNotification(
  appendLogCalls: unknown[][],
  matcher: NotificationMatcher,
): NotificationEntry | undefined {
  for (const entries of appendLogCalls) {
    for (const entry of entries) {
      if (entryMatchesNotification(entry, matcher)) {
        return entry as NotificationEntry;
      }
    }
  }
  return undefined;
}

export function hasNotification(
  appendLogCalls: unknown[][],
  matcher: NotificationMatcher,
): boolean {
  return findNotification(appendLogCalls, matcher) !== undefined;
}

export function expectNotification(
  appendLogCalls: unknown[][],
  matcher: NotificationMatcher,
): NotificationEntry {
  const found = findNotification(appendLogCalls, matcher);
  expect(found, `Expected notification matching ${JSON.stringify(matcher)}`).toBeDefined();
  return found!;
}

export function expectNoNotification(
  appendLogCalls: unknown[][],
  matcher: NotificationMatcher,
): void {
  const found = findNotification(appendLogCalls, matcher);
  expect(found, `Expected no notification matching ${JSON.stringify(matcher)}`).toBeUndefined();
}

export function countNotifications(
  appendLogCalls: unknown[][],
  matcher: NotificationMatcher,
): number {
  let count = 0;
  for (const entries of appendLogCalls) {
    for (const entry of entries) {
      if (entryMatchesNotification(entry, matcher)) {
        count++;
      }
    }
  }
  return count;
}
