/**
 * Servidor de archivos estáticos del SPA (vite build) con fallback a index.html
 * para deep links. Escrito a mano (sin dependencias) para funcionar igual en
 * `bun dev` y dentro del binario compilado.
 */
import { statSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import type { Context } from 'hono';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json',
  '.pdf': 'application/pdf',
};

export function serveWebApp(publicDir: string, c: Context): Response {
  const pathname = decodePathname(new URL(c.req.url).pathname);
  if (pathname === null) return new Response('Solicitud inválida', { status: 400 });

  // Rutas del API no resueltas → 404 JSON.
  if (pathname.startsWith('/api/')) {
    return c.json(
      { error: { code: 'NOT_FOUND', message: `Ruta no encontrada: ${pathname}` } },
      404,
      { 'Cache-Control': 'no-store' },
    );
  }

  const candidate = safeJoin(publicDir, pathname);
  if (candidate && isFile(candidate)) {
    const ext = extname(candidate).toLowerCase();
    const type = MIME_TYPES[ext] ?? 'application/octet-stream';
    // Los assets de Vite llevan hash en el nombre: cache inmutable.
    const isImmutable = pathname.startsWith('/assets/');
    return new Response(Bun.file(candidate), {
      headers: {
        'Content-Type': type,
        'Cache-Control': isImmutable ? 'public, max-age=31536000, immutable' : 'no-cache',
      },
    });
  }

  // SPA: cualquier otra ruta → index.html (si existe el frontend compilado).
  const indexPath = join(publicDir, 'index.html');
  if (isFile(indexPath)) {
    return new Response(Bun.file(indexPath), {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache',
      },
    });
  }

  return new Response(
    'Frontend no construido. Ejecuta `bun run build:web` o levanta el dev server de Vite.',
    { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
  );
}

function decodePathname(raw: string): string | null {
  try {
    return decodeURIComponent(raw);
  } catch {
    return null; // secuencia %XX mal formada
  }
}

function safeJoin(publicDir: string, pathname: string): string | null {
  // El pathname de la URL siempre es absoluto ('/x/y'): se vuelve relativo
  // ANTES de normalizar para no falsificar el chequeo de prefijo.
  const relative = normalize(pathname.replace(/^\/+/, '')).replaceAll('\\', '/');
  if (relative.length === 0 || relative.includes('..') || relative.startsWith('/')) return null;
  const joined = join(publicDir, relative);
  // Doble defensa contra path traversal: el resultado debe quedar DENTRO del public dir.
  const root = normalize(publicDir);
  if (!joined.startsWith(root + sep) && joined !== root) return null;
  return joined;
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}
