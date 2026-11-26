import {
  AUTO_LOCK_OPTIONS,
  CLIPBOARD_CLEAR_OPTIONS,
  SESSION_MAX_OPTIONS,
} from '@secretvault/shared';
import type { AuditRepository, SecuritySettingsRepository } from '../ports/repositories';
import type { PasswordConfirmer } from '../ports/password-confirmer';
import type { SessionLimits, SessionLimitsProvider, SessionStore } from '../ports/session';
import type { UnitOfWork } from '../ports/transaction';
import type { SessionSecurity } from '../domain/entities';
import { ValidationFailedError } from '../domain/errors';

export interface SessionSecurityServiceDeps {
  security: SecuritySettingsRepository;
  sessions: SessionStore;
  passwords: PasswordConfirmer;
  audit: AuditRepository;
  unitOfWork: UnitOfWork;
  /** Valores del entorno: rigen mientras no se guarde otra cosa desde Ajustes. */
  defaults: Pick<SessionSecurity, 'autoLockMinutes' | 'sessionMaxMinutes'>;
}

const OPTIONS: Record<keyof SessionSecurity, readonly number[]> = {
  autoLockMinutes: AUTO_LOCK_OPTIONS,
  sessionMaxMinutes: SESSION_MAX_OPTIONS,
  clipboardClearSeconds: CLIPBOARD_CLEAR_OPTIONS,
};

const toLimits = (settings: SessionSecurity): SessionLimits => ({
  idleMinutes: settings.autoLockMinutes,
  maxMinutes: settings.sessionMaxMinutes,
});

export class SessionSecurityService implements SessionLimitsProvider {
  constructor(private readonly deps: SessionSecurityServiceDeps) {}

  async settings(): Promise<SessionSecurity> {
    const saved = await this.deps.security.get();
    return {
      autoLockMinutes: saved.autoLockMinutes ?? this.deps.defaults.autoLockMinutes,
      sessionMaxMinutes: saved.sessionMaxMinutes ?? this.deps.defaults.sessionMaxMinutes,
      clipboardClearSeconds: saved.clipboardClearSeconds,
    };
  }

  async currentLimits(): Promise<SessionLimits> {
    return toLimits(await this.settings());
  }

  /** Exige la contraseña maestra; los límites nuevos alcanzan también a las sesiones abiertas. */
  async update(sessionId: string, password: string, next: SessionSecurity): Promise<void> {
    const previous = await this.settings();
    assertAllowed(next, previous);
    await this.deps.passwords.confirmPassword(sessionId, password);
    await this.deps.unitOfWork.run(async () => {
      const saved = await this.deps.security.get();
      await this.deps.security.save({ ...saved, ...next });
      await this.deps.audit.record('security.settings_changed', describeChange(previous, next));
    });
    await this.deps.sessions.applyLimits(toLimits(next));
  }
}

/** Un valor vigente fuera de la lista (venido del entorno) puede conservarse, no elegirse. */
function assertAllowed(next: SessionSecurity, previous: SessionSecurity): void {
  const issues = (Object.keys(OPTIONS) as (keyof SessionSecurity)[])
    .filter((field) => next[field] !== previous[field] && !OPTIONS[field].includes(next[field]))
    .map((field) => ({ field, message: 'Elige una de las opciones disponibles.' }));
  if (issues.length > 0) throw new ValidationFailedError(issues);
}

function describeChange(from: SessionSecurity, to: SessionSecurity): string {
  return (
    `Ajustes de sesión: bloqueo ${from.autoLockMinutes} → ${to.autoLockMinutes} min, ` +
    `duración máxima ${from.sessionMaxMinutes} → ${to.sessionMaxMinutes} min, ` +
    `portapapeles ${from.clipboardClearSeconds} → ${to.clipboardClearSeconds} s.`
  );
}
