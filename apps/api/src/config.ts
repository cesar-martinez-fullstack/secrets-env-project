/**
 * Configuración del backend, leída de variables de entorno con valores por defecto
 * pensados para desarrollo local y para el contenedor Docker.
 *
 * Carga de `.env` multiplataforma sin `cross-env`: además de aceptar variables del
 * entorno real (cualquier shell), esta función carga explícitamente el primer `.env`
 * encontrado desde cwd hacia arriba (soporta monorepo y el binario compilado).
 * Precedencia estándar: entorno real > .env.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  parseEnvContent,
  DEFAULT_AUTO_LOCK_MINUTES,
  DEFAULT_PBKDF2_ITERATIONS,
} from '@secretvault/shared';

const MAX_DOTENV_LEVELS = 4;

/**
 * Carga el primer archivo `.env` encontrado (cwd → raíces superiores) en el entorno
 * del proceso. Devuelve la ruta cargada o null. Las variables ya presentes en el
 * entorno real NO se sobrescriben (convención estándar de dotenv).
 */
export function loadDotEnv(
  currentEnv: Record<string, string | undefined> = Bun.env,
): string | null {
  const explicit = currentEnv.SV_ENV_FILE;
  let file: string | null = null;

  if (explicit) {
    const candidate = resolve(explicit);
    if (existsSync(candidate)) file = candidate;
  } else {
    let dir = resolve('.');
    for (let level = 0; level < MAX_DOTENV_LEVELS && !file; level++) {
      const candidate = join(dir, '.env');
      if (existsSync(candidate)) {
        file = candidate;
        break;
      }
      const parent = resolve(dir, '..');
      if (parent === dir) break;
      dir = parent;
    }
  }
  if (!file) return null;

  try {
    let raw = readFileSync(file, 'utf8');
    if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1); // BOM de Windows
    for (const { name, value } of parseEnvContent(raw).entries) {
      if (currentEnv[name] === undefined) currentEnv[name] = value;
    }
    return file;
  } catch {
    return null; // archivo ilegible: continúa con el entorno real y los defaults
  }
}

export interface ApiConfig {
  port: number;
  host: string;
  /** Directorio del archivo secrets.db (montado como volumen en Docker). */
  dataDir: string;
  /** Directorio con el frontend compilado (vite build). */
  publicDir: string;
  /** Minutos de inactividad antes del auto-lock (borra la clave de RAM). */
  autoLockMinutes: number;
  /** Iteraciones PBKDF2 para derivar la clave AES-256. */
  iterations: number;
  /** Cookie de sesión con flag Secure (activar tras HTTPS). */
  cookieSecure: boolean;
  /** Confiar en X-Forwarded-For (detrás de un proxy inverso). */
  trustProxy: boolean;
  /**
   * Hosts aceptados en la cabecera Host/Origin (anti DNS-rebinding). Siempre incluye
   * loopback; `SV_ALLOWED_HOSTS` solo añade extras (p. ej. un dominio local propio).
   */
  allowedHosts: readonly string[];
  /** Tamaño máximo del body HTTP en bytes (anti agotamiento de memoria). */
  maxBodyBytes: number;
  /** Vida máxima ABSOLUTA de una sesión, aunque haya actividad (minutos). */
  sessionMaxMinutes: number;
  isProduction: boolean;
}

/** Hosts de loopback: lo único aceptado por defecto (la app es solo para este equipo). */
export const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]'] as const;

function parseHostList(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter((h) => h.length > 0);
}

/**
 * Carpeta del SPA compilado cuando no se fija `SV_PUBLIC_DIR`: `./public` (binario y Docker)
 * o `./apps/api/public` (salida de `bun run build:web` al correr desde la raíz del monorepo).
 */
function defaultPublicDir(): string {
  const candidates = [resolve('public'), resolve('apps', 'api', 'public')];
  return candidates.find((dir) => existsSync(join(dir, 'index.html'))) ?? candidates[0]!;
}

function toInt(value: string | undefined, fallback: number): number {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/**
 * Detecta la combinación peligrosa de apartarse de loopback (bind o `Host` aceptado)
 * sin exigir `Secure` en la cookie de sesión: la sesión viajaría en texto plano por
 * esa red. No bloquea el arranque (hay usos válidos tras un proxy sin TLS en una red
 * propia de confianza), pero no debe pasar en silencio.
 */
export function insecureExposureWarning(
  config: Pick<ApiConfig, 'host' | 'allowedHosts' | 'cookieSecure'>,
): string | null {
  if (config.cookieSecure) return null;
  const loopback = new Set<string>(LOOPBACK_HOSTS);
  const exposedHost = !loopback.has(config.host.toLowerCase());
  const exposedAllowedHost = config.allowedHosts.some((h) => !loopback.has(h));
  if (!exposedHost && !exposedAllowedHost) return null;
  return (
    'La cookie de sesión no tiene el flag Secure (SV_COOKIE_SECURE=false) pero la app ' +
    'acepta un host fuera de loopback. La sesión viajaría sin cifrar en esa red. ' +
    'Activa SV_COOKIE_SECURE=true detrás de HTTPS, o vuelve HOST/SV_ALLOWED_HOSTS a loopback.'
  );
}

export function loadConfig(env: Record<string, string | undefined> = Bun.env): ApiConfig {
  const port = clamp(toInt(env.PORT, 3000), 1, 65_535);
  const isProduction = env.NODE_ENV === 'production';
  return {
    port,
    // Solo loopback por defecto: la bóveda no debe ser alcanzable desde la red.
    host: env.HOST ?? '127.0.0.1',
    dataDir: env.SV_DATA_DIR ? resolve(env.SV_DATA_DIR) : resolve('data'),
    publicDir: env.SV_PUBLIC_DIR ? resolve(env.SV_PUBLIC_DIR) : defaultPublicDir(),
    autoLockMinutes: clamp(toInt(env.SV_AUTO_LOCK_MINUTES, DEFAULT_AUTO_LOCK_MINUTES), 1, 1440),
    iterations: clamp(
      toInt(env.SV_PBKDF2_ITERATIONS, DEFAULT_PBKDF2_ITERATIONS),
      100_000,
      2_000_000,
    ),
    cookieSecure: env.SV_COOKIE_SECURE === 'true',
    trustProxy: env.SV_TRUST_PROXY === 'true',
    allowedHosts: [...new Set([...LOOPBACK_HOSTS, ...parseHostList(env.SV_ALLOWED_HOSTS)])],
    maxBodyBytes: clamp(toInt(env.SV_MAX_BODY_KB, 2048), 16, 20_480) * 1024,
    sessionMaxMinutes: clamp(toInt(env.SV_SESSION_MAX_HOURS, 12), 1, 168) * 60,
    isProduction,
  };
}
