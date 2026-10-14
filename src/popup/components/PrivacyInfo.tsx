import { Card } from './ui';

// Each line restates the README's Privacy sections; keep them in step. No policy link until a real policy URL is published.
const ITEMS: { title: string; detail: string }[] = [
  { title: 'Local subtitle files', detail: 'Read and parsed on this device. Never uploaded.' },
  {
    title: 'Subtitle search',
    detail:
      'Only when you search or load a result: the title, year, season and episode (or a picked series’ IMDb id) go to OpenSubtitles.com. Never the page address or contents.',
  },
  { title: 'Title suggestions', detail: 'Only the text you type in the title field: movies to Wikidata, TV series to TVmaze.' },
  {
    title: 'Translation',
    detail:
      'Only after you click Translate: the subtitle text, without timings or file names, goes to Google Cloud Translation with your own API key.',
  },
  { title: 'API keys', detail: 'Kept on this device and sent only to their own service. Your OpenSubtitles password is never saved.' },
];

export function PrivacyInfo() {
  return (
    <Card title="Privacy">
      <dl className="space-y-2 text-xs">
        {ITEMS.map((item) => (
          <div key={item.title}>
            <dt className="font-medium">{item.title}</dt>
            <dd className="mt-0.5 leading-relaxed text-stone-600 dark:text-stone-300">{item.detail}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-[11px] leading-relaxed text-stone-500 dark:text-stone-400">
        No analytics, trackers, ads or remote scripts. No video is uploaded.
      </p>
    </Card>
  );
}
