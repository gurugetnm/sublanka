import { OVERLAY_TAG } from '../shared/constants';
import overlayCss from './styles.css?inline';

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

function createHost(): HTMLElement {
  const host = document.createElement(OVERLAY_TAG);
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

/** Shows `text` as a subtitle line. Repeated calls update the existing overlay instead of adding another. */
export function showSubtitle(text: string): void {
  const host = findHost() ?? createHost();
  const line = host.shadowRoot?.querySelector('.sublanka-subtitle');
  if (line) line.textContent = text;
  document.addEventListener('fullscreenchange', placeHost);
  if (!host.isConnected) document.documentElement.append(host);
  placeHost();
}

export function hideSubtitle(): void {
  document.removeEventListener('fullscreenchange', placeHost);
  findHost()?.remove();
}
