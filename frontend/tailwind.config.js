/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        parchment: '#F6F1E7',
        navy: '#1A2744',
        gold: '#B8972E',
        crimson: '#8B2020',
        ink: '#2A2015',
      },
      fontFamily: {
        serif: ['"EB Garamond"', 'Georgia', 'serif'],
        sans: ['"Source Sans 3"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
