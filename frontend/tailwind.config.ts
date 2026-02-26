import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        "paper-bg": "#f4f5f7",
        "paper-text": "#101828",
        "paper-accent": "#006a62"
      }
    }
  },
  plugins: []
};

export default config;
