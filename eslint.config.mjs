import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  // eslint-plugin-react's automatic version detection calls the ESLint 9
  // context.getFilename() API, which was removed in ESLint 10 and throws before
  // any file is linted. Pinning the React version skips that detection path.
  {
    settings: { react: { version: "18" } },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "next-env.d.ts",
    "interlink/**",
    "interlink-capifull/**",
  ]),
]);
