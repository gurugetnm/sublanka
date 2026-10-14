import { OVERLAY_TAG } from '../shared/constants';
import { DEFAULT_SETTINGS, type SubtitleSettings } from '../shared/settings';
import overlayCss from './styles.css?inline';

export type OverlayAppearance = Pick<SubtitleSettings, 'fontSize' | 'position' | 'background' | 'textColor'>;

let appearance: OverlayAppearance = DEFAULT_SETTINGS;

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

/**
 * Shows `text` (lines separated by "\n"; "" hides the box but keeps the overlay ready).
 * Repeated calls only update the text of the one existing overlay.
 */
export function showSubtitle(text: string): void {
  const host = findHost() ?? createHost();
  const line = host.shadowRoot?.querySelector('.sublanka-subtitle');
  if (line) line.textContent = text;
  if (host.isConnected) return;
  document.addEventListener('fullscreenchange', placeHost);
  document.documentElement.append(host);
  placeHost();
}

export function hideSubtitle(): void {
  document.removeEventListener('fullscreenchange', placeHost);
  findHost()?.remove();
}
