import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          900: "#05070B",
          800: "#080B11",
          700: "#0C1019",
          600: "#11161F",
          500: "#161C28",
          400: "#1E2533",
        },
        signal: {
          DEFAULT: "#34E7C5",
          dim: "#1FA088",
          glow: "#5FFCE0",
        },
        violet: {
          DEFAULT: "#7C5CFF",
          dim: "#5B43C7",
        },
        mute: "#6B7689",
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(52,231,197,0.25), 0 0 24px -4px rgba(52,231,197,0.35)",
        panel: "0 1px 0 0 rgba(255,255,255,0.04) inset, 0 24px 64px -32px rgba(0,0,0,0.9)",
      },
      keyframes: {
        pulseline: {
          "0%, 100%": { opacity: "0.35" },
          "50%": { opacity: "1" },
        },
        sweep: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
        rise: {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        pulseline: "pulseline 2.4s ease-in-out infinite",
        sweep: "sweep 2.6s linear infinite",
        rise: "rise 0.4s ease-out both",
      },
    },
  },
  plugins: [],
};
export default config;
