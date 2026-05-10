import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#172033",
        paper: "#f3f6fa",
        brand: "#315f9f",
        "brand-dark": "#214a82",
        "brand-soft": "#e9f1ff",
        accent: "#0f766e",
        "accent-soft": "#e6f5f3",
        success: "#15803d",
        warning: "#b45309",
        danger: "#b91c1c"
      },
      boxShadow: {
        soft: "0 16px 40px rgba(15, 23, 42, 0.08)",
        material: "0 1px 2px rgba(15, 23, 42, 0.08), 0 10px 24px rgba(49, 95, 159, 0.10)"
      }
    }
  },
  plugins: []
};

export default config;
