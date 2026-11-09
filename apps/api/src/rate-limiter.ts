/**
 * Rate limiter de ventana fija, en memoria. Protege unlock / setup /
 * change-password contra fuerza bruta contra la contraseña maestra.
 */
export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

/** Umbral a partir del cual se purgan buckets vencidos. */
const MAX_BUCKETS = 1_000;

export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    /** Reloj inyectable para tests deterministas. */
    private readonly now: () => number = Date.now,
  ) {}

  /** Registra un intento y dice si está permitido. */
  hit(key: string): RateLimitResult {
    const now = this.now();
    if (this.buckets.size > MAX_BUCKETS) this.prune(now);
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
      return { allowed: true, retryAfterSeconds: Math.ceil(this.windowMs / 1000) };
    }
    bucket.count++;
    if (bucket.count > this.max) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
      };
    }
    return { allowed: true, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) };
  }

  /** Elimina buckets vencidos: evita crecimiento sin límite del mapa. */
  private prune(now: number): void {
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
  }

  /** Limpia el contador tras un intento exitoso. */
  reset(key: string): void {
    this.buckets.delete(key);
  }
}
