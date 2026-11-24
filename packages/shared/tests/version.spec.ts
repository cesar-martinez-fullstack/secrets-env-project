import { describe, expect, it } from 'bun:test';
import { isNewerVersion, normalizeReleaseUrl, normalizeVersion } from '../src/version';

describe('normalizeVersion', () => {
  it('should accept stable versions with or without the v prefix', () => {
    expect(normalizeVersion('v0.2.0')).toBe('0.2.0');
    expect(normalizeVersion('1.10.3')).toBe('1.10.3');
    expect(normalizeVersion(' v2.0.0 ')).toBe('2.0.0');
  });

  it('should reject pre-releases, build metadata and anything that is not X.Y.Z', () => {
    for (const raw of ['0.3.0-rc.1', '1.0.0+build', '1.0', 'latest', '', 'v1.2.3.4', '1.2.x']) {
      expect(normalizeVersion(raw)).toBeNull();
    }
  });
});

describe('isNewerVersion', () => {
  it('should compare each part numerically, not as text', () => {
    expect(isNewerVersion('0.10.0', '0.9.0')).toBe(true);
    expect(isNewerVersion('1.0.0', '0.99.99')).toBe(true);
    expect(isNewerVersion('0.2.1', '0.2.0')).toBe(true);
  });

  it('should be false for equal or older versions', () => {
    expect(isNewerVersion('0.2.0', '0.2.0')).toBe(false);
    expect(isNewerVersion('0.1.9', '0.2.0')).toBe(false);
    expect(isNewerVersion('0.9.0', '0.10.0')).toBe(false);
  });

  it('should be false when either side is not a stable version', () => {
    expect(isNewerVersion('2.0.0-rc.1', '1.0.0')).toBe(false);
    expect(isNewerVersion('2.0.0', 'desconocida')).toBe(false);
  });
});

describe('normalizeReleaseUrl', () => {
  const base = 'https://github.com/cesar-martinez-fullstack/secrets-env-project/releases';

  it('should accept the release pages of the official repository', () => {
    expect(normalizeReleaseUrl(`${base}/tag/v0.2.0`)).toBe(`${base}/tag/v0.2.0`);
  });

  it('should return the normalized URL, so what is validated is exactly what is emitted', () => {
    expect(normalizeReleaseUrl(`${base}/tag/v0.2.0/../v0.3.0`)).toBe(`${base}/tag/v0.3.0`);
    expect(normalizeReleaseUrl(`${base}/tag/v0.2.0\n`)).toBe(`${base}/tag/v0.2.0`);
    expect(normalizeReleaseUrl(`HTTPS://GitHub.com${base.slice(18)}/tag/v1`)).toBe(
      `${base}/tag/v1`,
    );
  });

  it('should reject other hosts, schemes, repositories and look-alike URLs', () => {
    for (const url of [
      'http://github.com/cesar-martinez-fullstack/secrets-env-project/releases/tag/v1',
      'https://evil.example/cesar-martinez-fullstack/secrets-env-project/releases/tag/v1',
      'https://github.com.evil.example/cesar-martinez-fullstack/secrets-env-project/releases/x',
      'https://github.com@evil.example/cesar-martinez-fullstack/secrets-env-project/releases/x',
      'https://user:pass@github.com/cesar-martinez-fullstack/secrets-env-project/releases/x',
      'https://github.com:8443/cesar-martinez-fullstack/secrets-env-project/releases/x',
      'https://github.com/otra-persona/otro-repo/releases/tag/v1',
      'https://github.com/cesar-martinez-fullstack/secrets-env-project/issues/1',
      'javascript:alert(1)',
      'no es una url',
      '',
    ]) {
      expect(normalizeReleaseUrl(url)).toBeNull();
    }
  });
});
