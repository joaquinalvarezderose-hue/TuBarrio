/** @type {import('tailwindcss').Config} */
export default {
  content: ['./**/*.{tsx,ts,jsx,js}', './index.html'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: '#13ec49',
        'primary-dark': '#0eb538',
        secondary: '#111813',
        surface: '#ffffff',
        accent: '#ff4b4b',
        'tournament-primary': '#6dec13',
        'background-light': '#f6f8f6',
        'background-dark': '#102215',
        'surface-light': '#ffffff',
        'surface-dark': '#f9fafb',
        'secondary-text': '#61896b',
        'card-light': '#ffffff',
        'card-dark': '#1a3322',
        'text-light': '#111813',
        'text-dark': '#e0e6e2',
      },
      fontFamily: {
        sans: ['Manrope', 'sans-serif'],
        display: ['Lexend', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
