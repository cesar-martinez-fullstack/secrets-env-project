import type { io as base } from '../es/io';

export const io: Record<keyof typeof base, string> = {
  'import.title': 'Import variables (.env)',
  'import.leadStart': 'Paste the contents of a',
  'import.leadMiddle': 'file to import it into the environment',
  'import.leadEnd': '. Each value is encrypted with AES-256-GCM when saved.',
  'import.valid': '{count} valid variable(s)',
  'import.duplicates': '{count} duplicate(s) (the last one wins)',
  'import.invalid': '{count} invalid line(s)',
  'import.overwrite': 'Overwrite existing',
  'import.overwriteHint':
    'If a variable already exists in the environment, its value is replaced. If off, it is skipped.',
  'import.submit': 'Import',
  'import.doneTitle': 'Import completed',
  'import.nothingChanged': 'Nothing changed.',
  'import.failed': 'Import failed',
  'import.created': '{count} new',
  'import.updated': '{count} updated',
  'import.skipped': '{count} skipped',
  'import.summary': '{parts} in «{env}».',

  'audit.back': 'Back to the vault',
  'audit.title': 'Audit history',
  'audit.total': '{count} event(s)',
  'audit.emptyTitle': 'No events yet',
  'audit.emptyDescription':
    'Creations, edits, deletions, reveals and exports will be recorded here.',
  'audit.loadMore': 'Load more',

  'shareExport.title': 'Share «{name}»',
  'shareExport.scopeProject': 'the whole project',
  'shareExport.scopeEnv': 'this environment',
  'shareExport.lead':
    'An encrypted file is generated with {scope}, its environments and its secrets. Whoever receives it needs the passphrase to open it in their SecretVault.',
  'shareExport.passphrase': 'Passphrase',
  'shareExport.hide': 'Hide',
  'shareExport.show': 'Show',
  'shareExport.hidePassphrase': 'Hide the passphrase',
  'shareExport.showPassphrase': 'Show the passphrase',
  'shareExport.generate': 'Generate',
  'shareExport.hint':
    'At least {min} characters. SecretVault does not keep it: if it is lost, the file cannot be opened.',
  'shareExport.warning':
    'Whoever has the file and the passphrase will have access to these secrets and it cannot be revoked. Share the passphrase through a different channel than the file.',
  'shareExport.download': 'Download file',
  'shareExport.doneTitle': 'File generated',
  'shareExport.doneBody':
    'Send the passphrase to the other person through a different channel than the file.',
  'shareExport.failed': 'Could not share',

  'shareImport.title': 'Import a shared file',
  'shareImport.file': 'File (.svshare)',
  'shareImport.passphrase': 'Passphrase',
  'shareImport.open': 'Open file',
  'shareImport.openFailed': 'Could not open the file',
  'shareImport.importIn': 'Import into',
  'shareImport.newProject': 'New project «{name}»',
  'shareImport.newProjectHint':
    'If you already have a project with that name, the new one gets a number at the end.',
  'shareImport.secrets': '{count} secret(s)',
  'shareImport.exists': 'An environment with this name already exists.',
  'shareImport.merge': 'Merge with the existing one',
  'shareImport.separate': 'Create a separate one',
  'shareImport.alreadyThere': 'Already there:',
  'shareImport.willCreate': 'It will be created in the project.',
  'shareImport.conflictLegend': 'If a variable already exists',
  'shareImport.skip': 'Skip it',
  'shareImport.replace': 'Overwrite it',
  'shareImport.markNote': 'Received secrets are marked «Imported» until you edit their value.',
  'shareImport.submit': 'Import',
  'shareImport.failed': 'Could not import',
  'shareImport.doneTitle': 'Import completed',
  'shareImport.doneBody': '«{project}»: {parts}.',

  'picker.search': 'Search project',
  'picker.none': 'No project matches.',
};
