/**
 * Tests unitarios de las validaciones compartidas — dominio puro, sin mocks.
 */
import { describe, expect, it } from 'bun:test';
import {
  normalizeName,
  passwordStrength,
  validateEnvironmentName,
  validateProjectName,
  validateMasterPassword,
  validateSecretName,
  validateSecretNote,
  validateSecretValue,
} from '../src/validation';

describe('validateMasterPassword', () => {
  it('should accept a password with 10+ characters', () => {
    expect(validateMasterPassword('MiClaveMaestra!')).toEqual([]);
  });

  it('should reject a password shorter than the minimum', () => {
    const issues = validateMasterPassword('corta123');
    expect(issues.length).toBe(1);
    expect(issues[0]?.field).toBe('masterPassword');
    expect(issues[0]?.message).toContain('al menos');
  });

  it('should reject an oversized password', () => {
    const issues = validateMasterPassword('a'.repeat(129));
    expect(issues.length).toBe(1);
    expect(issues[0]?.message).toContain('No puede exceder');
  });

  it('should accept the exact minimum boundary', () => {
    expect(validateMasterPassword('a'.repeat(10))).toEqual([]);
  });
});

describe('passwordStrength', () => {
  it('should score 0 for empty passwords', () => {
    expect(passwordStrength('')).toBe(0);
  });

  it('should score low for short passwords', () => {
    expect(passwordStrength('abc')).toBeLessThanOrEqual(1);
  });

  it('should score maximum for long mixed passwords', () => {
    expect(passwordStrength('Str0ng!Passphrase-2024')).toBe(4);
  });

  it('should reward length over complexity', () => {
    expect(passwordStrength('aaaaaaaaaaaaaaaaaaaa')).toBeGreaterThanOrEqual(
      passwordStrength('Ab1!'),
    );
  });
});

describe('validateSecretName', () => {
  it('should accept classic env-var names', () => {
    expect(validateSecretName('DATABASE_URL')).toEqual([]);
    expect(validateSecretName('_PRIVATE_KEY')).toEqual([]);
    expect(validateSecretName('app.config.debug')).toEqual([]);
    expect(validateSecretName('SMTP-HOST')).toEqual([]);
  });

  it('should reject empty names', () => {
    const issues = validateSecretName('   ');
    expect(issues[0]?.message).toContain('obligatorio');
  });

  it('should reject names starting with a digit', () => {
    expect(validateSecretName('1PASSWORD').length).toBeGreaterThan(0);
  });

  it('should reject names with spaces or special characters', () => {
    expect(validateSecretName('MY KEY').length).toBeGreaterThan(0);
    expect(validateSecretName('KEY$').length).toBeGreaterThan(0);
    expect(validateSecretName('KEY/SLASH').length).toBeGreaterThan(0);
  });

  it('should reject oversized names', () => {
    expect(validateSecretName('A'.repeat(101)).length).toBeGreaterThan(0);
  });
});

describe('validateSecretValue', () => {
  it('should reject empty values', () => {
    expect(validateSecretValue('')[0]?.message).toContain('obligatorio');
  });

  it('should accept any non-empty value', () => {
    expect(validateSecretValue('p@ssw0rd con espacios y símbolos ¡ñ!')).toEqual([]);
  });

  it('should reject values beyond the maximum length', () => {
    expect(validateSecretValue('x'.repeat(100_001)).length).toBeGreaterThan(0);
  });
});

describe('validateSecretNote', () => {
  it('should accept empty notes', () => {
    expect(validateSecretNote('')).toEqual([]);
  });

  it('should reject oversized notes', () => {
    expect(validateSecretNote('n'.repeat(2001)).length).toBeGreaterThan(0);
  });
});

describe('validateEnvironmentName', () => {
  it('should accept normal environment names', () => {
    expect(validateEnvironmentName('Local')).toEqual([]);
    expect(validateEnvironmentName('QA')).toEqual([]);
    expect(validateEnvironmentName('Production')).toEqual([]);
  });

  it('should reject empty names', () => {
    expect(validateEnvironmentName('')[0]?.message).toContain('obligatorio');
  });

  it('should reject oversized names', () => {
    expect(validateEnvironmentName('E'.repeat(41)).length).toBeGreaterThan(0);
  });

  it('should reject line breaks and other control characters', () => {
    expect(validateEnvironmentName('QA\n[FAKE] vault.unlock').length).toBeGreaterThan(0);
    expect(validateEnvironmentName('QA\u0000').length).toBeGreaterThan(0);
  });
});

describe('validateProjectName', () => {
  it('should accept normal project names', () => {
    expect(validateProjectName('Tienda online')).toEqual([]);
  });

  it('should reject line breaks and other control characters', () => {
    expect(validateProjectName('x\r\n[FAKE] vault.unlock').length).toBeGreaterThan(0);
    expect(validateProjectName('tab\there').length).toBeGreaterThan(0);
  });
});

describe('normalizeName', () => {
  it('should trim and lowercase for duplicate detection', () => {
    expect(normalizeName('  Local ')).toBe('local');
    expect(normalizeName('LOCAL')).toBe('local');
  });
});
