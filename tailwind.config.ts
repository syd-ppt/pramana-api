import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        void: '#0a0a0f',
        deep: '#0f0f18',
        surface: '#141422',
        elevated: '#1a1a2e',
      },
    },
  },
  plugins: [],
};

export default config;
