import { MAX_ENVIRONMENT_NAME_LENGTH, validateEnvironmentName } from '@secretvault/shared';

export interface ImportDestination {
  mode: 'current' | 'new';
  projectId: number | null;
  name: string;
}

export const CURRENT_ENVIRONMENT: ImportDestination = {
  mode: 'current',
  projectId: null,
  name: '',
};

const FALLBACK_NAME = 'Postman';

/** Para un archivo de Postman se propone un ambiente nuevo con su nombre, ya recortado y limpio. */
export function newEnvironmentDestination(
  sourceName: string | null,
  projectId: number | null,
): ImportDestination {
  const cleaned = (sourceName ?? '').replace(/\p{Cc}/gu, ' ').trim();
  const name = cleaned.slice(0, MAX_ENVIRONMENT_NAME_LENGTH).trim() || FALLBACK_NAME;
  return { mode: 'new', projectId, name };
}

export function isDestinationReady(
  destination: ImportDestination,
  activeEnvironmentId: number | null,
): boolean {
  if (destination.mode === 'current') return activeEnvironmentId !== null;
  return destination.projectId !== null && validateEnvironmentName(destination.name).length === 0;
}
