/**
 * Mapa de iconos inline (trazo, estilo lucide) — sin dependencias externas.
 */
export const ICONS = {
  lock: [
    '<rect width="18" height="11" x="3" y="11" rx="2"/>',
    '<path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  ],
  unlock: [
    '<rect width="18" height="11" x="3" y="11" rx="2"/>',
    '<path d="M7 11V7a5 5 0 0 1 9.9-1.4"/>',
  ],
  key: [
    '<circle cx="7.5" cy="15.5" r="5.5"/>',
    '<path d="m21 2-9.6 9.6"/>',
    '<path d="m15.5 7.5 3 3L22 7l-3-3"/>',
  ],
  shield: [
    '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1 1 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
  ],
  eye: [
    '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>',
    '<circle cx="12" cy="12" r="3"/>',
  ],
  'eye-off': [
    '<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/>',
    '<path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/>',
    '<path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/>',
    '<line x1="2" x2="22" y1="2" y2="22"/>',
  ],
  copy: [
    '<rect width="14" height="14" x="8" y="8" rx="2"/>',
    '<path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  ],
  check: ['<path d="M20 6 9 17l-5-5"/>'],
  plus: ['<path d="M5 12h14"/>', '<path d="M12 5v14"/>'],
  search: ['<circle cx="11" cy="11" r="8"/>', '<path d="m21 21-4.3-4.3"/>'],
  sun: [
    '<circle cx="12" cy="12" r="4"/>',
    '<path d="M12 2v2"/>',
    '<path d="M12 20v2"/>',
    '<path d="m4.93 4.93 1.41 1.41"/>',
    '<path d="m17.66 17.66 1.41 1.41"/>',
    '<path d="M2 12h2"/>',
    '<path d="M20 12h2"/>',
    '<path d="m6.34 17.66-1.41 1.41"/>',
    '<path d="m19.07 4.93-1.41 1.41"/>',
  ],
  moon: ['<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>'],
  'chevron-down': ['<path d="m6 9 6 6 6-6"/>'],
  trash: [
    '<path d="M3 6h18"/>',
    '<path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>',
    '<path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  ],
  pencil: ['<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>'],
  download: [
    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>',
    '<path d="m7 10 5 5 5-5"/>',
    '<path d="M12 15V3"/>',
  ],
  upload: [
    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>',
    '<path d="m17 8-5-5-5 5"/>',
    '<path d="M12 3v12"/>',
  ],
  'file-text': [
    '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/>',
    '<path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
    '<path d="M16 13H8"/>',
    '<path d="M16 17H8"/>',
  ],
  history: [
    '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>',
    '<path d="M3 3v5h5"/>',
    '<path d="M12 7v5l4 2"/>',
  ],
  x: ['<path d="M18 6 6 18"/>', '<path d="m6 6 12 12"/>'],
  alert: [
    '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>',
    '<path d="M12 9v4"/>',
    '<path d="M12 17h.01"/>',
  ],
  folder: [
    '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  ],
  dice: [
    '<rect width="18" height="18" x="3" y="3" rx="2"/>',
    '<circle cx="8" cy="8" r="1"/>',
    '<circle cx="16" cy="8" r="1"/>',
    '<circle cx="8" cy="16" r="1"/>',
    '<circle cx="16" cy="16" r="1"/>',
    '<circle cx="12" cy="12" r="1"/>',
  ],
  'log-out': [
    '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>',
    '<path d="m16 17 5-5-5-5"/>',
    '<path d="M21 12H9"/>',
  ],
  info: ['<circle cx="12" cy="12" r="10"/>', '<path d="M12 16v-4"/>', '<path d="M12 8h.01"/>'],
  'arrow-left': ['<path d="m12 19-7-7 7-7"/>', '<path d="M19 12H5"/>'],
  database: [
    '<ellipse cx="12" cy="5" rx="9" ry="3"/>',
    '<path d="M3 5v14a9 3 0 0 0 18 0V5"/>',
    '<path d="M3 12a9 3 0 0 0 18 0"/>',
  ],
  sticky: [
    '<path d="M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3Z"/>',
    '<path d="M14 3v6h7"/>',
  ],
  clock: ['<circle cx="12" cy="12" r="10"/>', '<path d="M12 6v6l4 2"/>'],
  share: [
    '<circle cx="18" cy="5" r="3"/>',
    '<circle cx="6" cy="12" r="3"/>',
    '<circle cx="18" cy="19" r="3"/>',
    '<path d="m8.6 13.5 6.8 4"/>',
    '<path d="m15.4 6.5-6.8 4"/>',
  ],
  loader: ['<path d="M21 12a9 9 0 1 1-6.219-8.56"/>'],
} as const;

export type IconName = keyof typeof ICONS;
