/**
 * Design Tokens - kibanCMS 2026
 * Monochrome, High Contrast, Ultra-Clean Design System
 */

// ============================================
// COLORS - Strictly Monochrome
// ============================================

export const colors = {
  // Primary Scale
  black: '#000000',
  white: '#FFFFFF',

  // Gray Scale - Technical Precision
  gray: {
    50: '#FAFAFA',   // Almost white
    100: '#F5F5F5',  // Light surface
    200: '#E5E5E5',  // Dividers
    300: '#D4D4D4',  // Disabled
    400: '#A3A3A3',  // Placeholder
    500: '#737373',  // Subtle text
    600: '#525252',  // Secondary text
    700: '#404040',  // Body text
    800: '#262626',  // Primary text
    900: '#171717',  // Near black
    950: '#0A0A0A',  // Deep black
  },

  // Accent Color - Modern Cyan/Teal
  accent: {
    50: '#ECFEFF',   // Lightest tint
    100: '#CFFAFE',  // Light background
    200: '#A5F3FC',  // Soft highlight
    300: '#67E8F9',  // Light accent
    400: '#22D3EE',  // Medium accent
    500: '#06B6D4',  // Primary accent (main brand color)
    600: '#0891B2',  // Hover state
    700: '#0E7490',  // Active state
    800: '#155E75',  // Dark variant
    900: '#164E63',  // Darkest
  },

  // Semantic Colors
  red: {
    50: '#FEF2F2',
    100: '#FEE2E2',
    200: '#FECACA',
    300: '#FCA5A5',
    400: '#F87171',
    500: '#EF4444',
    600: '#DC2626',
    700: '#B91C1C',
    800: '#991B1B',
    900: '#7F1D1D',
  },

  green: {
    50: '#F0FDF4',
    100: '#DCFCE7',
    200: '#BBF7D0',
    300: '#86EFAC',
    400: '#4ADE80',
    500: '#22C55E',
    600: '#16A34A',
    700: '#15803D',
    800: '#166534',
    900: '#14532D',
  },

  yellow: {
    50: '#FEFCE8',
    100: '#FEF9C3',
    200: '#FEF08A',
    300: '#FDE047',
    400: '#FACC15',
    500: '#EAB308',
    600: '#CA8A04',
    700: '#A16207',
    800: '#854D0E',
    900: '#713F12',
  },

  blue: {
    50: '#EFF6FF',
    100: '#DBEAFE',
    200: '#BFDBFE',
    300: '#93C5FD',
    400: '#60A5FA',
    500: '#3B82F6',
    600: '#2563EB',
    700: '#1D4ED8',
    800: '#1E40AF',
    900: '#1E3A8A',
  },

  // Functional (still monochrome with opacity)
  overlay: 'rgba(0, 0, 0, 0.5)',
  backdrop: 'rgba(0, 0, 0, 0.8)',
  shadow: 'rgba(0, 0, 0, 0.1)',

  // States (using opacity)
  hover: 'rgba(0, 0, 0, 0.05)',
  active: 'rgba(0, 0, 0, 0.1)',
  focus: 'rgba(6, 182, 212, 0.1)', // Accent with low opacity
} as const;

// ============================================
// TYPOGRAPHY - Variable Font System
// ============================================

export const typography = {
  // Font Family
  fontFamily: {
    sans: '"Inter Variable", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    mono: '"JetBrains Mono Variable", "SF Mono", Consolas, monospace',
  },

  // Font Sizes - Perfect Fourth Scale (1.333)
  fontSize: {
    '2xs': '0.625rem',   // 10px
    xs: '0.75rem',       // 12px
    sm: '0.875rem',      // 14px
    base: '1rem',        // 16px
    lg: '1.125rem',      // 18px
    xl: '1.333rem',      // 21px
    '2xl': '1.777rem',   // 28px
    '3xl': '2.369rem',   // 38px
    '4xl': '3.157rem',   // 50px
    '5xl': '4.209rem',   // 67px
  },

  // Font Weights - Variable
  fontWeight: {
    thin: 100,
    light: 300,
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
    extrabold: 800,
    black: 900,
  },

  // Line Heights
  lineHeight: {
    dense: 1.2,
    tight: 1.4,
    normal: 1.6,
    relaxed: 1.8,
    loose: 2,
  },

  // Letter Spacing
  letterSpacing: {
    tighter: '-0.05em',
    tight: '-0.025em',
    normal: '0',
    wide: '0.025em',
    wider: '0.05em',
    widest: '0.1em',
  },
} as const;

