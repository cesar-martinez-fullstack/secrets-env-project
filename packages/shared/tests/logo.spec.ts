import { describe, expect, it } from 'bun:test';
import { LOGO_MAX_BYTES, detectLogoType } from '../src/logo';

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0];
const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1];
const WEBP = [0x52, 0x49, 0x46, 0x46, 0x24, 0, 0, 0, 0x57, 0x45, 0x42, 0x50];
const bytes = (values: number[]): Uint8Array => Uint8Array.from(values);

describe('detectLogoType', () => {
  it('should recognise PNG, JPEG and WebP by their signature', () => {
    expect(detectLogoType(bytes(PNG))).toBe('image/png');
    expect(detectLogoType(bytes(JPEG))).toBe('image/jpeg');
    expect(detectLogoType(bytes(WEBP))).toBe('image/webp');
  });

  it('should reject SVG and HTML, which can carry scripts', () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    const html = new TextEncoder().encode('<html><script>alert(1)</script></html>');
    expect(detectLogoType(svg)).toBeNull();
    expect(detectLogoType(html)).toBeNull();
  });

  it('should reject a RIFF container that is not WebP', () => {
    const wave = [0x52, 0x49, 0x46, 0x46, 0x24, 0, 0, 0, 0x57, 0x41, 0x56, 0x45];
    expect(detectLogoType(bytes(wave))).toBeNull();
  });

  it('should reject empty and truncated input', () => {
    expect(detectLogoType(new Uint8Array())).toBeNull();
    expect(detectLogoType(bytes([0x89, 0x50]))).toBeNull();
  });

  it('should keep the size limit small enough for a logo', () => {
    expect(LOGO_MAX_BYTES).toBeLessThanOrEqual(512 * 1024);
  });
});
