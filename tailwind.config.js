/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["SF Pro Text", "system-ui", "-apple-system", "sans-serif"],
      },
    },
  },
  plugins: [],
};
