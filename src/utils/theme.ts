import { useMemo } from 'react';
import { useStore } from '../store';
import { Theme } from '../types';

export interface ThemeColors {
  background: string;
  surface: string;
  surfaceHigh: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentNeon: string;
  success: string;
  warning: string;
  danger: string;
  border: string;
  tabBar: string;
  tabBarBorder: string;
  header: string;
  inputBackground: string;
  placeholder: string;
  glowAccent: string;
  glowDanger: string;
  glowSuccess: string;
}

const LIGHT: ThemeColors = {
  background: '#F0F0F5',
  surface: '#FFFFFF',
  surfaceHigh: '#F0F0F5',
  text: '#1C1C1E',
  textSecondary: '#8E8E93',
  textMuted: '#C7C7CC',
  accent: '#4F7EF5',
  accentNeon: '#4F7EF5',
  success: '#30B955',
  warning: '#F59500',
  danger: '#FF3B30',
  border: '#E0E0E8',
  tabBar: '#FFFFFF',
  tabBarBorder: '#E0E0E8',
  header: '#F0F0F5',
  inputBackground: '#FFFFFF',
  placeholder: '#BBBBC4',
  glowAccent: 'transparent',
  glowDanger: 'transparent',
  glowSuccess: 'transparent',
};

const DARK_NEON: ThemeColors = {
  background: '#08080F',
  surface: '#111120',
  surfaceHigh: '#1A1A2E',
  text: '#EAEAff',
  textSecondary: '#6060A0',
  textMuted: '#30304A',
  accent: '#3D8FFF',
  accentNeon: '#00E5FF',
  success: '#0FFF6A',
  warning: '#FFD60A',
  danger: '#FF2D55',
  border: '#202038',
  tabBar: '#08080F',
  tabBarBorder: '#202038',
  header: '#08080F',
  inputBackground: '#1A1A2E',
  placeholder: '#303048',
  glowAccent: 'rgba(0, 229, 255, 0.45)',
  glowDanger: 'rgba(255, 45, 85, 0.5)',
  glowSuccess: 'rgba(15, 255, 106, 0.4)',
};

const DARK_SOFT: ThemeColors = {
  background: '#181818',
  surface: '#222222',
  surfaceHigh: '#2A2A2A',
  text: '#F0F0F0',
  textSecondary: '#888888',
  textMuted: '#505050',
  accent: '#4A9EFF',
  accentNeon: '#4A9EFF',
  success: '#3DB97A',
  warning: '#F5A623',
  danger: '#E05454',
  border: '#2E2E2E',
  tabBar: '#181818',
  tabBarBorder: '#2E2E2E',
  header: '#181818',
  inputBackground: '#222222',
  placeholder: '#505050',
  glowAccent: 'transparent',
  glowDanger: 'transparent',
  glowSuccess: 'transparent',
};

export const THEMES: Record<Theme, ThemeColors> = {
  light: LIGHT,
  'dark-neon': DARK_NEON,
  'dark-soft': DARK_SOFT,
};

export function neonGlow(color: string, intensity: 'soft' | 'medium' | 'hard' = 'medium') {
  const cfg = {
    soft:   { opacity: 0.45, radius: 10 },
    medium: { opacity: 0.65, radius: 16 },
    hard:   { opacity: 0.85, radius: 24 },
  }[intensity];
  return {
    shadowColor: color,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: cfg.opacity,
    shadowRadius: cfg.radius,
    elevation: 10,
  };
}

export function useTheme(): { colors: ThemeColors; theme: Theme; isDark: boolean } {
  const theme = useStore((s) => s.settings.theme ?? 'light');
  const colors = useMemo(() => THEMES[theme] ?? LIGHT, [theme]);
  return { colors, theme, isDark: theme === 'dark-neon' || theme === 'dark-soft' };
}
