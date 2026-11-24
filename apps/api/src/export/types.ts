import type { ExportEntry } from '@secretvault/core';

export interface ExportInput {
  environmentName: string;
  generatedAt: Date;
  entries: ExportEntry[];
  iterations: number;
}
