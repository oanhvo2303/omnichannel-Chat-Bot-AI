import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = defineConfig([
  ...nextVitals,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // False positive: calling an async data-fetching fn in useEffect is correct.
      "react-hooks/set-state-in-effect": "off",

      // Warn only — devs should fix progressively but it won't block CI.
      "react-hooks/exhaustive-deps": "warn",

      // Vietnamese content + intentional quotes in JSX.
      "react/no-unescaped-entities": "off",

      // All <img> in this project are dynamic external CDN URLs (FB avatars, product images)
      // that cannot be statically optimized by next/image — disable entirely.
      "@next/next/no-img-element": "off",

      // Decorative images (avatars, thumbnails) may intentionally use alt=""
      // which IS semantically correct — disable blanket rule.
      "jsx-a11y/alt-text": "off",
    },
  },
]);

export default eslintConfig;

