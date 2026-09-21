export const themePalettes = {
  light: {
    bgTop: '#eef2ff',
    bgMiddle: '#f8fafc',
    bgBottom: '#f1f5f9',
    accent: '#2563eb',
    inkStrong: '#0f172a',
    inkMuted: '#475569',
    cardBg: 'rgba(255,255,255,0.96)',
    cardBorder: 'rgba(15,23,42,0.08)',
    success: '#15803d',
    warning: '#ca8a04',
    danger: '#b91c1c',
  },
  ocean: {
    bgTop: '#e0f2fe',
    bgMiddle: '#ecfeff',
    bgBottom: '#e6fffa',
    accent: '#0f766e',
    inkStrong: '#082f49',
    inkMuted: '#155e75',
    cardBg: 'rgba(255,255,255,0.95)',
    cardBorder: 'rgba(14,116,144,0.16)',
    success: '#15803d',
    warning: '#ca8a04',
    danger: '#b91c1c',
  },
  sunset: {
    bgTop: '#fff1f2',
    bgMiddle: '#fff7ed',
    bgBottom: '#ffedd5',
    accent: '#ea580c',
    inkStrong: '#431407',
    inkMuted: '#7c2d12',
    cardBg: 'rgba(255,255,255,0.95)',
    cardBorder: 'rgba(234,88,12,0.18)',
    success: '#15803d',
    warning: '#ca8a04',
    danger: '#b91c1c',
  },
}

export const colors = themePalettes.light

export const getThemeColors = (themeName) => themePalettes[themeName] || themePalettes.light

export const spacing = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
}

export const radius = {
  sm: 10,
  md: 14,
  lg: 18,
}

export const text = {
  title: { fontSize: 24, fontWeight: '700', color: colors.inkStrong },
  subtitle: { fontSize: 16, fontWeight: '600', color: colors.inkStrong },
  body: { fontSize: 14, color: colors.inkMuted },
}
