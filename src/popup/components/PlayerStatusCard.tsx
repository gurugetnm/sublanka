import { LoaderCircle } from 'lucide-react';
import type { TabConnection } from '../tabBridge';
import { Card } from './ui';

interface StatusCopy {
  title: string;
  detail: string;
  dot: string;
}

function describe(connection: TabConnection): StatusCopy {
  if (connection.kind === 'unsupported') {
    return {
      title: 'Unsupported page',
      detail: 'Browser and extension pages cannot show subtitles. Open a regular website.',
      dot: 'bg-amber-500',
    };
  }
  if (connection.kind === 'unavailable') {
    return {
      title: 'Unable to access this tab',
      detail:
        'Chrome blocked access to this page, or it navigated away. Reopen SubLanka, or for local files enable “Allow access to file URLs”.',
      dot: 'bg-red-500',
    };
  }
  const { videos, hasFrames } = connection.state;
  const [only] = videos;
  if (!only) {
    return {
      title: 'No compatible video detected',
      detail: hasFrames
        ? 'This page embeds other frames. Videos inside them are not supported yet.'
        : 'Open a page with an HTML5 video player. Start the video if it has not appeared yet.',
      dot: 'bg-amber-500',
    };
  }
  if (videos.length === 1) {
    return {
      title: 'Video detected',
      detail: `${only.width}×${only.height} on the page · ${only.playing ? 'Playing' : 'Paused'}`,
      dot: 'bg-emerald-500',
    };
  }
  return {
    title: `${videos.length} videos detected`,
    detail: 'Choose which video the subtitles follow.',
    dot: 'bg-emerald-500',
  };
}

export function PlayerStatusCard({
  connection,
  disabled,
  onSelectVideo,
}: {
  connection: TabConnection | null;
  disabled: boolean;
  onSelectVideo: (videoId: number) => void;
}) {
  if (connection === null) {
    return (
      <Card title="Player">
        <p className="flex items-center gap-2 text-sm text-stone-600 dark:text-stone-300">
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          Checking this tab…
        </p>
      </Card>
    );
  }

  const copy = describe(connection);
  const state = connection.kind === 'ready' ? connection.state : null;

  return (
    <Card title="Player">
      <div aria-live="polite">
        <p className="flex items-center gap-2 text-sm font-medium">
          <span className={`size-2 shrink-0 rounded-full ${copy.dot}`} aria-hidden="true" />
          {copy.title}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-stone-500 dark:text-stone-400">{copy.detail}</p>
      </div>

      {state && state.videos.length > 1 && (
        <label className="mt-2 block text-xs">
          <span className="sr-only">Video the subtitles follow</span>
          <select
            value={state.attachedVideoId ?? ''}
            disabled={disabled}
            onChange={(event) => onSelectVideo(Number(event.target.value))}
            className="w-full rounded-md border border-stone-300 bg-white px-2 py-1.5 text-xs dark:border-stone-700 dark:bg-stone-900"
          >
            {state.attachedVideoId === null && (
              <option value="" disabled>
                Choose a video
              </option>
            )}
            {state.videos.map((video, i) => (
              <option key={video.id} value={video.id}>
                Video {i + 1} · {video.width}×{video.height}
                {video.playing ? ' · playing' : ''}
              </option>
            ))}
          </select>
        </label>
      )}
    </Card>
  );
}