// ============================================
// SPACING - 8px Grid System
// ============================================

export const spacing = {
  0: '0',
  px: '1px',
  0.5: '0.125rem',  // 2px
  1: '0.25rem',     // 4px
  2: '0.5rem',      // 8px
  3: '0.75rem',     // 12px
  4: '1rem',        // 16px
  5: '1.25rem',     // 20px
  6: '1.5rem',      // 24px
  8: '2rem',        // 32px
  10: '2.5rem',     // 40px
  12: '3rem',       // 48px
  16: '4rem',       // 64px
  20: '5rem',       // 80px
  24: '6rem',       // 96px
  32: '8rem',       // 128px
  40: '10rem',      // 160px
  48: '12rem',      // 192px
  56: '14rem',      // 224px
  64: '16rem',      // 256px
} as const;

// ============================================
// BORDERS & RADIUS
// ============================================

export const borders = {
  width: {
    none: '0',
    hairline: '0.5px',
    thin: '1px',
    medium: '2px',
    thick: '4px',
  },

  radius: {
    none: '0',
    xs: '2px',
    sm: '4px',
    md: '8px',
    lg: '12px',
    xl: '16px',
    '2xl': '24px',
    full: '9999px',
  },

  style: {
    solid: 'solid',
    dashed: 'dashed',
    dotted: 'dotted',
  },
} as const;

// ============================================
// SHADOWS - Subtle Depth
// ============================================

export const shadows = {
  none: 'none',
  xs: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  sm: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)',
  md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)',
  lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)',
  xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
  '2xl': '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
  inner: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.05)',
  focus: '0 0 0 3px rgba(0, 0, 0, 0.1)',
} as const;

// ============================================
// ANIMATIONS & TRANSITIONS
// ============================================

export const animations = {
  duration: {
    instant: '0ms',
    fast: '150ms',
    normal: '250ms',
    slow: '350ms',
    slower: '500ms',
  },

  easing: {
    linear: 'linear',
    in: 'cubic-bezier(0.4, 0, 1, 1)',
    out: 'cubic-bezier(0, 0, 0.2, 1)',
    inOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
    spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  },
} as const;

// ============================================
// Z-INDEX SCALE
// ============================================

export const zIndex = {
  negative: -1,
  base: 0,
  dropdown: 1000,
  sticky: 1100,
  overlay: 1200,
  modal: 1300,
  popover: 1400,
  toast: 1500,
  tooltip: 1600,
  omnibar: 1700,
} as const;

// ============================================
// BREAKPOINTS
// ============================================

export const breakpoints = {
  xs: '480px',
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
  '3xl': '1920px',
} as const;

// ============================================
// LAYOUT
// ============================================

export const layout = {
  sidebar: {
    collapsed: '64px',
    expanded: '280px',
  },
  header: {
    height: '64px',
  },
  container: {
    sm: '640px',
    md: '768px',
    lg: '1024px',
    xl: '1280px',
    '2xl': '1536px',
  },
  grid: {
    columns: 12,
    gap: '24px',
  },
} as const;

// ============================================
// KEYBOARD SHORTCUTS
// ============================================

export const shortcuts = {
  omnibar: 'cmd+k',
  search: 'cmd+f',
  new: 'cmd+n',
  save: 'cmd+s',
  publish: 'cmd+p',
  preview: 'cmd+shift+p',
  focus: 'cmd+.',
  escape: 'esc',
  help: 'cmd+/',
} as const;