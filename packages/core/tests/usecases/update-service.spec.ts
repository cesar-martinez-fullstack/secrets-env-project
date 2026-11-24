import { beforeEach, describe, expect, it } from 'bun:test';
import { UpdateCheckFailedError } from '../../src/domain/errors';
import { UpdateService } from '../../src/usecases/update-service';
import type { ReleaseSource } from '../../src/ports/release-source';
import { mockAuditRepo, type MockAuditRepo } from '../helpers/mocks';

const OFFICIAL = 'https://github.com/cesar-martinez-fullstack/secrets-env-project/releases/tag';
const NOW = new Date('2026-11-24T10:00:00Z');

function serviceFor(
  latest: Awaited<ReturnType<ReleaseSource['latestRelease']>>,
  audit: MockAuditRepo,
) {
  return new UpdateService({
    source: { latestRelease: async () => latest },
    audit: audit.repo,
    currentVersion: '0.2.0',
    now: () => NOW,
  });
}

describe('UpdateService', () => {
  let audit: MockAuditRepo;

  beforeEach(() => {
    audit = mockAuditRepo();
  });

  it('should report a newer stable version with its release page and audit the check', async () => {
    const service = serviceFor({ tag: 'v0.3.0', url: `${OFFICIAL}/v0.3.0` }, audit);

    const result = await service.check();

    expect(result).toEqual({
      currentVersion: '0.2.0',
      latestVersion: '0.3.0',
      updateAvailable: true,
      releaseUrl: `${OFFICIAL}/v0.3.0`,
      checkedAt: NOW,
    });
    expect(audit.record).toHaveBeenCalledWith('update.checked', expect.stringContaining('0.3.0'));
  });

  it('should say there is no update when the installed version is the latest or newer', async () => {
    for (const tag of ['v0.2.0', 'v0.1.5']) {
      const result = await serviceFor({ tag, url: `${OFFICIAL}/${tag}` }, audit).check();

      expect(result.updateAvailable).toBe(false);
    }
  });

  it('should fail without auditing when there is no release, the tag is odd or the URL is foreign', async () => {
    const cases = [
      null,
      { tag: 'nightly', url: `${OFFICIAL}/nightly` },
      { tag: 'v0.3.0-rc.1', url: `${OFFICIAL}/v0.3.0-rc.1` },
      { tag: 'v0.3.0', url: 'https://evil.example/releases/tag/v0.3.0' },
    ];

    for (const latest of cases) {
      await expect(serviceFor(latest, audit).check()).rejects.toThrow(UpdateCheckFailedError);
    }
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('should let a source failure through untouched', async () => {
    const service = new UpdateService({
      source: {
        latestRelease: async () => {
          throw new UpdateCheckFailedError();
        },
      },
      audit: audit.repo,
      currentVersion: '0.2.0',
    });

    await expect(service.check()).rejects.toThrow(UpdateCheckFailedError);
  });
});
