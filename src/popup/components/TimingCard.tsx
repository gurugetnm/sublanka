import { Card, HELP, SECONDARY_BUTTON } from './ui';

const STEPS = [-5, -1, -0.5, 0.5, 1, 5];

export function formatOffset(seconds: number): string {
  return `${seconds > 0 ? '+' : ''}${seconds.toFixed(1)}s`;
}

export function TimingCard({
  offset,
  onAdjust,
  onReset,
}: {
  /** null while saved settings are loading. */
  offset: number | null;
  onAdjust: (deltaSeconds: number) => void;
  onReset: () => void;
}) {
  const disabled = offset === null;
  return (
    <Card
      title="Sync offset"
      aside={
        <button type="button" className={SECONDARY_BUTTON} disabled={disabled || offset === 0} onClick={onReset}>
          Reset
        </button>
      }
    >
      <p className="text-sm" aria-live="polite">
        Subtitle delay: <strong className="font-semibold tabular-nums">{offset === null ? '…' : formatOffset(offset)}</strong>
      </p>
      <div className="mt-2 grid grid-cols-6 gap-1">
        {STEPS.map((step) => (
          <button
            key={step}
            type="button"
            disabled={disabled}
            onClick={() => onAdjust(step)}
            aria-label={`Show subtitles ${Math.abs(step)} ${Math.abs(step) === 1 ? 'second' : 'seconds'} ${step > 0 ? 'later' : 'earlier'}`}
            className={`${SECONDARY_BUTTON} px-0 tabular-nums`}
          >
            {step > 0 ? '+' : '−'}
            {Math.abs(step)}
          </button>
        ))}
      </div>
      <p className={`mt-2 ${HELP}`}>
        Positive values show subtitles later; negative values show them earlier.
      </p>
    </Card>
  );
}
