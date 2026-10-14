import { useState } from 'react';
import { saveTranslationApiKey } from '../../translation/googleTranslate';
import { Card, HELP, INPUT, SECONDARY_BUTTON } from './ui';

export function TranslationSettings({ configured, onChange }: { configured: boolean | null; onChange: (configured: boolean) => void }) {
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(value: string) {
    setBusy(true);
    setError(null);
    try {
      await saveTranslationApiKey(value);
      setApiKey('');
      onChange(value.trim() !== '');
    } catch {
      setError('Could not save the API key.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Translation">
      <p className="text-sm font-medium">Google Cloud Translation</p>
      <p className={`mt-0.5 ${HELP}`}>
        Translating needs your own API key from a Google Cloud project with the Cloud Translation API and billing enabled (
        <a href="https://docs.cloud.google.com/translate/docs/setup" target="_blank" rel="noreferrer" className="underline">
          setup guide
        </a>
        ). Restrict the key to the Cloud Translation API. It is kept on this device and sent only to Google.
      </p>
      {configured === null ? (
        <p className="mt-2 text-xs text-stone-500">Loading…</p>
      ) : configured ? (
        <div className="mt-3 flex items-center gap-2">
          <p className="flex-1 text-xs">API key saved on this device. It is not shown again.</p>
          <button type="button" className={SECONDARY_BUTTON} disabled={busy} onClick={() => void save('')}>
            Remove key
          </button>
        </div>
      ) : (
        <form
          className="mt-3 flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (apiKey.trim()) void save(apiKey);
          }}
        >
          <label className="min-w-0 flex-1 text-xs font-medium text-stone-600 dark:text-stone-300">
            Translation API key
            <input type="password" autoComplete="off" className={`${INPUT} mt-1`} value={apiKey} onChange={(event) => setApiKey(event.target.value)} />
          </label>
          <button type="submit" className={`${SECONDARY_BUTTON} py-1.5`} disabled={busy || !apiKey.trim()}>
            Save
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
    </Card>
  );
}
