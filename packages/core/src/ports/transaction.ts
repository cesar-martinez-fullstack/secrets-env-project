/**
 * Puerto de transacciones (Unit of Work). Garantiza ATOMICIDAD: o se aplican todas
 * las escrituras hechas dentro de `work`, o ninguna (si `work` lanza, se revierte).
 *
 * Uso típico: rotación de contraseña (re-cifrar N secretos + nuevo verificador) o
 * importación masiva. No admite anidamiento.
 */
export interface UnitOfWork {
  run<T>(work: () => Promise<T>): Promise<T>;
}
