import type { SubtitleSettings } from '../../shared/settings';
import { SegmentedControl, type Option } from './AppearanceSettings';
import { Card, Switch } from './ui';

const POSITION_OPTIONS: Option<SubtitleSettings['position']>[] = [
  { value: 'very-low', label: 'Very low' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'very-high', label: 'Very high' },
];

export function PositionCard({
  settings,
  onChange,
}: {
  /** null while saved settings are loading. */
  settings: SubtitleSettings | null;
  onChange: (patch: Partial<SubtitleSettings>) => void;
}) {
  return (
    <Card title="Position">
      {settings === null ? (
        <p className="text-xs text-stone-500">Loading settings…</p>
      ) : (
        <>
          <SegmentedControl
            label="Height above the bottom of the video"
            name="position"
            value={settings.position}
            options={POSITION_OPTIONS}
            onChange={(position) => onChange({ position })}
          />
          <p className="mt-2 text-[11px] leading-relaxed text-stone-500 dark:text-stone-400">
            Move subtitles higher if they cover a watermark or text in the video.
          </p>
          <div className="mt-3">
            <Switch checked={settings.hideCredits} label="Hide credits and watermarks" onChange={(hideCredits) => onChange({ hideCredits })} />
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-stone-500 dark:text-stone-400">
            Skips subtitle lines that stay on screen for over a minute, such as translator or site credits.
          </p>
        </>
      )}
    </Card>
  );
}
