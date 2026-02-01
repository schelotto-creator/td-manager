/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    "@tailwindcss/postcss": {}, // Nota el cambio de nombre del plugin en v4
  },
};

export default config;