import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Fetch-on-mount with cancellation and an explicit reload.
 *
 * Two things this gets right that an ad-hoc `useEffect(() => { void load() })`
 * does not:
 *
 *  - **No synchronous setState in the effect body.** Setting state directly in
 *    an effect triggers a cascading render; React's lint rule flags it. Here
 *    every write happens inside the async callback, after an await.
 *
 *  - **Cancellation.** A response that arrives after the component unmounted —
 *    or after a newer request superseded it — is dropped instead of overwriting
 *    fresher state. That race is easy to hit on a page that reloads after every
 *    action, which is most of the pages in this app.
 *
 * The loader is held in a ref so the caller can pass a fresh closure each
 * render without re-triggering the fetch. Re-run by calling `reload()`, or by
 * changing `key` (a route param, say).
 */
export function useLoader<T>(
  loader: () => Promise<T>,
  key?: string | number | null,
): {
  data: T | null;
  error: unknown;
  loading: boolean;
  reload: () => void;
  setData: (value: T | null) => void;
  setError: (value: unknown) => void;
} {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  const loaderRef = useRef(loader);
  useEffect(() => {
    loaderRef.current = loader;
  });

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const result = await loaderRef.current();
        if (cancelled) return;
        setData(result);
        setError(null);
      } catch (caught) {
        if (!cancelled) setError(caught);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [key, nonce]);

  const reload = useCallback(() => setNonce((value) => value + 1), []);

  return { data, error, loading, reload, setData, setError };
}
