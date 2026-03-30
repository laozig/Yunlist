/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "hsl(210, 20%, 98%)",
        foreground: "hsl(222, 47%, 11%)",
      }
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
