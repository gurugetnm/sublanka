import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Tabs } from './Tabs';
import { ErrorBox, FilePicker } from './ui';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const render = (node: ReactNode) => act(async () => root.render(node));

/** jsdom has no DragEvent/DataTransfer, so a plain event carries the files React reads. */
function drop(target: Element, files: File[]) {
  const event = Object.assign(new Event('drop', { bubbles: true, cancelable: true }), { dataTransfer: { files } });
  return act(async () => target.dispatchEvent(event));
}

describe('FilePicker', () => {
  it('opens the system file picker on click and passes the chosen file on', async () => {
    const onFile = vi.fn();
    await render(<FilePicker title="Choose a file" detail="Up to 5 MB" onFile={onFile} />);
    const input = container.querySelector<HTMLInputElement>('input[type=file]');
    if (!input) throw new Error('no file input');
    expect(input.accept).toBe('.srt,.vtt');
    const opened = vi.spyOn(input, 'click');
    await act(async () => container.querySelector('button')?.click());
    expect(opened).toHaveBeenCalled();

    const file = new File(['1'], 'film.srt');
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
    expect(onFile).toHaveBeenCalledWith(file);
  });

  it('accepts a dropped file, so upload works even where the file dialog closes the popup', async () => {
    const onFile = vi.fn();
    await render(<FilePicker title="Choose a file" detail="Up to 5 MB" onFile={onFile} />);
    const file = new File(['1'], 'film.vtt');
    await drop(container.querySelector('button') as Element, [file]);
    expect(onFile).toHaveBeenCalledWith(file);
  });

  it('ignores drops while disabled or busy, and says when it is loading', async () => {
    const onFile = vi.fn();
    await render(<FilePicker title="Loading subtitles…" detail="Up to 5 MB" busy onFile={onFile} />);
    const button = container.querySelector('button') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    await drop(button, [new File(['1'], 'film.srt')]);
    await render(<FilePicker title="Choose" detail="Up to 5 MB" disabled onFile={onFile} />);
    await drop(container.querySelector('button') as Element, [new File(['1'], 'film.srt')]);
    expect(onFile).not.toHaveBeenCalled();
  });
});

describe('ErrorBox', () => {
  it('announces only the message, with recovery actions beside it', async () => {
    const retry = vi.fn();
    await render(
      <ErrorBox
        actions={
          <button type="button" onClick={retry}>
            Try again
          </button>
        }
      >
        The search failed.
      </ErrorBox>,
    );
    expect(container.querySelector('[role=alert]')?.textContent).toBe('The search failed.');
    await act(async () => container.querySelector('button')?.click());
    expect(retry).toHaveBeenCalled();
  });
});

describe('Tabs', () => {
  const TABS = [
    { id: 'a', label: 'Subtitles' },
    { id: 'b', label: 'Search' },
    { id: 'c', label: 'Settings' },
  ] as const;

  it('follows the WAI-ARIA tabs pattern: one tab stop and arrow, Home and End keys', async () => {
    let value: 'a' | 'b' | 'c' = 'a';
    const onChange = vi.fn((next: typeof value) => {
      value = next;
      void render(<Tabs tabs={[...TABS]} value={value} onChange={onChange} />);
    });
    await render(<Tabs tabs={[...TABS]} value={value} onChange={onChange} />);
    const tabs = () => [...container.querySelectorAll<HTMLButtonElement>('[role=tab]')];
    const first = () => tabs()[0] as HTMLButtonElement;
    expect(container.querySelector('[role=tablist]')?.getAttribute('aria-label')).toBe('SubLanka sections');
    expect(tabs().map((tab) => [tab.getAttribute('aria-selected'), tab.tabIndex, tab.getAttribute('aria-controls')])).toEqual([
      ['true', 0, 'panel-a'],
      ['false', -1, 'panel-b'],
      ['false', -1, 'panel-c'],
    ]);

    const press = (key: string) =>
      act(async () => (document.activeElement ?? first()).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })));
    first().focus();
    await press('ArrowLeft');
    expect(value).toBe('c');
    expect(document.activeElement).toBe(tabs()[2]);
    await press('ArrowRight');
    expect(value).toBe('a');
    await press('End');
    expect(value).toBe('c');
    await press('Home');
    expect(value).toBe('a');
    expect(first().tabIndex).toBe(0);
  });
});
