import type { LogLevel } from '@secretvault/shared';

/** Destino de los registros del proceso; `core` solo necesita ajustar su detalle. */
export interface LogLevelOutput {
  setLevel(level: LogLevel): void;
}
