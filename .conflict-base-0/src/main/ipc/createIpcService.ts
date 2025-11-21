import { ipcMain } from "electron";

type IpcHandler<TArgs extends any[], TResult> = (
  event: Electron.IpcMainInvokeEvent,
  ...args: TArgs
) => Promise<TResult> | TResult;

interface IpcServiceConfig<TArgs extends any[], TResult> {
  channel: string;
  handler: IpcHandler<TArgs, TResult>;
}

export function createIpcService<TArgs extends any[], TResult>(
  config: IpcServiceConfig<TArgs, TResult>,
) {
  ipcMain.handle(config.channel, config.handler);

  return {
    channel: config.channel,
  };
}
