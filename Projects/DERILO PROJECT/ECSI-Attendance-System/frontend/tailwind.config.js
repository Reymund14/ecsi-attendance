/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ecsiWhite:   "#FFFFFF",
        ecsiYellow:  "#F2C111",
        ecsiGreen:   "#41A638",
        ecsiLightBg: "#F8FAFC",
        textGraphite:"#1F2937",
        textGray:    "#6B7280",
        alertRed:    "#EF4444",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui"],
      },
      boxShadow: {
        card: "0 1px 4px 0 rgba(31,41,55,0.08)",
        "card-hover": "0 4px 16px 0 rgba(31,41,55,0.12)",
      },
      animation: {
        "pulse-fast": "pulse 0.8s cubic-bezier(0.4,0,0.6,1) infinite",
        "slide-in": "slideIn 0.3s ease-out",
        "fade-in": "fadeIn 0.2s ease-out",
      },
      keyframes: {
        slideIn: {
          "0%": { transform: "translateX(100%)", opacity: 0 },
          "100%": { transform: "translateX(0)", opacity: 1 },
        },
        fadeIn: {
          "0%": { opacity: 0 },
          "100%": { opacity: 1 },
        },
      },
    },
  },
  plugins: [],
};
