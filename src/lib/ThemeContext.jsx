import { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext({ theme: 'light', toggleTheme: () => {} });

export function ThemeProvider({ children, theme: externalTheme }) {
  // If externalTheme is provided (from UserProfile), use it as default seed
  // but allow localStorage to override and toggle
  const [theme, setTheme] = useState(() => {
    const stored = localStorage.getItem('lr-theme');
    if (stored === 'dark' || stored === 'light') return stored;
    return externalTheme || 'light';
  });

  // Sync when externalTheme changes (e.g., on first load after profile loads)
  // only if localStorage hasn't been set by the user manually
  useEffect(() => {
    const stored = localStorage.getItem('lr-theme');
    if (!stored && externalTheme) {
      setTheme(externalTheme);
    }
  }, [externalTheme]);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('lr-theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => (t === 'dark' ? 'light' : 'dark'));

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);