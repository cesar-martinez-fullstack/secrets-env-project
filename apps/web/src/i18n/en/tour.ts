export const tour = {
  'tour.progress': '{current} of {total}',
  'tour.next': 'Next',
  'tour.back': 'Back',
  'tour.done': 'Finish',
  'tour.skip': 'Skip the tour',
  'tour.sidebar.title': 'Projects and environments',
  'tour.sidebar.body':
    'Group your environments into projects, for example one with development and production. From here you can also share a project or an environment in an encrypted file with a passphrase.',
  'tour.new-secret.title': 'Create secrets',
  'tour.new-secret.body':
    'Add a variable with its value and a note. Values appear masked: reveal them only when needed, and every reveal is recorded in the audit log.',
  'tour.search.title': 'Search instantly',
  'tour.search.body': 'Find secrets by name across all environments as you type.',
  'tour.import.title': 'Import a .env',
  'tour.import.body': 'Paste the contents of a .env file and review the preview before saving.',
  'tour.export.title': 'Export an environment',
  'tour.export.body': 'Download the active environment as .env, CSV, JSON or PDF.',
  'tour.security.title': 'Security',
  'tour.security.body':
    'Change the master password or generate a new recovery key. You can repeat this tour from Settings.',
} as const;
