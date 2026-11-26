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
  /** Olvida la limpieza pendiente: lo que hay en el portapapeles ya no es nuestro secreto. */
  forget(): void;
}

export function createSensitiveClipboard(deps: ClipboardDeps): SensitiveClipboard {
  let timer: number | null = null;
  let cancelRetry: (() => void) | null = null;
  let pending = false;

  function forget(): void {
    if (timer !== null) deps.clearTimer(timer);
    cancelRetry?.();
    timer = null;
    cancelRetry = null;
    pending = false;
  }

  // No se lee antes de vaciar: leer el portapapeles exige un permiso que el navegador pide a la persona.
  async function clearNow(): Promise<void> {
    if (!pending) return;
    forget();
    if (await deps.write('')) return;
    // Sin foco el navegador rechaza la escritura.
    pending = true;
    cancelRetry = deps.onNextFocus(() => void clearNow());
  }

  async function copy(text: string, clearAfterSeconds: number): Promise<boolean> {
    if (!(await deps.write(text))) return false;
    forget();
    if (clearAfterSeconds > 0) {
      pending = true;
      timer = deps.setTimer(() => void clearNow(), clearAfterSeconds * 1000);
    }
    return true;
  }

  return { copy, clearNow, forget };
}
