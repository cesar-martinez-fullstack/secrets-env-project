export type ShareTarget =
  | { kind: 'projects' | 'environments'; id: number; name: string }
  | { kind: 'secrets'; ids: number[]; name: string };
