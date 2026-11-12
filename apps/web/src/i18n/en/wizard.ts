import type { wizard as base } from '../es/wizard';

export const wizard: Record<keyof typeof base, string> = {
  'wizard.step': 'Step {current} of {total}',
  'wizard.welcomeTitle': 'Welcome',
  'wizard.welcomeBody':
    'Before creating your vault, pick the language and what to call the application.',
  'wizard.language': 'Language',
  'wizard.lang.es': 'Español',
  'wizard.lang.en': 'English',
  'wizard.lookTitle': 'Choose how it looks',
  'wizard.lookBody': 'Logo, color and theme. You can change them later in Settings.',
  'wizard.logoChoose': 'Choose logo',
  'wizard.logoRemove': 'Remove',
  'wizard.logoInvalid': 'The image must be PNG, JPEG or WebP, up to 256 KB.',
  'wizard.next': 'Next',
  'wizard.back': 'Back',
  'wizard.finish': 'Choose a password',
  'wizard.applyFailed': 'Your choices could not be applied; you can do it in Settings',
  'wizard.skip': 'Skip and use the defaults',
};
