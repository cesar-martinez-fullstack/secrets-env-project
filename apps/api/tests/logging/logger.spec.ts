import { describe, expect, it } from 'bun:test';
import { createLogger, type Logger } from '../../src/logging/logger';

function capture(level: Parameters<typeof createLogger>[0]['level'] = 'debug') {
  const lines: string[] = [];
  const logger: Logger = createLogger({
    level,
    write: (line) => lines.push(line),
    now: () => new Date('2026-01-02T03:04:05.000Z'),
  });
  return { lines, logger, last: () => JSON.parse(lines.at(-1)!) as Record<string, unknown> };
}

describe('logger', () => {
  it('should write one JSON object per line with time, level and event', () => {
    const { lines, logger, last } = capture();

    logger.info('server.started', { port: 3000 });

    expect(lines).toHaveLength(1);
    expect(lines[0]).not.toContain('\n');
    expect(last()).toEqual({
      time: '2026-01-02T03:04:05.000Z',
      level: 'info',
      event: 'server.started',
      port: 3000,
    });
  });

  it('should drop entries below the current level and follow level changes', () => {
    const { lines, logger } = capture('warn');

    logger.debug('a');
    logger.info('b');
    logger.warn('c');
    logger.error('d');
    expect(lines).toHaveLength(2);

    logger.setLevel('debug');
    logger.debug('e');
    expect(lines).toHaveLength(3);
  });

  it.each([
    'masterPassword',
    'currentPassword',
    'passphrase',
    'recoveryKey',
    'secretValue',
    'value',
    'note',
    'cookie',
    'authorization',
    'sessionToken',
  ])('should redact a field called %s', (field) => {
    const { lines, logger, last } = capture();

    logger.info('x', { [field]: 'dato-que-no-debe-salir' });

    expect(lines[0]).not.toContain('dato-que-no-debe-salir');
    expect(last()[field]).toBe('[REDACTED]');
  });

  it('should keep line breaks inside a field from forging a new entry', () => {
    const { lines, logger } = capture();

    logger.info('x', { route: 'a\n{"level":"error"}' });

    expect(lines[0]!.split('\n')).toHaveLength(1);
  });

  it('should not let a field overwrite the time, level or event', () => {
    const { logger, last } = capture();

    logger.info('real', { event: 'falso', level: 'falso', time: 'falso' });

    expect(last()).toMatchObject({ event: 'real', level: 'info' });
  });
});
