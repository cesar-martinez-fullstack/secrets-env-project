import { describe, expect, it } from 'bun:test';
import { normalizeClientAddress } from '../src/middleware/auth';

describe('normalizeClientAddress', () => {
  it('should treat every loopback address as the same client', () => {
    for (const address of [
      '127.0.0.1',
      '127.0.0.2',
      '127.255.255.254',
      '::1',
      '::ffff:127.0.0.9',
    ]) {
      expect(normalizeClientAddress(address)).toBe('loopback');
    }
  });

  it('should keep other addresses apart, including look-alikes', () => {
    for (const address of ['192.168.1.10', '10.127.0.1', '128.0.0.1', '::2', 'unknown']) {
      expect(normalizeClientAddress(address)).toBe(address);
    }
  });
});
