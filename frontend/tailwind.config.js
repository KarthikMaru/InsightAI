/** File path: frontend/tailwind.config.js */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef4ff',
          100: '#d9e6ff',
          300: '#93b4ff',
          500: '#4f6ef7',
          600: '#3c54e0',
          700: '#2f42b3',
          900: '#1b2461',
        },
      },
    },
  },
  plugins: [],
};
