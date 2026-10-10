/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        industrial: {
          950: '#0a0d14',
          900: '#0f1420',
          850: '#151c2d',
          800: '#1b2337',
          700: '#28344f',
          600: '#3c4d73',
          500: '#566e9e',
          400: '#7e95c4',
          300: '#a9bce3',
          200: '#d1ddf4',
          100: '#edf2fa',
        },
        safety: {
          green: '#10b981',
          amber: '#f59e0b',
          crimson: '#ef4444',
          blue: '#3b82f6',
          cyan: '#06b6d4',
        }
      },
    },
  },
  plugins: [],
};
