/** Quien comprueba la contraseña maestra de una sesión (un único punto de verificación). */
export interface PasswordConfirmer {
  confirmPassword(sessionId: string, password: string): Promise<void>;
}
