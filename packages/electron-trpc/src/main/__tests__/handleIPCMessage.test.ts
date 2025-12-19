import { EventEmitter, on } from "node:events";
import * as trpc from "@trpc/server";
import { observable } from "@trpc/server/observable";
import type { IpcMainEvent } from "electron";
import { describe, expect, type MockedFunction, test, vi } from "vitest";
import { z } from "zod";

import { handleIPCMessage } from "../handleIPCMessage";

interface MockEvent {
  reply: MockedFunction<any>;
  sender: {
    isDestroyed: () => boolean;
    on: (event: string, cb: () => void) => void;
  };
}
const makeEvent = (event: MockEvent) =>
  event as unknown as IpcMainEvent & Pick<MockEvent, "reply">;

const t = trpc.initTRPC.create();
const testRouter = t.router({
  testQuery: t.procedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .query(({ input }) => {
      return { id: input.id, isTest: true };
    }),
});

describe("api", () => {
  test("handles queries", async () => {
    const event = makeEvent({
      reply: vi.fn(),
      sender: {
        isDestroyed: () => false,
        on: () => {},
      },
    });

    await handleIPCMessage({
      createContext: async () => ({}),
      event,
      internalId: "1-1:1",
      message: {
        method: "request",
        operation: {
          context: {},
          id: 1,
          input: { id: "test-id" },
          path: "testQuery",
          type: "query",
          signal: undefined,
        },
      },
      router: testRouter,
      subscriptions: new Map(),
    });

    expect(event.reply).toHaveBeenCalledOnce();
    expect(event.reply.mock.lastCall?.[1]).toMatchObject({
      id: 1,
      result: {
        data: {
          id: "test-id",
          isTest: true,
        },
      },
    });
  });

  test("does not respond if sender is gone", async () => {
    const event = makeEvent({
      reply: vi.fn(),
      sender: {
        isDestroyed: () => true,
        on: () => {},
      },
    });

    await handleIPCMessage({
      createContext: async () => ({}),
      event,
      internalId: "1-1:1",
      message: {
        method: "request",
        operation: {
          context: {},
          id: 1,
          input: { id: "test-id" },
          path: "testQuery",
          type: "query",
          signal: undefined,
        },
      },
      router: testRouter,
      subscriptions: new Map(),
    });

    expect(event.reply).not.toHaveBeenCalled();
  });

  test("handles subscriptions using observables", async () => {
    const subscriptions = new Map();
    const ee = new EventEmitter();
    const t = trpc.initTRPC.create();
    const testRouter = t.router({
      testSubscription: t.procedure.subscription(() => {
        return observable((emit) => {
          function testResponse() {
            emit.next("test response");
          }

          ee.on("test", testResponse);
          return () => ee.off("test", testResponse);
        });
      }),
    });

    const event = makeEvent({
      reply: vi.fn(),
      sender: {
        isDestroyed: () => false,
        on: () => {},
      },
    });

    expect(ee.listenerCount("test")).toBe(0);

    await handleIPCMessage({
      createContext: async () => ({}),
      message: {
        method: "request",
        operation: {
          context: {},
          id: 1,
          input: undefined,
          path: "testSubscription",
          type: "subscription",
          signal: undefined,
        },
      },
      internalId: "1-1:1",
      subscriptions,
      router: testRouter,
      event,
    });

    expect(ee.listenerCount("test")).toBe(1);
    expect(event.reply).toHaveBeenCalledTimes(1);
    expect(event.reply.mock.lastCall?.[1]).toMatchObject({
      id: 1,
      result: {
        type: "started",
      },
    });

    ee.emit("test");

    await vi.waitFor(() => {
      expect(event.reply).toHaveBeenCalledTimes(2);
      expect(event.reply.mock.lastCall?.[1]).toMatchObject({
        id: 1,
        result: {
          data: "test response",
        },
      });
    });

    await handleIPCMessage({
      createContext: async () => ({}),
      message: {
        method: "subscription.stop",
        id: 1,
      },
      internalId: "1-1:1",
      subscriptions,
      router: testRouter,
      event,
    });

    await vi.waitFor(() => {
      expect(ee.listenerCount("test")).toBe(0);
      expect(event.reply).toHaveBeenCalledTimes(3);
      expect(event.reply.mock.lastCall?.[1]).toMatchObject({
        id: 1,
        result: {
          type: "stopped",
        },
      });
    });
  });

  test("handles subscriptions using async generators", async () => {
    const subscriptions = new Map();
    const ee = new EventEmitter();
    const t = trpc.initTRPC.create();
    const testRouter = t.router({
      testSubscription: t.procedure.subscription(async function* ({ signal }) {
        for await (const _ of on(ee, "test", { signal })) {
          yield "test response";
        }
      }),
    });

    const event = makeEvent({
      reply: vi.fn(),
      sender: {
        isDestroyed: () => false,
        on: () => {},
      },
    });

    expect(ee.listenerCount("test")).toBe(0);

    await handleIPCMessage({
      createContext: async () => ({}),
      message: {
        method: "request",
        operation: {
          context: {},
          id: 1,
          input: undefined,
          path: "testSubscription",
          type: "subscription",
          signal: undefined,
        },
      },
      internalId: "1-1:1",
      subscriptions,
      router: testRouter,
      event,
    });

    expect(ee.listenerCount("test")).toBe(1);
    expect(event.reply).toHaveBeenCalledTimes(1);
    expect(event.reply.mock.lastCall?.[1]).toMatchObject({
      id: 1,
      result: {
        type: "started",
      },
    });

    ee.emit("test");

    await vi.waitFor(() => {
      expect(event.reply).toHaveBeenCalledTimes(2);
      expect(event.reply.mock.lastCall?.[1]).toMatchObject({
        id: 1,
        result: {
          data: "test response",
        },
      });
    });

    await handleIPCMessage({
      createContext: async () => ({}),
      message: {
        method: "subscription.stop",
        id: 1,
      },
      internalId: "1-1:1",
      subscriptions,
      router: testRouter,
      event,
    });

    await vi.waitFor(() => {
      expect(ee.listenerCount("test")).toBe(0);
      expect(event.reply).toHaveBeenCalledTimes(3);
      expect(event.reply.mock.lastCall?.[1]).toMatchObject({
        id: 1,
        result: {
          type: "stopped",
        },
      });
    });
  });

  test("subscription responds using custom serializer", async () => {
    const event = makeEvent({
      reply: vi.fn(),
      sender: {
        isDestroyed: () => false,
        on: () => {},
      },
    });

    const ee = new EventEmitter();

    const t = trpc.initTRPC.create({
      transformer: {
        deserialize: (input: unknown) => {
          const serialized = (input as string).replace(/^serialized:/, "");
          return JSON.parse(serialized);
        },
        serialize: (input) => {
          return `serialized:${JSON.stringify(input)}`;
        },
      },
    });

    const testRouter = t.router({
      testSubscription: t.procedure.subscription(() => {
        return observable((emit) => {
          function testResponse() {
            emit.next("test response");
          }

          ee.on("test", testResponse);
          return () => ee.off("test", testResponse);
        });
      }),
    });

    await handleIPCMessage({
      createContext: async () => ({}),
      message: {
        method: "request",
        operation: {
          context: {},
          id: 1,
          input: undefined,
          path: "testSubscription",
          type: "subscription",
          signal: undefined,
        },
      },
      internalId: "1-1:1",
      subscriptions: new Map(),
      router: testRouter,
      event,
    });

    expect(event.reply).toHaveBeenCalledTimes(1);
    expect(event.reply.mock.lastCall?.[1]).toMatchObject({
      id: 1,
      result: {
        type: "started",
      },
    });

    ee.emit("test");

    await vi.waitFor(() => {
      expect(event.reply).toHaveBeenCalledTimes(2);
      expect(event.reply.mock.lastCall?.[1]).toMatchObject({
        id: 1,
        result: {
          type: "data",
          data: 'serialized:"test response"',
        },
      });
    });
  });
});
