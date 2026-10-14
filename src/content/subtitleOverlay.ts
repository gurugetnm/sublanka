import { OVERLAY_TAG } from '../shared/constants';
import { DEFAULT_SETTINGS, type SubtitleSettings } from '../shared/settings';
import type { SubtitleLayout } from '../subtitles/types';
import overlayCss from './styles.css?inline';

export type OverlayAppearance = Pick<SubtitleSettings, 'fontSize' | 'position' | 'background' | 'textColor'>;

let appearance: OverlayAppearance = DEFAULT_SETTINGS;
let video: HTMLVideoElement | null = null;
/** Inline box last written to the host, to skip style writes when nothing moved. */
let fittedBox = '';
// jsdom and very old browsers lack ResizeObserver; scroll, resize and fullscreen events still refit.
const videoResize = typeof ResizeObserver === 'function' ? new ResizeObserver(() => fitToVideo()) : null;

// Fullscreen elements that cannot render child elements; the overlay stays hidden behind them.
const NON_CONTAINER_TAGS = new Set(['VIDEO', 'IFRAME', 'CANVAS', 'IMG', 'EMBED', 'OBJECT']);

function findHost(): HTMLElement | null {
  return document.querySelector<HTMLElement>(OVERLAY_TAG);
}

export function isSubtitleVisible(): boolean {
  return findHost() !== null;
}

/**
 * Shows the overlay as a manual popover so it renders in the browser top layer, the only thing
 * painted over a fullscreen element, including a bare <video> that cannot hold children.
 * The top layer paints in show order, so re-showing moves the overlay above whatever entered since.
 * The page's own DOM, video element included, is never touched.
 */
function raiseInTopLayer(host: HTMLElement): boolean {
  if (typeof host.togglePopover !== 'function') return false;
  try {
    host.setAttribute('popover', 'manual');
    host.togglePopover(false);
    host.togglePopover(true);
    return true;
  } catch {
    host.removeAttribute('popover');
    return false;
  }
}

function placeHost(): void {
  const host = findHost();
  if (!host || raiseInTopLayer(host)) return;

  // Fallback without the Popover API: only the fullscreen element's subtree is painted, so move into it.
  const fullscreen = document.fullscreenElement;
  const parent = fullscreen && !NON_CONTAINER_TAGS.has(fullscreen.tagName) ? fullscreen : document.documentElement;
  if (host.parentElement !== parent) parent.append(host);
}

/**
 * Sizes the host to the video's rendered box, so the position setting is a share of the video's height
 * wherever the video is: inline, full-window or fullscreen. Without a visible video it covers the viewport.
 */
function fitToVideo(): void {
  const host = findHost();
  if (!host) return;
  const rect = video?.isConnected ? video.getBoundingClientRect() : null;
  const box =
    rect && rect.width > 0 && rect.height > 0
      ? `left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px`
      : '';
  if (box === fittedBox) return;
  fittedBox = box;
  host.style.cssText = box;
}

function onFullscreenChange(): void {
  placeHost();
  fitToVideo();
}

/** The video the subtitle sits on; null places it on the viewport. */
export function setOverlayVideo(next: HTMLVideoElement | null): void {
  if (next === video) return;
  if (video) videoResize?.unobserve(video);
  video = next;
  if (video) videoResize?.observe(video);
  fitToVideo();
}

/** Appearance is a set of data attributes that styles.css matches with :host([...]) selectors. */
function applyAppearance(host: HTMLElement): void {
  host.dataset.size = appearance.fontSize;
  host.dataset.position = appearance.position;
  host.dataset.background = appearance.background;
  host.dataset.color = appearance.textColor;
}

/** Restyles the overlay in place, without recreating it or leaving the top layer. */
export function setOverlayAppearance(next: OverlayAppearance): void {
  appearance = next;
  const host = findHost();
  if (host) applyAppearance(host);
}

function createHost(): HTMLElement {
  const host = document.createElement(OVERLAY_TAG);
  fittedBox = '';
  applyAppearance(host);
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = overlayCss;
  const line = document.createElement('div');
  line.className = 'sublanka-subtitle';
  line.lang = 'si';
  line.setAttribute('role', 'status');
  shadow.append(style, line);
  return host;
}

/** Sets the boxes for cues the file pins to the top or middle row; a box is created only once it has text. */
function showPlaced(shadow: ShadowRoot, placed: SubtitleLayout['placed']): void {
  for (let align = 4; align <= 9; align++) {
    const text = placed[align] ?? '';
    let box = shadow.querySelector(`[data-align="${align}"]`);
    if (!box && !text) continue;
    if (!box) {
      box = document.createElement('div');
      box.className = 'sublanka-subtitle sublanka-placed';
      box.setAttribute('lang', 'si');
      box.setAttribute('data-align', String(align));
      shadow.append(box);
    }
    box.textContent = text;
  }
}

/**
 * Shows `text` at the chosen position (lines separated by "\n"; "" hides the box but keeps the overlay ready),
 * and `placed` cues where the file put them. Repeated calls only update the text of the one existing overlay.
 */
export function showSubtitle(text: string, placed: SubtitleLayout['placed'] = {}): void {
  const host = findHost() ?? createHost();
  const shadow = host.shadowRoot;
  const line = shadow?.querySelector('.sublanka-subtitle:not(.sublanka-placed)');
  if (line) line.textContent = text;
  if (shadow) showPlaced(shadow, placed);
  if (host.isConnected) return;
  document.addEventListener('fullscreenchange', onFullscreenChange);
  // Capture catches scrolling inside any scroll container, not just the page.
  window.addEventListener('scroll', fitToVideo, { capture: true, passive: true });
  window.addEventListener('resize', fitToVideo);
  document.documentElement.append(host);
  placeHost();
  fitToVideo();
}

export function hideSubtitle(): void {
  document.removeEventListener('fullscreenchange', onFullscreenChange);
  window.removeEventListener('scroll', fitToVideo, { capture: true });
  window.removeEventListener('resize', fitToVideo);
  findHost()?.remove();
}
