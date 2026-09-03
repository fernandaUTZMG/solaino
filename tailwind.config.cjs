/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        /** Azul marino muy fuerte: títulos de sección (contraste con logo / barra superior) */
        'section-navy': '#041a38',
        /** Morado ciruela — pestaña Programación (#853D85) */
        programacion: {
          50: '#faf5fa',
          100: '#f3e6f3',
          200: '#e6cce6',
          300: '#d4a8d4',
          400: '#b870b8',
          500: '#853D85',
          600: '#6d336d',
          700: '#552855',
          800: '#3d1e3d',
          900: '#261326',
          950: '#180c18',
          DEFAULT: '#853D85',
        },
      },
    },
  },
  plugins: [],
}
