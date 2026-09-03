import type { Config } from 'tailwindcss'

export default {
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}', './components/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef8ff',
          500: '#1677ff',
          600: '#0f63db',
          700: '#0d4faf'
        }
      }
    }
  },
  plugins: []
} satisfies Config
