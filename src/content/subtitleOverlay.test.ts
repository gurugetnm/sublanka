import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OVERLAY_TAG } from '../shared/constants';
import { DEFAULT_SETTINGS } from '../shared/settings';
import { hideSubtitle, isSubtitleVisible, setOverlayAppearance, showSubtitle } from './subtitleOverlay';

const subtitleText = () =>
  document.querySelector(OVERLAY_TAG)?.shadowRoot?.querySelector('.sublanka-subtitle')?.textContent;

function setFullscreenElement(element: Element | null) {
  Object.defineProperty(document, 'fullscreenElement', { value: element, configurable: true });
  document.dispatchEvent(new Event('fullscreenchange'));
}

afterEach(() => {
  hideSubtitle();
  setOverlayAppearance(DEFAULT_SETTINGS);
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

  it('keeps multiline text as separate lines', () => {
    showSubtitle('පළමු පේළිය\nදෙවන පේළිය');
    expect(subtitleText()).toBe('පළමු පේළිය\nදෙවන පේළිය');
  });

  it('applies appearance to the existing overlay without recreating it', () => {
    showSubtitle('text');
    const host = document.querySelector<HTMLElement>(OVERLAY_TAG);
    expect(host?.dataset).toMatchObject({ size: 'medium', position: 'bottom', background: 'translucent', color: 'white' });

    setOverlayAppearance({ fontSize: 'xlarge', position: 'high', background: 'solid', textColor: 'yellow' });
    expect(document.querySelector(OVERLAY_TAG)).toBe(host);
    expect(host?.dataset).toMatchObject({ size: 'xlarge', position: 'high', background: 'solid', color: 'yellow' });
  });

  it('creates new overlays with the latest appearance', () => {
    setOverlayAppearance({ fontSize: 'small', position: 'raised', background: 'none', textColor: 'yellow' });
    showSubtitle('text');
    expect(document.querySelector<HTMLElement>(OVERLAY_TAG)?.dataset).toMatchObject({ size: 'small', position: 'raised', background: 'none', color: 'yellow' });
  });

  it('removes the overlay and tolerates repeated hides', () => {
    showSubtitle('text');
    hideSubtitle();
    hideSubtitle();
    expect(isSubtitleVisible()).toBe(false);
  });

  it('without the Popover API, follows a fullscreen container and returns afterwards', () => {
    const player = document.createElement('div');
    document.body.append(player);
    showSubtitle('text');

    setFullscreenElement(player);
    expect(document.querySelector(OVERLAY_TAG)?.parentElement).toBe(player);

    setFullscreenElement(null);
    expect(document.querySelector(OVERLAY_TAG)?.parentElement).toBe(document.documentElement);
  });

  it('without the Popover API, stays at the document root when a bare <video> is fullscreen', () => {
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

describe('subtitle overlay in the top layer (Popover API available)', () => {
  // jsdom has no Popover API; this fakes the top layer's show-order stacking.
  let topLayer: Element[];

  function enterFullscreen(element: Element) {
    topLayer.push(element);
    setFullscreenElement(element);
  }

  beforeEach(() => {
    topLayer = [];
    HTMLElement.prototype.togglePopover = function (this: HTMLElement, force?: unknown) {
      topLayer = topLayer.filter((el) => el !== this);
      if (force === true && this.isConnected) topLayer.push(this);
      return force === true;
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(HTMLElement.prototype, 'togglePopover');
  });

  const overlay = () => document.querySelector(OVERLAY_TAG);

  it('shows the overlay as a manual popover at the document root', () => {
    showSubtitle('text');
    expect(overlay()?.getAttribute('popover')).toBe('manual');
    expect(topLayer).toEqual([overlay()]);
    expect(overlay()?.parentElement).toBe(document.documentElement);
  });

  it('stays above a fullscreen bare <video> without moving the video', () => {
    document.body.innerHTML = '<div id="player"><video></video></div>';
    const video = document.querySelector('video') as HTMLVideoElement;
    showSubtitle('text');

    enterFullscreen(video);
    expect(topLayer.at(-1)).toBe(overlay());
    expect(video.parentElement?.id).toBe('player');
    expect(overlay()?.parentElement).toBe(document.documentElement);
  });

  it('stays above a fullscreen container without reparenting', () => {
    const player = document.createElement('div');
    document.body.append(player);
    showSubtitle('text');

    enterFullscreen(player);
    expect(topLayer.at(-1)).toBe(overlay());
    expect(player.querySelector(OVERLAY_TAG)).toBeNull();
  });

  it('remains visible after fullscreen exits', () => {
    const video = document.createElement('video');
    document.body.append(video);
    showSubtitle('text');
    enterFullscreen(video);

    topLayer = topLayer.filter((el) => el !== video);
    setFullscreenElement(null);
    expect(topLayer).toEqual([overlay()]);
    expect(isSubtitleVisible()).toBe(true);
  });

  it('does not re-raise after being hidden', () => {
    showSubtitle('text');
    hideSubtitle();
    topLayer = [];
    enterFullscreen(document.createElement('video'));
    expect(topLayer.some((el) => el.tagName.toLowerCase() === OVERLAY_TAG)).toBe(false);
  });

  it('does not re-toggle the popover on every subtitle text change', () => {
    showSubtitle('one');
    const toggle = vi.spyOn(HTMLElement.prototype, 'togglePopover');
    showSubtitle('two');
    showSubtitle('');
    expect(toggle).not.toHaveBeenCalled();
    expect(topLayer).toEqual([overlay()]);
  });

  it('keeps its place in the top layer when the appearance changes', () => {
    const video = document.createElement('video');
    document.body.append(video);
    showSubtitle('text');
    enterFullscreen(video);
    setOverlayAppearance({ ...DEFAULT_SETTINGS, fontSize: 'large' });
    expect(topLayer.at(-1)).toBe(overlay());
  });

  it('falls back to following a fullscreen container if showing the popover fails', () => {
    HTMLElement.prototype.togglePopover = () => {
      throw new DOMException('not supported', 'NotSupportedError');
    };
    const player = document.createElement('div');
    document.body.append(player);
    showSubtitle('text');
    expect(overlay()?.hasAttribute('popover')).toBe(false);

    setFullscreenElement(player);
    expect(overlay()?.parentElement).toBe(player);
  });
});
