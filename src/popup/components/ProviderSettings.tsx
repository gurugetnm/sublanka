import { LoaderCircle } from 'lucide-react';
import { useState } from 'react';
import { loadAccountStatus, saveApiKey, signIn, signOut, type AccountStatus } from '../../providers/opensubtitles';
import { ProviderError } from '../../providers/types';
import { Card, SECONDARY_BUTTON } from './ui';

const INPUT =
  'w-full rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-rose-700 dark:border-stone-700 dark:bg-stone-950';
const HELP = 'text-[11px] leading-relaxed text-stone-500 dark:text-stone-400';

export function ProviderSettings({ account, onChange }: { account: AccountStatus | null; onChange: (account: AccountStatus) => void }) {
  const [apiKey, setApiKey] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      onChange(await loadAccountStatus());
    } catch (caught) {
      setError(caught instanceof ProviderError ? caught.message : 'Could not save the provider settings.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Subtitle provider">
      <p className="text-sm font-medium">OpenSubtitles.com</p>
      <p className={`mt-0.5 ${HELP}`}>
        Searching needs your own free API key, created under API Consumers on your OpenSubtitles.com profile (
        <a href="https://opensubtitles.tawk.help/article/getting-started" target="_blank" rel="noreferrer" className="underline">
          how to get a key
        </a>
        ).
      </p>

      {account === null ? (
        <p className="mt-2 text-xs text-stone-500">Loading…</p>
      ) : (
        <>
          {account.hasApiKey ? (
            <div className="mt-3 flex items-center gap-2">
              <p className="flex-1 text-xs">API key saved on this device.</p>
              <button type="button" className={SECONDARY_BUTTON} disabled={busy} onClick={() => act(() => saveApiKey(''))}>
                Remove key
              </button>
            </div>
          ) : (
            <form
              className="mt-3 flex items-end gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (apiKey.trim()) void act(() => saveApiKey(apiKey)).then(() => setApiKey(''));
              }}
            >
              <label className="min-w-0 flex-1 text-xs font-medium text-stone-600 dark:text-stone-300">
                API key
                <input
                  type="password"
                  autoComplete="off"
                  className={`${INPUT} mt-1`}
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                />
              </label>
              <button type="submit" className={`${SECONDARY_BUTTON} py-1.5`} disabled={busy || !apiKey.trim()}>
                Save
              </button>
            </form>
          )}

          <div className="mt-3 border-t border-stone-200 pt-3 dark:border-stone-800">
            <p className="text-xs font-medium text-stone-600 dark:text-stone-300">Account (optional)</p>
            {account.username ? (
              <div className="mt-1 flex items-center gap-2">
                <p className="min-w-0 flex-1 truncate text-xs">Signed in as {account.username}</p>
                <button type="button" className={SECONDARY_BUTTON} disabled={busy} onClick={() => act(signOut)}>
                  Sign out
                </button>
              </div>
            ) : (
              <form
                className="mt-1 flex flex-col gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void act(() => signIn(username, password, AbortSignal.timeout(30_000))).then(() => setPassword(''));
                }}
              >
                <div className="grid grid-cols-2 gap-2">
                  <input
                    aria-label="OpenSubtitles username"
                    placeholder="Username"
                    autoComplete="username"
                    className={INPUT}
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                  />
                  <input
                    aria-label="OpenSubtitles password"
                    placeholder="Password"
                    type="password"
                    autoComplete="current-password"
                    className={INPUT}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </div>
                <button
                  type="submit"
                  className={`${SECONDARY_BUTTON} self-start`}
                  disabled={busy || !account.hasApiKey || !username.trim() || !password}
                >
                  {busy && <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />}
                  Sign in
                </button>
              </form>
            )}
            <p className={`mt-1.5 ${HELP}`}>
              Without an account, OpenSubtitles allows only a few downloads a day per network. Signing in uses your account’s
              allowance. Your password goes only to OpenSubtitles and is never saved; the sign-in lasts until you close the browser.
            </p>
          </div>
        </>
      )}

      {error && (
        <p role="alert" className="mt-2 text-xs text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
    </Card>
  );
}
