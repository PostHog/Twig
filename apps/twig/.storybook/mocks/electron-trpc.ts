(globalThis as unknown as { electronTRPC: unknown }).electronTRPC = {
  sendMessage: () => Promise.resolve(),
  onMessage: () => () => {},
};

export function ipcLink() {
  return () => ({
    type: "terminating" as const,
    start() {
      return {
        request() {
          return {
            cancel: () => {},
          };
        },
      };
    },
  });
}

export function exposeElectronTRPC() {}
