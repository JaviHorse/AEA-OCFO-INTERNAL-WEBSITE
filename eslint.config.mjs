import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  globalIgnores([
    ".next/**",
    "node_modules/**",
    "artifacts/**",
    ".tools/**",
    ".diagnostics/**",
    "next-env.d.ts",
  ]),
  {
    files: ["tests/**", "scripts/**"],
    // Test adapters deliberately model dynamic database/API responses.
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@next/next/no-assign-module-variable": "off",
    },
  },
]);
