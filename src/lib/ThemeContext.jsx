import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';

const STORAGE_KEY = 'lr-theme';
const ThemeContext = createContext({ theme: 'light', toggleTheme: () => {}, setTheme: () => {} });

const stored = () => {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'dark' || v === 'light' ? v : null;
  } catch {
    return null;
  }
};

// The theme lives on the user's profile. localStorage only caches it so the first paint is not a
// flash of the wrong theme; it used to win outright, which meant the profile value (the one the
// Dark Mode switch in Settings writes) was ignored from the second visit onward. On phones that
// switch is the only control, so dark mode looked broken there.
export function ThemeProvider({ children, theme: externalTheme }) {
  const [theme, setThemeState] = useState(() => stored() || externalTheme || 'light');
  const lastExternal = useRef(externalTheme);

  useEffect(() => {
    if (!externalTheme) return;
    // Follow the profile whenever it changes, including when it first arrives after sign-in.
    if (externalTheme !== lastExternal.current) {
      lastExternal.current = externalTheme;
      setThemeState(externalTheme);
    } else if (!stored()) {
      setThemeState(externalTheme);
    }
  }, [externalTheme]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try { localStorage.setItem(STORAGE_KEY, theme); } catch { /* storage blocked */ }
  }, [theme]);

  // Applies straight away and saves to the profile, so every device follows on its next load.
  const setTheme = useCallback(async (next) => {
    if (next !== 'dark' && next !== 'light') return;
    lastExternal.current = next;
    setThemeState(next);
    try {
      await base44.auth.updateMe({ theme: next });
    } catch { /* the theme still applies on this device */ }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
