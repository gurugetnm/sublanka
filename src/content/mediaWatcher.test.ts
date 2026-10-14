import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMediaWatcher } from './mediaWatcher';

const WATCH = 'https://www.netflix.com/watch/80021959';
const NEXT = 'https://www.netflix.com/watch/80021960';
const EPISODE = '<div data-uia="video-title"><h4>Stranger Things</h4><span>S1:E3</span><span>Chapter Three</span></div>';

let url: string;
let watcher: ReturnType<typeof createMediaWatcher>;
const showLabel = (html: string) => (document.body.innerHTML = html);

beforeEach(() => {
  vi.useFakeTimers();
  document.title = 'Netflix';
  document.body.innerHTML = '';
  url = WATCH;
  watcher = createMediaWatcher(document, () => url, { retryMs: 500, attempts: 4, watchMs: 2000 });
});

afterEach(() => {
  watcher.stop();
  vi.useRealTimers();
});

describe('createMediaWatcher', () => {
  it('answers at once when the title is already rendered', async () => {
    showLabel(EPISODE);
    await expect(watcher.detect()).resolves.toMatchObject({ title: 'Stranger Things', season: 1, episode: 3, confidence: 'high' });
  });

  it('retries for a title that renders late', async () => {
    const result = watcher.detect();
    await vi.advanceTimersByTimeAsync(600);
    showLabel(EPISODE);
    await vi.advanceTimersByTimeAsync(500);
    await expect(result).resolves.toMatchObject({ title: 'Stranger Things' });
  });

  it('gives up after a bounded number of tries when no title appears', async () => {
    const result = watcher.detect();
    await vi.advanceTimersByTimeAsync(1500);
    await expect(result).resolves.toBeNull();
  });

  it('remembers the last title for the same URL after the player controls hide', async () => {
    showLabel(EPISODE);
    await vi.advanceTimersByTimeAsync(2000); // background read while the controls are visible
    showLabel('<video></video>');
    await expect(watcher.detect()).resolves.toMatchObject({ title: 'Stranger Things' });
  });

  it('forgets the title after client-side navigation to the next episode', async () => {
    showLabel(EPISODE);
    await vi.advanceTimersByTimeAsync(2000);
    showLabel('<video></video>');
    url = NEXT;
    const result = watcher.detect();
    await vi.advanceTimersByTimeAsync(2000);
    await expect(result).resolves.toBeNull();
  });

  it('cancels a pending detection when the user navigates away', async () => {
    const result = watcher.detect();
    await vi.advanceTimersByTimeAsync(100);
    url = 'https://www.netflix.com/browse';
    showLabel(EPISODE);
    await vi.advanceTimersByTimeAsync(500);
    await expect(result).resolves.toBeNull();
  });

  it('does not retry on ordinary pages', async () => {
    url = 'https://example.com/film';
    document.title = 'Arrival (2016)';
    await expect(watcher.detect()).resolves.toMatchObject({ title: 'Arrival', year: 2016, source: 'page-title' });
    document.title = '';
    await expect(watcher.detect()).resolves.toBeNull();
  });
});
