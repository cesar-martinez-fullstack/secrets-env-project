import type { security as base } from '../es/security';

export const security: Record<keyof typeof base, string> = {
  'security.title': 'Security',
  'security.current': 'Current master password',
  'security.changeTitle': 'Change the master password',
  'security.new': 'New password',
  'security.strength': 'Strength: {label}',
  'security.confirm': 'Confirm new password',
  'security.change': 'Change password',
  'security.changedTitle': 'Password updated',
  'security.changedBody': 'Your secrets did not change: only the key was re-wrapped.',
  'security.recoveryTitle': 'Recovery key',
  'security.recoveryBody':
    'Generates a new key. The previous one stops working immediately. Use it if you think the key was exposed or you lost it (and still know your password).',
  'security.recoveryGenerate': 'Generate a new key',

  'recovery.title': 'Save your recovery key',
  'recovery.leadStart': 'If you forget your master password, this key is the',
  'recovery.leadOnly': 'only',
  'recovery.leadMiddle': 'way to recover your secrets. It is shown',
  'recovery.leadOnce': 'only once',
  'recovery.leadEnd': ': SecretVault does not keep it.',
  'recovery.keyLabel': 'Recovery key',
  'recovery.copy': 'Copy',
  'recovery.download': 'Download .txt',
  'recovery.warnStart': 'Keep it',
  'recovery.warnOutside': 'away from this computer',
  'recovery.warnEnd':
    '(on paper or in a trusted manager). Anyone with this key can open your vault. If you lose it together with your password, your secrets are unrecoverable.',
  'recovery.saved': 'I have saved my recovery key in a safe place.',
  'recovery.continue': 'Continue',
  'recovery.copiedTitle': 'Key copied',
  'recovery.copiedBody': 'Paste it somewhere safe and clear it from the clipboard.',
  'recovery.copyFailed': 'Could not copy',
  'recovery.confirmedTitle': 'Recovery key saved',
  'recovery.confirmedBody': 'It will not be shown again.',
  'recovery.fileName': 'secretvault-recovery-key.txt',
  'recovery.fileTitle': 'SecretVault — recovery key',
  'recovery.fileLine1': 'Keep it away from this computer (on paper or in a trusted manager).',
  'recovery.fileLine2': 'Anyone with this key can open your vault: do not share it.',
  'recovery.fileLine3':
    'If you use the key to recover access, a new one is generated and this one stops working.',
};
