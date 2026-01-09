import { getTrunk } from "../jj";
import { createEngine, type Engine } from "./engine";

/**
 * Context passed to command handlers.
 * Contains the engine and other shared state.
 */
export interface ArrContext {
  engine: Engine;
  trunk: string;
  cwd: string;
}

/**
 * Initialize context for a command.
 * Engine is loaded and ready to use.
 */
export async function initContext(
  cwd: string = process.cwd(),
): Promise<ArrContext> {
  const engine = createEngine(cwd);
  engine.load();

  const trunk = await getTrunk(cwd);

  return {
    engine,
    trunk,
    cwd,
  };
}
