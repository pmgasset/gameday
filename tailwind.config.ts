import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: { extend: { fontFamily: { sans: ["var(--font-sans)", "ui-sans-serif", "system-ui"] } } },
  plugins: []
} satisfies Config;
