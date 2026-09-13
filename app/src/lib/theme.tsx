import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, normalizeTheme, type ThemeName } from './api';

/** Themes that render on a dark base — drives the `dark` class for any
 *  remaining Tailwind `dark:` consumers and the native color-scheme. */
const DARK_THEMES: ThemeName[] = ['dark', 'midnight'];

interface ThemeCtx {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
  loading: boolean;
}

const ThemeContext = createContext<ThemeCtx>({
  theme: 'light',
  setTheme: () => {},
  loading: false,
});

export function ThemeProvider({ children, initialTheme }: { children: ReactNode; initialTheme?: ThemeName }) {
  const [theme, setThemeState] = useState<ThemeName>(normalizeTheme(initialTheme));
  const [loading, setLoading] = useState(false);

  // keep <html data-theme> and .dark class in sync
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.classList.toggle('dark', DARK_THEMES.includes(theme));
  }, [theme]);

  async function setTheme(next: ThemeName) {
    setLoading(true);
    try {
      await api.setTheme(next);
      setThemeState(next);
    } finally {
      setLoading(false);
    }
  }

  // initial load from server
  useEffect(() => {
    let alive = true;
    setLoading(true);
    api
      .getSettings()
      .then((s) => {
        if (!alive) return;
        setThemeState(normalizeTheme(s.theme));
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, loading }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
