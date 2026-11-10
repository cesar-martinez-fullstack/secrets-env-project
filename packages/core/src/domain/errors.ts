/**
 * Errores de dominio. Cada uno lleva un código de error estable del protocolo
 * y un status HTTP sugerido; la capa HTTP solo los traduce.
 */
import type { ApiErrorCode, ValidationIssue } from '@secretvault/shared';

export class DomainError extends Error {
  constructor(
    public readonly code: ApiErrorCode,
    message: string,
    public readonly status: number = 400,
    public readonly issues?: ValidationIssue[],
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export class VaultNotInitializedError extends DomainError {
  constructor() {
    super(
      'VAULT_NOT_INITIALIZED',
      'La bóveda aún no ha sido configurada. Crea una contraseña maestra.',
      409,
    );
  }
}

export class VaultAlreadyInitializedError extends DomainError {
  constructor() {
    super('VAULT_ALREADY_INITIALIZED', 'La bóveda ya fue configurada previamente.', 409);
  }
}

export class VaultLockedError extends DomainError {
  constructor() {
    super('VAULT_LOCKED', 'La bóveda está bloqueada. Ingresa tu contraseña maestra.', 401);
  }
}

export class InvalidMasterPasswordError extends DomainError {
  constructor() {
    super('INVALID_MASTER_PASSWORD', 'Contraseña maestra incorrecta.', 401);
  }
}

export class InvalidRecoveryKeyError extends DomainError {
  constructor() {
    super('INVALID_RECOVERY_KEY', 'La clave de recuperación no es válida.', 401);
  }
}

export class RecoveryNotAvailableError extends DomainError {
  constructor() {
    super(
      'RECOVERY_NOT_AVAILABLE',
      'Esta bóveda aún no tiene clave de recuperación: desbloquéala una vez con tu contraseña para generarla.',
      409,
    );
  }
}

export class WeakMasterPasswordError extends DomainError {
  constructor(issues: ValidationIssue[]) {
    super(
      'WEAK_MASTER_PASSWORD',
      'La contraseña maestra no cumple los requisitos mínimos.',
      400,
      issues,
    );
  }
}

export class ProjectNotFoundError extends DomainError {
  constructor(id: number) {
    super('PROJECT_NOT_FOUND', `El proyecto #${id} no existe.`, 404);
  }
}

export class ProjectNameRequiredError extends DomainError {
  constructor() {
    super('PROJECT_NAME_REQUIRED', 'El nombre del proyecto es obligatorio.', 400);
  }
}

export class ProjectNameTakenError extends DomainError {
  constructor(name: string) {
    super('PROJECT_NAME_TAKEN', `Ya existe un proyecto llamado «${name}».`, 409);
  }
}

export class ProjectNotEmptyError extends DomainError {
  constructor(name: string, environmentCount: number) {
    super(
      'PROJECT_NOT_EMPTY',
      `El proyecto «${name}» tiene ${environmentCount} ambiente(s). Elimínalos o muévelos antes de borrarlo.`,
      409,
    );
  }
}

export class EnvironmentNotFoundError extends DomainError {
  constructor(id: number) {
    super('ENVIRONMENT_NOT_FOUND', `El ambiente #${id} no existe.`, 404);
  }
}

export class EnvironmentNameTakenError extends DomainError {
  constructor(name: string) {
    super('ENVIRONMENT_NAME_TAKEN', `Ya existe un ambiente llamado «${name}».`, 409);
  }
}

export class EnvironmentNameRequiredError extends DomainError {
  constructor() {
    super('ENVIRONMENT_NAME_REQUIRED', 'El nombre del ambiente es obligatorio.', 400);
  }
}

export class SecretNotFoundError extends DomainError {
  constructor(id: number) {
    super('SECRET_NOT_FOUND', `El secreto #${id} no existe.`, 404);
  }
}

export class SecretNameTakenError extends DomainError {
  constructor(name: string) {
    super('SECRET_NAME_TAKEN', `Ya existe un secreto llamado «${name}» en este ambiente.`, 409);
  }
}

export class SecretNameRequiredError extends DomainError {
  constructor() {
    super('SECRET_NAME_REQUIRED', 'El nombre del secreto es obligatorio.', 400);
  }
}

export class SecretNameInvalidError extends DomainError {
  constructor(issues: ValidationIssue[]) {
    super('SECRET_NAME_INVALID', 'El nombre del secreto no es válido.', 400, issues);
  }
}

export class SecretValueRequiredError extends DomainError {
  constructor() {
    super('SECRET_VALUE_REQUIRED', 'El valor del secreto es obligatorio.', 400);
  }
}

export class ValidationFailedError extends DomainError {
  constructor(issues: ValidationIssue[]) {
    super('VALIDATION_FAILED', 'Datos inválidos.', 400, issues);
  }
}
