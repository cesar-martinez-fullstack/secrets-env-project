import { defineStore } from 'pinia';
import { ref } from 'vue';
import { DEFAULT_CLIPBOARD_CLEAR_SECONDS } from '@secretvault/shared';
import type { SessionSecurityDto, UpdateSessionSecurityRequestDto } from '@secretvault/shared';
import { api } from '@/lib/api';
import { copyText } from '@/lib/clipboard';
import { createSensitiveClipboard } from '@/lib/sensitive-clipboard';

const clipboard = createSensitiveClipboard({
  write: copyText,
  setTimer: (run, ms) => window.setTimeout(run, ms),
  clearTimer: (id) => window.clearTimeout(id),
  onNextFocus: (run) => {
    window.addEventListener('focus', run, { once: true });
    return () => window.removeEventListener('focus', run);
  },
});

function touchesSensitive(event: Event): boolean {
  const nodes = [event.target as Node | null, document.getSelection()?.anchorNode];
  return nodes.some((node) => {
    const element = node instanceof Element ? node : node?.parentElement;
    return Boolean(element?.closest('[data-sensitive]'));
  });
}

export const useSecurityStore = defineStore('security', () => {
  const settings = ref<SessionSecurityDto | null>(null);

  async function load(): Promise<SessionSecurityDto> {
    settings.value = await api.getSessionSecurity();
    return settings.value;
  }

  async function save(request: UpdateSessionSecurityRequestDto): Promise<void> {
    settings.value = await api.updateSessionSecurity(request);
  }

  const clipboardSeconds = (): number =>
    settings.value?.clipboardClearSeconds ?? DEFAULT_CLIPBOARD_CLEAR_SECONDS;

  /** Un Ctrl+C sobre algo marcado como sensible se limpia igual; sobre lo demás, ya no es nuestro. */
  function onManualCopy(event: Event): void {
    if (touchesSensitive(event)) clipboard.arm(clipboardSeconds());
    else clipboard.forget();
  }

  return {
    onManualCopy,
    settings,
    load,
    save,
    clipboardSeconds,
    copySensitive: (text: string) => clipboard.copy(text, clipboardSeconds()),
    clearClipboard: () => clipboard.clearNow(),
    keepClipboard: () => clipboard.forget(),
  };
});
