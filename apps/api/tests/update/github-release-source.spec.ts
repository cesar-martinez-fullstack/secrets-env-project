import { describe, expect, it } from 'bun:test';
import { UpdateCheckFailedError } from '@secretvault/core';
import { GithubReleaseSource, LATEST_RELEASE_URL } from '../../src/update/github-release-source';

const OFFICIAL =
  'https://github.com/cesar-martinez-fullstack/secrets-env-project/releases/tag/v0.3.0';

function sourceReplying(response: Response | (() => Promise<Response>)) {
  const calls: { url: string; init: RequestInit }[] = [];
  const source = new GithubReleaseSource(async (url, init) => {
    calls.push({ url, init });
    return typeof response === 'function' ? response() : response;
  });
  return { source, calls };
}

const jsonResponse = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), init);

describe('GithubReleaseSource', () => {
  it('should read the tag and the page of the latest release', async () => {
    const { source } = sourceReplying(jsonResponse({ tag_name: 'v0.3.0', html_url: OFFICIAL }));

    expect(await source.latestRelease()).toEqual({ tag: 'v0.3.0', url: OFFICIAL });
  });

  it('should only ever call the fixed releases URL, without credentials or redirects', async () => {
    const { source, calls } = sourceReplying(
      jsonResponse({ tag_name: 'v0.3.0', html_url: OFFICIAL }),
    );

    await source.latestRelease();

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(LATEST_RELEASE_URL);
    expect(LATEST_RELEASE_URL.startsWith('https://api.github.com/repos/')).toBe(true);
    expect(calls[0]!.init).toMatchObject({ method: 'GET', redirect: 'error', credentials: 'omit' });
    expect(calls[0]!.init.signal).toBeInstanceOf(AbortSignal);
    expect(calls[0]!.init.body).toBeUndefined();
    expect(Object.keys(calls[0]!.init.headers as object).map((key) => key.toLowerCase())).toEqual([
      'accept',
      'user-agent',
    ]);
  });

  it('should return null when no release is published or it is a draft or pre-release', async () => {
    expect(
      await sourceReplying(new Response('{}', { status: 404 })).source.latestRelease(),
    ).toBeNull();
    for (const flags of [{ draft: true }, { prerelease: true }]) {
      const reply = jsonResponse({ tag_name: 'v0.3.0', html_url: OFFICIAL, ...flags });

      expect(await sourceReplying(reply).source.latestRelease()).toBeNull();
    }
  });

  it('should fail on server errors, rate limits, network errors and timeouts', async () => {
    const failing = [
      sourceReplying(new Response('', { status: 500 })),
      sourceReplying(new Response('', { status: 403 })),
      sourceReplying(async () => {
        throw new TypeError('fetch failed');
      }),
      sourceReplying(async () => {
        throw new DOMException('timeout', 'TimeoutError');
      }),
    ];

    for (const { source } of failing) {
      await expect(source.latestRelease()).rejects.toThrow(UpdateCheckFailedError);
    }
  });

  it('should fail on malformed or unexpected bodies', async () => {
    const bodies = [
      'no es json',
      '[]',
      'null',
      '{"tag_name":5,"html_url":"x"}',
      '{"tag_name":"v1"}',
    ];

    for (const body of bodies) {
      const { source } = sourceReplying(new Response(body));

      await expect(source.latestRelease()).rejects.toThrow(UpdateCheckFailedError);
    }
  });

  it('should refuse oversized responses, declared or streamed', async () => {
    const huge = 'x'.repeat(150_000);
    const declared = new Response('{}', { headers: { 'content-length': '150000' } });
    const streamed = new Response(JSON.stringify({ tag_name: 'v1.0.0', html_url: huge }));

    await expect(sourceReplying(declared).source.latestRelease()).rejects.toThrow(
      UpdateCheckFailedError,
    );
    await expect(sourceReplying(streamed).source.latestRelease()).rejects.toThrow(
      UpdateCheckFailedError,
    );
  });
});
