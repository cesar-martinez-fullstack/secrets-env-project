/**
 * SecretVault API — punto de entrada.
 *
 * Punto de arranque: carga config, construye el contenedor (DI), sirve HTTP
 * con Bun y programa el barrido de sesiones expiradas (auto-lock por inactividad).
 */
import { loadConfig, loadDotEnv } from './config';
import { createContainer, disposeContainer, type Container } from './container';
import { createApp } from './app';

// Carga explícita de .env (multiplataforma; precedencia: entorno real > .env).
const envFile = loadDotEnv();
const config = loadConfig();
const container: Container = createContainer(config);
const app = createApp(container);

const server = Bun.serve({
  port: config.port,
  hostname: config.host,
  fetch: app.fetch,
  idleTimeout: 60,
  maxRequestBodySize: config.maxBodyBytes,
});

// Auto-lock: purga sesiones inactivas cada 30 s y destruye las claves en RAM.
const sweeper = setInterval(() => {
  void container.sessionStore.purgeExpired();
}, 30_000);
if (typeof sweeper.unref === 'function') sweeper.unref();

// Cierre limpio (Ctrl+C / docker stop).
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

function shutdown() {
  console.log('\n[SecretVault] Cerrando… bloqueando sesiones y liberando la base de datos.');
  void container.sessionStore.clear();
  disposeContainer(container);
  server.stop(true);
  process.exit(0);
}

console.log(`
  ╔══════════════════════════════════════════════════╗
  ║  🔐 SecretVault — gestor local de secretos       ║
  ╠══════════════════════════════════════════════════╣
  ║  API + UI     →  http://localhost:${String(config.port).padEnd(10)}║
  ║  Base de datos →  ${config.dataDir.padEnd(38)}║
  ║  .env cargado →  ${(envFile ?? 'no encontrado (usando defaults)').padEnd(38)}║
  ║  PBKDF2       →  ${config.iterations} iteraciones (SHA-256)     ║
  ║  Auto-lock    →  ${config.autoLockMinutes} min de inactividad           ║
  ║  Cifrado      →  AES-256-GCM (claves solo en RAM)║
  ╚══════════════════════════════════════════════════╝
`);
