import type { Config } from "tailwindcss";

export default {
  content: ["./src/webclient_front/**/*.{ts,tsx,html}", "./src/documents_front/**/*.{ts,tsx,html}"],
  theme: {
    extend: {}
  },
  plugins: []
} satisfies Config;
