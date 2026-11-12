import { DEFAULT_APPEARANCE } from '@secretvault/shared';
import type { Appearance } from '@secretvault/shared';

export function hasAppearanceChanges(draft: Appearance): boolean {
  return (
    draft.appName.trim() !== DEFAULT_APPEARANCE.appName ||
    draft.accent !== DEFAULT_APPEARANCE.accent ||
    draft.defaultTheme !== DEFAULT_APPEARANCE.defaultTheme
  );
}
