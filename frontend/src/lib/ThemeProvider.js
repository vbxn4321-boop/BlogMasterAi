"use client";

import { createContext, useContext, useEffect, useState } from "react";

const ThemeContext = createContext({ isDark: false, toggleTheme: () => {} });

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }) {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('blog-master-theme');
    const dark = saved === 'dark';
    setIsDark(dark);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  }, []);

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    localStorage.setItem('blog-master-theme', next ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light');
  };

  return (
    <ThemeContext.Provider value={{ isDark, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
