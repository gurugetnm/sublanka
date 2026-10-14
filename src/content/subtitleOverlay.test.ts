import { afterEach, describe, expect, it } from 'vitest';
import { OVERLAY_TAG } from '../shared/constants';
import { hideSubtitle, isSubtitleVisible, showSubtitle } from './subtitleOverlay';

const subtitleText = () =>
  document.querySelector(OVERLAY_TAG)?.shadowRoot?.querySelector('.sublanka-subtitle')?.textContent;

function setFullscreenElement(element: Element | null) {
  Object.defineProperty(document, 'fullscreenElement', { value: element, configurable: true });
  document.dispatchEvent(new Event('fullscreenchange'));
}

afterEach(() => {
  hideSubtitle();
  setFullscreenElement(null);
  document.body.innerHTML = '';
});

describe('subtitle overlay', () => {
  it('renders Sinhala text without touching page content', () => {
    document.body.innerHTML = '<p id="page">page</p>';
    showSubtitle('මම කවදාවත්');
    expect(isSubtitleVisible()).toBe(true);
    expect(subtitleText()).toBe('මම කවදාවත්');
    expect(document.getElementById('page')?.textContent).toBe('page');
  });

  it('treats text as text, not HTML', () => {
    showSubtitle('<img src=x onerror=alert(1)>');
    expect(subtitleText()).toBe('<img src=x onerror=alert(1)>');
    expect(document.querySelector(OVERLAY_TAG)?.shadowRoot?.querySelector('img')).toBeNull();
  });

  it('never creates duplicate overlays on repeated activation', () => {
    showSubtitle('one');
    showSubtitle('two');
    showSubtitle('two');
    expect(document.querySelectorAll(OVERLAY_TAG)).toHaveLength(1);
    expect(subtitleText()).toBe('two');
  });

  it('removes the overlay and tolerates repeated hides', () => {
    showSubtitle('text');
    hideSubtitle();
    hideSubtitle();
    expect(isSubtitleVisible()).toBe(false);
  });

  it('follows the fullscreen element and returns afterwards', () => {
    const player = document.createElement('div');
    document.body.append(player);
    showSubtitle('text');

    setFullscreenElement(player);
    expect(document.querySelector(OVERLAY_TAG)?.parentElement).toBe(player);

    setFullscreenElement(null);
    expect(document.querySelector(OVERLAY_TAG)?.parentElement).toBe(document.documentElement);
  });

  it('stays at the document root when a bare <video> is fullscreen', () => {
    const video = document.createElement('video');
    document.body.append(video);
    showSubtitle('text');
    setFullscreenElement(video);
    expect(document.querySelector(OVERLAY_TAG)?.parentElement).toBe(document.documentElement);
  });

  it('stops following fullscreen after being hidden', () => {
    const player = document.createElement('div');
    document.body.append(player);
    showSubtitle('text');
    hideSubtitle();
    setFullscreenElement(player);
    expect(player.querySelector(OVERLAY_TAG)).toBeNull();
  });
});
