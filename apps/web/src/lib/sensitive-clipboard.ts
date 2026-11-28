export interface ClipboardDeps {
  write(text: string): Promise<boolean>;
  setTimer(run: () => void, ms: number): number;
  clearTimer(id: number): void;
  /** Ejecuta `run` la próxima vez que la ventana recupere el foco; devuelve cómo cancelarlo. */
  onNextFocus(run: () => void): () => void;
}

export interface SensitiveClipboard {
  copy(text: string, clearAfterSeconds: number): Promise<boolean>;
  clearNow(): Promise<void>;
  /** La persona copió a mano algo sensible: se programa el mismo vaciado. */
  arm(clearAfterSeconds: number): void;
  /** Olvida la limpieza pendiente: lo que hay en el portapapeles ya no es nuestro secreto. */
  forget(): void;
}

/**
 * No lee el portapapeles antes de vaciarlo: leerlo pide un permiso a la persona. Si el navegador
 * rechaza la escritura porque la ventana no tiene el foco, se reintenta al recuperarlo.
 */
export function createSensitiveClipboard(deps: ClipboardDeps): SensitiveClipboard {
  /** Cómo cancelar el vaciado pendiente (temporizador o reintento); `null` si no hay ninguno. */
  let cancel: (() => void) | null = null;

  function forget(): void {
    cancel?.();
    cancel = null;
  }

  async function clearNow(): Promise<void> {
    if (!cancel) return;
    forget();
    if (await deps.write('')) return;
    cancel = deps.onNextFocus(() => void clearNow());
  }

  function arm(clearAfterSeconds: number): void {
    forget();
    if (clearAfterSeconds <= 0) return;
    const timer = deps.setTimer(() => void clearNow(), clearAfterSeconds * 1000);
    cancel = () => deps.clearTimer(timer);
  }

  async function copy(text: string, clearAfterSeconds: number): Promise<boolean> {
    if (!(await deps.write(text))) return false;
    arm(clearAfterSeconds);
    return true;
  }

  return { copy, arm, clearNow, forget };
}
