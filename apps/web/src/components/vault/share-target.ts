export interface ShareTarget {
  kind: 'projects' | 'environments';
  id: number;
  name: string;
}
