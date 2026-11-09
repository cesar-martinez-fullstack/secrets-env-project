/**
 * Unit of Work sobre SQLite: transacción `BEGIN IMMEDIATE … COMMIT | ROLLBACK`.
 *
 * - Atomicidad: si `work` lanza, se revierte TODO lo escrito dentro.
 * - Serialización: las unidades de trabajo se encolan, de modo que dos transacciones
 *   nunca se solapan sobre la única conexión (SQLite no admite BEGIN anidados).
 * - Sin anidamiento: llamar `run` desde dentro de `work` provocaría un interbloqueo;
 *   se detecta y falla de inmediato en vez de colgarse.
 */
import type { UnitOfWork } from '@secretvault/core';
import type { SqliteDatabase } from './sqlite';

export class SqliteUnitOfWork implements UnitOfWork {
  private tail: Promise<unknown> = Promise.resolve();
  private active = false;

  constructor(private readonly db: SqliteDatabase) {}

  run<T>(work: () => Promise<T>): Promise<T> {
    if (this.active) {
      return Promise.reject(new Error('UnitOfWork anidado: no soportado (interbloqueo).'));
    }
    const execute = async (): Promise<T> => {
      this.active = true;
      this.db.exec('BEGIN IMMEDIATE');
      try {
        const result = await work();
        this.db.exec('COMMIT');
        return result;
      } catch (error) {
        this.db.exec('ROLLBACK');
        throw error;
      } finally {
        this.active = false;
      }
    };
    const next = this.tail.then(execute, execute);
    this.tail = next.catch(() => undefined);
    return next;
  }
}
