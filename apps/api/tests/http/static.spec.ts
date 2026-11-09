/**
 * Tests del servidor de archivos estáticos: MIME types, cache headers,
 * defensa contra path traversal y fallback SPA.
 */
import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from 'hono';
import { serveWebApp } from '../../src/http/static';

let fixtureDir: string | null = null;
afterEach(() => {
  if (fixtureDir) {
    rmSync(fixtureDir, { recursive: true, force: true });
    fixtureDir = null;
  }
});

function makeFixture(): string {
  fixtureDir = mkdtempSync(join(tmpdir(), 'sv-public-'));
  writeFileSync(
    join(fixtureDir, 'index.html'),
    '<!doctype html><html><head><title>SecretVault</title></head></html>',
  );
  writeFileSync(join(fixtureDir, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  mkdirSync(join(fixtureDir, 'assets'));
  writeFileSync(join(fixtureDir, 'assets', 'app-abc123.js'), 'console.log(1)');
  return fixtureDir;
}

function makeApp(publicDir: string): Hono {
  const app = new Hono();
  app.get('*', (c) => serveWebApp(publicDir, c));
  return app;
}

describe('serveWebApp', () => {
  it('should serve files with the correct MIME type', async () => {
    const dir = makeFixture();
    const app = makeApp(dir);

    const html = await app.request('/');
    expect(html.status).toBe(200);
    expect(html.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
    expect(await html.text()).toContain('SecretVault');

    const js = await app.request('/assets/app-abc123.js');
    expect(js.status).toBe(200);
    expect(js.headers.get('Content-Type')).toBe('text/javascript; charset=utf-8');
    expect(js.headers.get('Cache-Control')).toContain('immutable'); // assets con hash

    const svg = await app.request('/favicon.svg');
    expect(svg.headers.get('Content-Type')).toBe('image/svg+xml');
  });

  it('should not cache index.html (deploys inmediatos)', async () => {
    const app = makeApp(makeFixture());
    const res = await app.request('/vault');
    expect(res.headers.get('Cache-Control')).toBe('no-cache');
  });

  it('should fall back to index.html for SPA deep links', async () => {
    const app = makeApp(makeFixture());
    for (const path of ['/vault', '/audit', '/ruta/inexistente']) {
      const res = await app.request(path);
      expect(res.status).toBe(200);
      expect(await res.text()).toContain('SecretVault');
    }
  });

  it('should block path traversal (..) to files outside publicDir', async () => {
    const dir = makeFixture();
    // Archivo SENSIBLE fuera del public dir pero dentro del proyecto.
    const secretPath = join(dir, '..', 'server-secrets.txt');
    writeFileSync(secretPath, 'SECRETO-FUERA-DEL-PUBLIC');
    try {
      const app = makeApp(dir);
      for (const evil of [
        '/..%2F..%2Fserver-secrets.txt',
        '/%2e%2e/server-secrets.txt',
        '/..%5Cserver-secrets.txt',
      ]) {
        const res = await app.request(evil);
        const body = await res.text();
        expect(body).not.toContain('SECRETO-FUERA-DEL-PUBLIC');
      }
    } finally {
      rmSync(secretPath, { force: true });
    }
  });

  it('should return a helpful 404 when the frontend is not built', async () => {
    const emptyDir = mkdtempSync(join(tmpdir(), 'sv-empty-'));
    try {
      const app = makeApp(emptyDir);
      const res = await app.request('/');
      expect(res.status).toBe(404);
      expect(await res.text()).toContain('Frontend no construido');
    } finally {
      rmSync(emptyDir, { recursive: true, force: true });
    }
  });

  it('should decode encoded paths before resolving', async () => {
    const dir = makeFixture();
    mkdirSync(join(dir, 'con espacios'));
    writeFileSync(join(dir, 'con espacios', 'file.txt'), 'contenido');
    const app = makeApp(dir);
    const res = await app.request('/con%20espacios/file.txt');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('contenido');
  });
});
