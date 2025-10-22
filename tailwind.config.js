/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',   // Next.js 15 uses /app folder
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  darkMode: 'class', // enable .dark mode
  theme: {
    extend: {
      colors: {
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        border: 'var(--border)',
        ring: 'var(--ring)',
        // add other CSS variables if you want to use them as Tailwind classes
      },
    },
  },
  plugins: [],
};
