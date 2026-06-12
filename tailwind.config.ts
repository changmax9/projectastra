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
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))"
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))"
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))"
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))"
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))"
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))"
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))"
        },
        ink: "#172033",
        paper: "#f3f6fa",
        "astra-navy": "#071426",
        "astra-ink": "#162033",
        "astra-slate": "#334155",
        "astra-ivory": "#fbf8ef",
        "astra-warm": "#fffdf7",
        "astra-paper": "#f7f3e8",
        "astra-blue": "#1d4f91",
        "astra-cyan": "#0891b2",
        "astra-gold": "#b98b2f",
        brand: "#315f9f",
        "brand-dark": "#214a82",
        "brand-soft": "#e9f1ff",
        "academic-accent": "#0f766e",
        "accent-soft": "#e6f5f3",
        success: "#15803d",
        warning: "#b45309",
        danger: "#b91c1c"
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)"
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
