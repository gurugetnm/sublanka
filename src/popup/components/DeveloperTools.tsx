import { Disclosure, SECONDARY_BUTTON } from './ui';

export function DeveloperTools({
  demoVisible,
  disabled,
  onToggleDemo,
}: {
  demoVisible: boolean;
  disabled: boolean;
  onToggleDemo: () => void;
}) {
  return (
    <Disclosure title="Developer tools">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs leading-relaxed text-stone-500 dark:text-stone-400">
          Shows a fixed sample line. While visible it replaces the loaded subtitles.
        </p>
        <button type="button" className={`${SECONDARY_BUTTON} shrink-0`} disabled={disabled} onClick={onToggleDemo}>
          {demoVisible ? 'Hide Demo Subtitle' : 'Show Demo Subtitle'}
        </button>
      </div>
    </Disclosure>
  );
}
