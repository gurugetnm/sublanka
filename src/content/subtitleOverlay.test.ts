import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OVERLAY_TAG } from '../shared/constants';
import { DEFAULT_SETTINGS } from '../shared/settings';
import { hideSubtitle, isSubtitleVisible, setOverlayAppearance, setOverlayVideo, showSubtitle } from './subtitleOverlay';

const subtitleText = () =>
  document.querySelector(OVERLAY_TAG)?.shadowRoot?.querySelector('.sublanka-subtitle')?.textContent;

function setFullscreenElement(element: Element | null) {
  Object.defineProperty(document, 'fullscreenElement', { value: element, configurable: true });
  document.dispatchEvent(new Event('fullscreenchange'));
}

/** A <video> whose rendered box the test controls; jsdom does no layout. */
function videoAt(box: { left: number; top: number; width: number; height: number }) {
  const video = document.createElement('video');
  video.getBoundingClientRect = () => DOMRect.fromRect({ x: box.left, y: box.top, width: box.width, height: box.height });
  document.body.append(video);
  return { video, box };
}

const hostStyle = () => document.querySelector<HTMLElement>(OVERLAY_TAG)?.style;

afterEach(() => {
  hideSubtitle();
  setOverlayVideo(null);
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
    expect(host?.dataset).toMatchObject({ size: 'medium', position: 'medium', background: 'translucent', color: 'white' });

    setOverlayAppearance({ fontSize: 'xlarge', position: 'very-high', background: 'solid', textColor: 'yellow' });
    expect(document.querySelector(OVERLAY_TAG)).toBe(host);
    expect(host?.dataset).toMatchObject({ size: 'xlarge', position: 'very-high', background: 'solid', color: 'yellow' });
  });

  it('creates new overlays with the latest appearance', () => {
    setOverlayAppearance({ fontSize: 'small', position: 'low', background: 'none', textColor: 'yellow' });
    showSubtitle('text');
    expect(document.querySelector<HTMLElement>(OVERLAY_TAG)?.dataset).toMatchObject({ size: 'small', position: 'low', background: 'none', color: 'yellow' });
  });

  it('applies a new vertical position immediately', () => {
    showSubtitle('text');
    const host = document.querySelector<HTMLElement>(OVERLAY_TAG);
    setOverlayAppearance({ ...DEFAULT_SETTINGS, position: 'very-high' });
    expect(host?.dataset.position).toBe('very-high');
    setOverlayAppearance({ ...DEFAULT_SETTINGS, position: 'very-low' });
    expect(host?.dataset.position).toBe('very-low');
  });

  it("covers the video's rendered box, not the viewport", () => {
    const { video } = videoAt({ left: 40, top: 120, width: 640, height: 360 });
    setOverlayVideo(video);
    showSubtitle('text');
    expect(hostStyle()).toMatchObject({ left: '40px', top: '120px', width: '640px', height: '360px' });
  });

  it('follows the video when the page scrolls or resizes', () => {
    const { video, box } = videoAt({ left: 40, top: 120, width: 640, height: 360 });
    showSubtitle('text');
    setOverlayVideo(video);

    box.top = -30;
    document.dispatchEvent(new Event('scroll'));
    expect(hostStyle()?.top).toBe('-30px');

    box.width = 960;
    window.dispatchEvent(new Event('resize'));
    expect(hostStyle()?.width).toBe('960px');
  });

  it('covers the viewport without a video, or when the video has no rendered box', () => {
    const { video } = videoAt({ left: 0, top: 0, width: 0, height: 0 });
    showSubtitle('text');
    expect(hostStyle()?.cssText).toBe('');
    setOverlayVideo(video);
    expect(hostStyle()?.cssText).toBe('');
  });

  it('returns to the viewport when the video is released', () => {
    const { video } = videoAt({ left: 40, top: 120, width: 640, height: 360 });
    setOverlayVideo(video);
    showSubtitle('text');
    setOverlayVideo(null);
    expect(hostStyle()?.cssText).toBe('');
  });

  it('a recreated overlay is fitted to the video again', () => {
    const { video } = videoAt({ left: 40, top: 120, width: 640, height: 360 });
    setOverlayVideo(video);
    showSubtitle('text');
    hideSubtitle();
    showSubtitle('text');
    expect(document.querySelectorAll(OVERLAY_TAG)).toHaveLength(1);
    expect(hostStyle()?.width).toBe('640px');
  });

  it('removes its scroll, resize and fullscreen listeners when hidden', () => {
    const removeWindow = vi.spyOn(window, 'removeEventListener');
    const removeDocument = vi.spyOn(document, 'removeEventListener');
    showSubtitle('text');
    hideSubtitle();
    expect(removeWindow.mock.calls.map(([type]) => type)).toEqual(expect.arrayContaining(['scroll', 'resize']));
    expect(removeDocument.mock.calls.map(([type]) => type)).toContain('fullscreenchange');
    vi.restoreAllMocks();
  });

  it('draws cues pinned with {\\anN} in their own box, apart from the bottom subtitle', () => {
    showSubtitle('dialogue', { 9: '#Credit\nsite.com | 145' });
    const shadow = document.querySelector(OVERLAY_TAG)?.shadowRoot;
    expect(subtitleText()).toBe('dialogue');
    expect(shadow?.querySelector('[data-align="9"]')?.textContent).toBe('#Credit\nsite.com | 145');

    showSubtitle('next line');
    expect(shadow?.querySelector('[data-align="9"]')?.textContent).toBe('');
    expect(subtitleText()).toBe('next line');
    expect(document.querySelectorAll(OVERLAY_TAG)).toHaveLength(1);
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

  it('refits to the fullscreen video and stays on top', () => {
    const { video, box } = videoAt({ left: 40, top: 120, width: 640, height: 360 });
    setOverlayVideo(video);
    showSubtitle('text');

    Object.assign(box, { left: 0, top: 0, width: 1920, height: 1080 });
    enterFullscreen(video);
    expect(topLayer.at(-1)).toBe(overlay());
    expect(overlay()?.parentElement).toBe(document.documentElement);
    expect(hostStyle()).toMatchObject({ left: '0px', top: '0px', width: '1920px', height: '1080px' });

    Object.assign(box, { left: 40, top: 120, width: 640, height: 360 });
    topLayer = topLayer.filter((el) => el !== video);
    setFullscreenElement(null);
    expect(topLayer).toEqual([overlay()]);
    expect(hostStyle()?.width).toBe('640px');
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
