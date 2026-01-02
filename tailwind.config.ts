import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#0a0e17',
        surface: '#121826',
        amber: '#f59e0b',
        cyan: '#06b6d4',
        rose: '#f43f5e',
      },
      fontFamily: {
        mono: ['var(--font-jetbrains)', 'monospace'],
        sans: ['var(--font-ibm-plex)', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
export default config
