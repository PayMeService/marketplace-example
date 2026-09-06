import { useCallback, useEffect, useState } from 'react';

/**
 * Light, dark, or whatever the OS says.
 *
 * The choice is written to the document element as `data-theme`, which is what
 * index.css keys the dark token block on, and mirrored to localStorage so the
 * inline script in index.html can apply it before first paint. Without that
 * script a dark-theme reader gets a full-page white flash on every load.
 */
export type Theme = 'auto' | 'light' | 'dark';

const KEY = 'ledger-theme';
const ORDER: Theme[] = ['auto', 'light', 'dark'];

function read(): Theme {
  try {
    const saved = localStorage.getItem(KEY);
    return saved === 'light' || saved === 'dark' ? saved : 'auto';
  } catch {
    // Private browsing can throw on access, not just on write.
    return 'auto';
  }
}

export function useTheme(): { theme: Theme; cycle: () => void } {
  const [theme, setTheme] = useState<Theme>(read);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'auto') delete root.dataset.theme;
    else root.dataset.theme = theme;

    try {
      if (theme === 'auto') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, theme);
    } catch {
      // A theme that cannot be persisted still applies for this session.
    }
  }, [theme]);

  const cycle = useCallback(
    () => setTheme((current) => ORDER[(ORDER.indexOf(current) + 1) % ORDER.length]),
    [],
  );

  return { theme, cycle };
}
