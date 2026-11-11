import { beforeEach, describe, expect, it, jest } from 'bun:test';
import { DEFAULT_APPEARANCE, LOGO_MAX_BYTES } from '@secretvault/shared';
import { SettingsService } from '../../src/usecases/settings-service';
import { LogoInvalidError, ValidationFailedError } from '../../src/domain/errors';
import type { InstanceSettings } from '../../src/domain/entities';
import type { SettingsRepository } from '../../src/ports/repositories';
import { mockAuditRepo } from '../helpers/mocks';

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const NOW = new Date('2026-03-01T10:00:00.000Z');

describe('SettingsService', () => {
  let stored: InstanceSettings;
  let repo: SettingsRepository;
  let save: ReturnType<typeof jest.fn>;
  let audit: ReturnType<typeof mockAuditRepo>;
  let service: SettingsService;

  beforeEach(() => {
    stored = { logo: null, appearance: DEFAULT_APPEARANCE };
    save = jest.fn(async (next: InstanceSettings) => {
      stored = next;
    });
    repo = { load: async () => stored, save } as SettingsRepository;
    audit = mockAuditRepo();
    service = new SettingsService({ settings: repo, audit: audit.repo, now: () => NOW });
  });

  describe('setLogo', () => {
    it('should store a valid image with its detected type and the current time', async () => {
      await service.setLogo(PNG);

      expect(stored.logo).toEqual({ mimeType: 'image/png', data: PNG, updatedAt: NOW });
      expect(audit.record).toHaveBeenCalledWith('settings.logo_changed', expect.any(String));
    });

    it('should reject content that is not PNG, JPEG or WebP', async () => {
      const svg = new TextEncoder().encode('<svg onload="alert(1)"></svg>');

      await expect(service.setLogo(svg)).rejects.toThrow(LogoInvalidError);
      expect(save).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('should reject an empty file', async () => {
      await expect(service.setLogo(new Uint8Array())).rejects.toThrow(LogoInvalidError);
    });

    it('should reject an image over the size limit', async () => {
      const huge = new Uint8Array(LOGO_MAX_BYTES + 1);
      huge.set(PNG);

      await expect(service.setLogo(huge)).rejects.toThrow(LogoInvalidError);
      expect(save).not.toHaveBeenCalled();
    });

    it('should accept an image of exactly the size limit', async () => {
      const edge = new Uint8Array(LOGO_MAX_BYTES);
      edge.set(PNG);

      await service.setLogo(edge);

      expect(stored.logo?.data.byteLength).toBe(LOGO_MAX_BYTES);
    });

    it('should not write the image bytes into the audit message', async () => {
      await service.setLogo(PNG);

      const message = String(audit.record.mock.calls[0]?.[1]);
      expect(message).not.toMatch(/\d{2,}/);
    });
  });

  describe('removeLogo', () => {
    it('should clear the logo and audit it', async () => {
      stored = {
        logo: { mimeType: 'image/png', data: PNG, updatedAt: NOW },
        appearance: DEFAULT_APPEARANCE,
      };

      await service.removeLogo();

      expect(stored.logo).toBeNull();
      expect(audit.record).toHaveBeenCalledWith('settings.logo_removed', expect.any(String));
    });

    it('should do nothing when there is no logo', async () => {
      await service.removeLogo();

      expect(save).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });
  });

  describe('updateAppearance', () => {
    const valid = { appName: '  Mi Bóveda  ', accent: 'teal', defaultTheme: 'dark' } as const;

    it('should store the trimmed name, accent and default theme and audit it', async () => {
      await service.updateAppearance(valid);

      expect(stored.appearance).toEqual({
        appName: 'Mi Bóveda',
        accent: 'teal',
        defaultTheme: 'dark',
      });
      expect(audit.record).toHaveBeenCalledWith('settings.appearance_changed', expect.any(String));
    });

    it('should keep the logo when the appearance changes', async () => {
      stored = { ...stored, logo: { mimeType: 'image/png', data: PNG, updatedAt: NOW } };

      await service.updateAppearance(valid);

      expect(stored.logo?.mimeType).toBe('image/png');
    });

    it.each([
      ['an empty name', { ...valid, appName: '   ' }],
      ['a name over the limit', { ...valid, appName: 'x'.repeat(41) }],
      ['a name with a line break', { ...valid, appName: 'a\nb' }],
      ['an unknown accent', { ...valid, accent: 'red; background: url(x)' }],
      ['an unknown theme', { ...valid, defaultTheme: 'sepia' }],
    ])('should reject %s', async (_label, input) => {
      await expect(
        service.updateAppearance(
          input as unknown as Parameters<typeof service.updateAppearance>[0],
        ),
      ).rejects.toThrow(ValidationFailedError);
      expect(save).not.toHaveBeenCalled();
    });
  });

  describe('get', () => {
    it('should return the stored settings', async () => {
      stored = {
        logo: { mimeType: 'image/png', data: PNG, updatedAt: NOW },
        appearance: DEFAULT_APPEARANCE,
      };

      expect((await service.get()).logo?.mimeType).toBe('image/png');
    });
  });
});
