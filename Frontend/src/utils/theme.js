import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';

export function getInitialTheme() {
  try {
    return localStorage.getItem('rg_theme') === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function useTheme() {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('rg_theme', theme);
    } catch {
      // ignore storage errors
    }
  }, [theme]);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    const applyTheme = () => {
      document.documentElement.setAttribute('data-theme', nextTheme);
      try {
        localStorage.setItem('rg_theme', nextTheme);
      } catch {
        // ignore storage errors
      }
      flushSync(() => {
        setTheme(nextTheme);
      });
    };

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!document.startViewTransition || prefersReducedMotion) {
      applyTheme();
      return;
    }

    const transition = document.startViewTransition(applyTheme);
    transition.ready.then(() => {
      const endRadius = Math.hypot(window.innerWidth, window.innerHeight);
      document.documentElement.animate(
        {
          clipPath: [
            'circle(0px at 0px 0px)',
            `circle(${endRadius}px at 0px 0px)`,
          ],
        },
        {
          duration: 750,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
          pseudoElement: '::view-transition-new(root)',
        }
      );
    });
  };

  return { theme, toggleTheme };
}
