import type { Hono } from 'hono';
import type { AppEnv } from '../../src/middleware/auth';

/** Tipo del app Hono tipado del API (para tests de integración sin red). */
export type AppLike = Hono<AppEnv>;
