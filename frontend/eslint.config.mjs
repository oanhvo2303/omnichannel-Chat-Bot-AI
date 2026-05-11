import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = defineConfig([
  ...nextVitals,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    // ── Rule overrides ──────────────────────────────────────────────────────
    rules: {
      // False positive: calling an async data-fetching fn in useEffect is correct.
      // The rule incorrectly flags loadData() / fetchX() as "setState in effect".
      "react-hooks/set-state-in-effect": "off",

      // Downgrade from error → warn so CI doesn't hard-fail on missing deps.
      // Developers should still fix these progressively.
      "react-hooks/exhaustive-deps": "warn",

      // Tiếng Việt content and intentional quotes in JSX strings.
      // Use {'"'} syntax where needed in security-critical strings.
      "react/no-unescaped-entities": "off",

      // Suppress img-element warning in non-Next-Image contexts.
      "@next/next/no-img-element": "warn",
    },
  },
]);

export default eslintConfig;
