/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class', // dark 모드 가능
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      fontFamily: {
        malgun: ["'Malgun Gothic'", "sans-serif"],
      },
    },
  },
  plugins: [],
}

