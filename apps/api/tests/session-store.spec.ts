/**
 * Tests del almacén de sesiones en memoria: ciclo de vida, expiración,
 * rotación de clave e higienización (zeroKey) al destruir sesiones.
 */
import { describe, expect, it } from 'bun:test';
import { NodeCryptoService, zeroKey } from '@secretvault/crypto';
import { InMemorySessionStore } from '../src/session-store';

const crypto = new NodeCryptoService();
const KEY_A = new Uint8Array(32).fill(1);
const KEY_B = new Uint8Array(32).fill(2);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('InMemorySessionStore', () => {
  it('should create a session with a unique opaque token and TTL', async () => {
    const store = new InMemorySessionStore(crypto);
    const a = await store.create(KEY_A, 15);
    const b = await store.create(KEY_B, 15);

    expect(a.sessionId).not.toBe(b.sessionId);
    expect(a.sessionId).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 bytes base64url
    expect(a.expiresAt.getTime()).toBeGreaterThan(a.createdAt.getTime());
    expect(await store.count()).toBe(2);
  });

  it('should return the session with its key while alive', async () => {
    const store = new InMemorySessionStore(crypto);
    const session = await store.create(KEY_A, 15);
    const loaded = await store.get(session.sessionId);
    expect(Buffer.from(loaded!.key).equals(Buffer.from(KEY_A))).toBe(true);
  });

  it('should slide the expiration window on touch', async () => {
    const store = new InMemorySessionStore(crypto);
    const session = await store.create(KEY_A, 15);
    const before = session.expiresAt.getTime();
    await sleep(10);
    const touched = await store.touch(session.sessionId, 15);
    expect(touched!.expiresAt.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('should reject expired sessions and purge them (auto-lock por inactividad)', async () => {
    const store = new InMemorySessionStore(crypto);
    const session = await store.create(KEY_A, 0.001); // 60 ms
    await sleep(250);
    expect(await store.purgeExpired()).toBe(1); // el barrido la elimina
    expect(await store.get(session.sessionId)).toBeNull(); // y ya no existe
    expect(await store.count()).toBe(0);
  });

  it('should destroy the key (zeroed) when a session is removed', async () => {
    const store = new InMemorySessionStore(crypto);
    const session = await store.create(KEY_A, 15);
    await store.remove(session.sessionId);
    expect(await store.get(session.sessionId)).toBeNull();
    expect(KEY_A.every((b) => b === 0)).toBe(true); // zeroKey aplicado sobre la referencia
    expect(await store.count()).toBe(0);
  });

  it('should return null for unknown session ids', async () => {
    const store = new InMemorySessionStore(crypto);
    expect(await store.get('no-existe')).toBeNull();
    expect(await store.touch('no-existe', 15)).toBeNull();
  });

  it('should not resurrect sessions removed twice', async () => {
    const store = new InMemorySessionStore(crypto);
    const session = await store.create(KEY_A, 15);
    await store.remove(session.sessionId);
    await store.remove(session.sessionId);
    expect(await store.count()).toBe(0);
  });
});

describe('zeroKey util', () => {
  it('should zero arrays of any length', () => {
    const key = new Uint8Array(16).fill(255);
    zeroKey(key);
    expect(key.every((b) => b === 0)).toBe(true);
  });
});
