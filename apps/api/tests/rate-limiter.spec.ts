/**
 * Tests del rate limiter (ventana fija) con reloj inyectable — deterministas.
 */
import { describe, expect, it } from 'bun:test';
import { RateLimiter } from '../src/rate-limiter';

describe('RateLimiter', () => {
  it('should allow up to the max attempts within the window', () => {
    const t = 0;
    const limiter = new RateLimiter(3, 60_000, () => t);
    expect(limiter.hit('ip').allowed).toBe(true);
    expect(limiter.hit('ip').allowed).toBe(true);
    expect(limiter.hit('ip').allowed).toBe(true);
    const blocked = limiter.hit('ip');
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('should isolate keys (per IP buckets)', () => {
    const t = 0;
    const limiter = new RateLimiter(1, 60_000, () => t);
    expect(limiter.hit('ip-1').allowed).toBe(true);
    expect(limiter.hit('ip-1').allowed).toBe(false);
    expect(limiter.hit('ip-2').allowed).toBe(true); // otro bucket
  });

  it('should open a new window after it expires', () => {
    let t = 0;
    const limiter = new RateLimiter(1, 60_000, () => t);
    expect(limiter.hit('ip').allowed).toBe(true);
    expect(limiter.hit('ip').allowed).toBe(false);

    t = 61_000; // avanza el reloj más allá de la ventana
    const result = limiter.hit('ip');
    expect(result.allowed).toBe(true);
    expect(result.retryAfterSeconds).toBe(60);
  });

  it('should report remaining retry seconds inside the window', () => {
    let t = 0;
    const limiter = new RateLimiter(1, 30_000, () => t);
    limiter.hit('ip');
    t = 10_000;
    expect(limiter.hit('ip')).toEqual({ allowed: false, retryAfterSeconds: 20 });
  });

  it('should reset the counter after a successful attempt', () => {
    const t = 0;
    const limiter = new RateLimiter(2, 60_000, () => t);
    limiter.hit('ip');
    limiter.hit('ip');
    limiter.reset('ip'); // éxito (p.ej. unlock correcto)
    expect(limiter.hit('ip').allowed).toBe(true);
  });
});
