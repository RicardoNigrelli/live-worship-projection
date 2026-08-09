import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "secondary-fixed": "#fedea5",
        "tertiary-fixed": "#ffdada",
        "surface-container-highest": "#f1dedd",
        "secondary-container": "#fbdca2",
        "on-primary-fixed": "#002020",
        "on-tertiary-fixed": "#40000a",
        "surface-tint": "#006a6a",
        "secondary-fixed-dim": "#e1c38b",
        "tertiary": "#9d3b42",
        "on-surface-variant": "#3d4949",
        "error-container": "#ffdad6",
        "tertiary-container": "#bc5359",
        "on-secondary": "#ffffff",
        "surface-container-lowest": "#ffffff",
        "on-primary-fixed-variant": "#004f4f",
        "inverse-primary": "#6ed7d6",
        "on-error": "#ffffff",
        "surface-dim": "#e8d6d5",
        "outline": "#6d7979",
        "primary-fixed": "#8cf3f3",
        "on-surface": "#231919",
        "on-secondary-fixed-variant": "#584418",
        "surface-container-high": "#f7e4e3",
        "background": "#fff8f7",
        "tertiary-fixed-dim": "#ffb3b4",
        "on-tertiary-container": "#fffbff",
        "on-background": "#231919",
        "surface-container-low": "#fff0ef",
        "outline-variant": "#bcc9c8",
        "on-secondary-container": "#765f31",
        "on-error-container": "#93000a",
        "inverse-surface": "#392e2d",
        "primary": "#006767",
        "on-secondary-fixed": "#261900",
        "on-primary": "#ffffff",
        "surface-container": "#fdeae9",
        "on-primary-container": "#f3fffe",
        "surface-bright": "#fff8f7",
        "inverse-on-surface": "#ffedec",
        "on-tertiary": "#ffffff",
        "surface": "#fff8f7",
        "primary-fixed-dim": "#6ed7d6",
        "secondary": "#725b2d",
        "primary-container": "#008282",
        "surface-variant": "#f1dedd",
        "on-tertiary-fixed-variant": "#81262f",
        "error": "#ba1a1a"
      },
      borderRadius: {
        "DEFAULT": "0.25rem",
        "lg": "0.5rem",
        "xl": "0.75rem",
        "full": "9999px"
      },
      fontFamily: {
        "headline": ["Epilogue", "sans-serif"],
        "body": ["Inter", "sans-serif"],
        "label": ["Inter", "sans-serif"]
      }
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/container-queries')
  ],
};
export default config;
