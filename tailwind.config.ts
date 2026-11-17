import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace']
      },
      colors: {
        kira: {
          void: '#030406',
          panel: '#080a10',
          line: '#202431',
          blue: '#71a7ff',
          violet: '#8e7dff'
        }
      },
      boxShadow: {
        glow: '0 0 45px rgba(113, 167, 255, 0.14)'
      }
    }
  },
  plugins: []
} satisfies Config;
