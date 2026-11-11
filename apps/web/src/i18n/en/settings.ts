import type { settings as base } from '../es/settings';

export const settings: Record<keyof typeof base, string> = {
  'topbar.settings': 'Settings',
  'settings.title': 'Settings',
  'settings.logo': 'Logo',
  'settings.logoHint':
    'Shown on the entry screen and in the top bar. PNG, JPEG or WebP of up to 256 KB.',
  'settings.logoPublic':
    'It is stored outside the vault: anyone who opens the app on this computer will see it even while it is locked.',
  'settings.logoAlt': 'Application logo',
  'settings.choose': 'Choose image',
  'settings.replace': 'Change image',
  'settings.remove': 'Remove logo',
  'settings.logoSaved': 'Logo updated',
  'settings.logoRemoved': 'Logo removed',
  'settings.logoFailed': 'Could not save the logo',
  'settings.appearance': 'Appearance',
  'settings.appName': 'Application name',
  'settings.accent': 'Accent color',
  'settings.defaultTheme': 'Default theme',
  'settings.themeHint':
    'Used by anyone who has not yet picked a theme with the button in the top bar.',
  'settings.theme.light': 'Light',
  'settings.theme.dark': 'Dark',
  'settings.theme.system': 'Automatic',
  'settings.accent.indigo': 'Indigo',
  'settings.accent.blue': 'Blue',
  'settings.accent.teal': 'Teal',
  'settings.accent.emerald': 'Emerald',
  'settings.accent.violet': 'Violet',
  'settings.accent.rose': 'Rose',
  'settings.accent.orange': 'Orange',
  'settings.saveAppearance': 'Save appearance',
  'settings.appearanceSaved': 'Appearance updated',
  'settings.appearanceFailed': 'Could not save the appearance',
  'settings.preview.title': 'Preview',
  'settings.preview.hint':
    'This is how the interface will look with your choices; it applies when you save.',
  'settings.preview.project': 'Project',
  'settings.preview.reveal': 'Show',
  'settings.preview.newSecret': 'New secret',
};
