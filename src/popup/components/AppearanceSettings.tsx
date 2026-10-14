import type { SubtitleSettings } from '../../shared/settings';
import { Card } from './ui';

export interface Option<T extends string> {
  value: T;
  label: string;
}

const SIZE_OPTIONS: Option<SubtitleSettings['fontSize']>[] = [
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' },
  { value: 'xlarge', label: 'X-Large' },
];
const BACKGROUND_OPTIONS: Option<SubtitleSettings['background']>[] = [
  { value: 'none', label: 'None' },
  { value: 'translucent', label: 'Translucent' },
  { value: 'solid', label: 'Solid' },
];
const COLOR_OPTIONS: Option<SubtitleSettings['textColor']>[] = [
  { value: 'white', label: 'White' },
  { value: 'yellow', label: 'Yellow' },
];

/** Native radio group styled as a segmented control: arrow keys and screen readers work as usual. */
export function SegmentedControl<T extends string>({
  label,
  name,
  value,
  options,
  onChange,
}: {
  label: string;
  name: string;
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-1 text-xs font-medium text-stone-600 dark:text-stone-300">{label}</legend>
      <div className="grid auto-cols-fr grid-flow-col gap-1 rounded-lg bg-stone-100 p-1 dark:bg-stone-800">
        {options.map((option) => (
          <label
            key={option.value}
            className="cursor-pointer rounded-md px-1 py-1 text-center text-xs text-stone-600 has-checked:bg-white has-checked:font-medium has-checked:text-stone-900 has-checked:shadow-sm has-focus-visible:outline-2 has-focus-visible:outline-rose-700 dark:has-focus-visible:outline-rose-400 dark:text-stone-300 dark:has-checked:bg-stone-950 dark:has-checked:text-stone-50"
          >
            <input
              type="radio"
              className="sr-only"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function AppearanceSettings({
  settings,
  onChange,
}: {
  settings: SubtitleSettings | null;
  onChange: (patch: Partial<SubtitleSettings>) => void;
}) {
  return (
    <Card title="Subtitle appearance">
      {settings === null ? (
        <p className="text-xs text-stone-500">Loading settings…</p>
      ) : (
        <div className="space-y-3">
          <SegmentedControl label="Font size" name="fontSize" value={settings.fontSize} options={SIZE_OPTIONS} onChange={(fontSize) => onChange({ fontSize })} />
          <SegmentedControl label="Text colour" name="textColor" value={settings.textColor} options={COLOR_OPTIONS} onChange={(textColor) => onChange({ textColor })} />
          <SegmentedControl label="Background" name="background" value={settings.background} options={BACKGROUND_OPTIONS} onChange={(background) => onChange({ background })} />
        </div>
      )}
    </Card>
  );
}
