import { isLogLevel, type LogLevel } from '@secretvault/shared';
import type { AuditRepository, SecuritySettingsRepository } from '../ports/repositories';
import type { PasswordConfirmer } from '../ports/password-confirmer';
import type { UnitOfWork } from '../ports/transaction';
import type { LogLevelOutput } from '../ports/log-output';
import { ValidationFailedError } from '../domain/errors';

export interface LogLevelServiceDeps {
  security: SecuritySettingsRepository;
  audit: AuditRepository;
  passwords: PasswordConfirmer;
  unitOfWork: UnitOfWork;
  output: LogLevelOutput;
  /** Nivel del entorno: rige mientras no se guarde otro desde Ajustes. */
  defaultLevel: LogLevel;
}

export class LogLevelService {
  constructor(private readonly deps: LogLevelServiceDeps) {}

  async current(): Promise<LogLevel> {
    return (await this.deps.security.get()).logLevel ?? this.deps.defaultLevel;
  }

  async load(): Promise<void> {
    this.deps.output.setLevel(await this.current());
  }

  /** Bajar el detalle oculta actividad, así que exige la contraseña maestra y queda auditado. */
  async change(sessionId: string, password: string, level: string): Promise<void> {
    if (!isLogLevel(level)) {
      throw new ValidationFailedError([
        { field: 'level', message: 'Elige una de las opciones disponibles.' },
      ]);
    }
    const previous = await this.current();
    await this.deps.passwords.confirmPassword(sessionId, password);
    if (level === previous) return;
    await this.deps.unitOfWork.run(async () => {
      const saved = await this.deps.security.get();
      await this.deps.security.save({ ...saved, logLevel: level });
      await this.deps.audit.record(
        'security.settings_changed',
        `Nivel de registro: ${previous} → ${level}.`,
      );
    });
    this.deps.output.setLevel(level);
  }
}
