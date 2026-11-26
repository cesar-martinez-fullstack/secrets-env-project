import { beforeEach, describe, expect, it } from 'bun:test';
import { createSensitiveClipboard, type SensitiveClipboard } from '@/lib/sensitive-clipboard';

describe('sensitive clipboard', () => {
  let written: string[];
  let timers: Map<number, { run: () => void; ms: number }>;
  let focusRetry: (() => void) | null;
  let writable: boolean;
  let clipboard: SensitiveClipboard;

  const fire = async () => {
    for (const [id, timer] of [...timers]) {
      timers.delete(id);
      timer.run();
    }
    await Promise.resolve();
    await Promise.resolve();
  };

  beforeEach(() => {
    written = [];
    timers = new Map();
    focusRetry = null;
    writable = true;
    let next = 0;
    clipboard = createSensitiveClipboard({
      write: async (text) => {
        if (writable) written.push(text);
        return writable;
      },
      setTimer: (run, ms) => {
        timers.set(++next, { run, ms });
        return next;
      },
      clearTimer: (id) => void timers.delete(id),
      onNextFocus: (run) => {
        focusRetry = run;
        return () => (focusRetry = null);
      },
    });
  });

  it('should empty the clipboard after the chosen seconds', async () => {
    await clipboard.copy('dato', 30);
    expect([...timers.values()].map((t) => t.ms)).toEqual([30_000]);

    await fire();

    expect(written).toEqual(['dato', '']);
  });

  it('should not schedule anything when cleaning is turned off', async () => {
    await clipboard.copy('dato', 0);
    expect(timers.size).toBe(0);
  });

  it('should keep only the latest countdown', async () => {
    await clipboard.copy('uno', 30);
    await clipboard.copy('dos', 60);
    expect([...timers.values()].map((t) => t.ms)).toEqual([60_000]);
  });

  it('should not wipe what the person copied afterwards inside the app', async () => {
    await clipboard.copy('dato', 30);
    clipboard.forget();
    await fire();
    expect(written).toEqual(['dato']);
  });

  it('should retry on the next focus when the browser refuses to write', async () => {
    await clipboard.copy('dato', 30);
    writable = false;
    await fire();
    expect(written).toEqual(['dato']);

    writable = true;
    focusRetry?.();
    await Promise.resolve();

    expect(written).toEqual(['dato', '']);
  });

  it('should clear immediately on demand only when something is pending', async () => {
    await clipboard.clearNow();
    expect(written).toEqual([]);

    await clipboard.copy('dato', 60);
    await clipboard.clearNow();

    expect(written).toEqual(['dato', '']);
    expect(timers.size).toBe(0);
  });

  it('should report a failed copy and schedule nothing', async () => {
    writable = false;
    expect(await clipboard.copy('dato', 30)).toBe(false);
    expect(timers.size).toBe(0);
  });
});
