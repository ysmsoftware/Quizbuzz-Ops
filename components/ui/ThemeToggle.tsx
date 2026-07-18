'use client';

import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';

export default function ThemeToggle() {
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('quizbuzz_dark_mode');
      if (saved) return saved === 'true';
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  useEffect(() => {
    const root = window.document.documentElement;
    if (isDark) {
      root.classList.add('dark');
      localStorage.setItem('quizbuzz_dark_mode', 'true');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('quizbuzz_dark_mode', 'false');
    }
  }, [isDark]);

  return (
    <button
      id="theme-toggle-btn"
      onClick={() => setIsDark(!isDark)}
      className="p-2 text-muted-foreground hover:text-foreground hover:bg-secondary/50 rounded-md transition-colors"
      title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
    >
      {isDark ? (
        <Sun className="h-4 w-4 text-accent" />
      ) : (
        <Moon className="h-4 w-4 text-primary" />
      )}
    </button>
  );
}
