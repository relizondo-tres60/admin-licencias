/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/client/index.html', './src/client/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Paleta corporativa sobria
        marca: {
          50: '#eef4fb',
          100: '#d9e6f5',
          600: '#1d4e89',
          700: '#173e6e',
          800: '#122f54',
        },
      },
    },
  },
  plugins: [],
}
