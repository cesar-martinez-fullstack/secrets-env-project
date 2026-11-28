import { LOG_LEVELS, type LogLevel } from '@secretvault/shared';

export type LogFields = Record<string, string | number | boolean | null | undefined>;

export interface Logger {
  debug(event: string, fields?: LogFields): void;
  info(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
  error(event: string, fields?: LogFields): void;
  setLevel(level: LogLevel): void;
}

export interface LoggerOptions {
  level: LogLevel;
  write: (line: string) => void;
  now?: () => Date;
}

// Segunda barrera: quien registra ya elige campos inocuos (ADR-0014).
const SENSITIVE_FIELD = /password|passphrase|secret|token|cookie|authorization|key|value|note/i;

function redact(fields: LogFields): LogFields {
  return Object.fromEntries(
    Object.entries(fields).map(([name, value]) => [
      name,
      SENSITIVE_FIELD.test(name) ? '[REDACTED]' : value,
    ]),
  );
}

export function createLogger({ level, write, now = () => new Date() }: LoggerOptions): Logger {
  let threshold = LOG_LEVELS.indexOf(level);

  const emit =
    (entryLevel: LogLevel) =>
    (event: string, fields: LogFields = {}) => {
      if (LOG_LEVELS.indexOf(entryLevel) < threshold) return;
      const base = { time: now().toISOString(), level: entryLevel, event };
      write(JSON.stringify({ ...base, ...redact(fields), ...base }));
    };

  return {
    debug: emit('debug'),
    info: emit('info'),
    warn: emit('warn'),
    error: emit('error'),
    setLevel: (next) => {
      threshold = LOG_LEVELS.indexOf(next);
    },
  };
}
