import type { AnyTRPCRouter, inferRouterContext } from "@trpc/server";
import type { BrowserWindow, IpcMainEvent } from "electron";
import { ipcMain } from "electron";

import { ELECTRON_TRPC_CHANNEL } from "../constants";
import type { ETRPCRequest } from "../types";
import { handleIPCMessage } from "./handleIPCMessage";
import type { CreateContextOptions } from "./types";

type MaybePromise<TType> = Promise<TType> | TType;

const getInternalId = (event: IpcMainEvent, request: ETRPCRequest) => {
  const messageId =
    request.method === "request" ? request.operation.id : request.id;
  return `${event.sender.id}-${event.senderFrame?.routingId ?? 0}:${messageId}`;
};

class IPCHandler<TRouter extends AnyTRPCRouter> {
  #windows: BrowserWindow[] = [];
  #subscriptions: Map<string, AbortController> = new Map();
  #listener: (event: IpcMainEvent, request: ETRPCRequest) => void;

  constructor({
    createContext,
    router,
    windows = [],
  }: {
    createContext?: (
      opts: CreateContextOptions,
    ) => MaybePromise<inferRouterContext<TRouter>>;
    router: TRouter;
    windows?: BrowserWindow[];
  }) {
    for (const win of windows) {
      this.attachWindow(win);
    }

    this.#listener = (event: IpcMainEvent, request: ETRPCRequest) => {
      handleIPCMessage({
        router,
        createContext,
        internalId: getInternalId(event, request),
        event,
        message: request,
        subscriptions: this.#subscriptions,
      });
    };
    ipcMain.on(ELECTRON_TRPC_CHANNEL, this.#listener);
  }

  destroy() {
    ipcMain.removeListener(ELECTRON_TRPC_CHANNEL, this.#listener);
    for (const sub of this.#subscriptions.values()) {
      sub.abort();
    }
    this.#subscriptions.clear();
  }

  attachWindow(win: BrowserWindow) {
    if (this.#windows.includes(win)) {
      return;
    }

    this.#windows.push(win);
    this.#attachSubscriptionCleanupHandlers(win);
  }

  detachWindow(win: BrowserWindow, webContentsId?: number) {
    this.#windows = this.#windows.filter((w) => w !== win);

    if (win.isDestroyed() && webContentsId === undefined) {
      throw new Error(
        "webContentsId is required when calling detachWindow on a destroyed window",
      );
    }

    this.#cleanUpSubscriptions({
      webContentsId: webContentsId ?? win.webContents.id,
    });
  }

  #cleanUpSubscriptions({
    webContentsId,
    frameRoutingId,
  }: {
    webContentsId: number;
    frameRoutingId?: number;
  }) {
    for (const [key, sub] of this.#subscriptions.entries()) {
      if (key.startsWith(`${webContentsId}-${frameRoutingId ?? ""}`)) {
        sub.abort();
        this.#subscriptions.delete(key);
      }
    }
  }

  #attachSubscriptionCleanupHandlers(win: BrowserWindow) {
    const webContentsId = win.webContents.id;
    win.webContents.on("did-start-navigation", ({ isSameDocument, frame }) => {
      if (!isSameDocument && frame) {
        this.#cleanUpSubscriptions({
          webContentsId: webContentsId,
          frameRoutingId: frame.routingId,
        });
      }
    });
    win.webContents.on("destroyed", () => {
      this.detachWindow(win, webContentsId);
    });
  }
}

let currentHandler: IPCHandler<AnyTRPCRouter> | null = null;

export const createIPCHandler = <TRouter extends AnyTRPCRouter>({
  createContext,
  router,
  windows = [],
}: {
  createContext?: (
    opts: CreateContextOptions,
  ) => Promise<inferRouterContext<TRouter>>;
  router: TRouter;
  windows?: Electron.BrowserWindow[];
}) => {
  if (currentHandler) {
    currentHandler.destroy();
  }
  currentHandler = new IPCHandler({ createContext, router, windows });
  return currentHandler;
};
