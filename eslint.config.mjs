import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextVitals,
  ...nextTypescript,
  {
    files: ["ops/**/*.cjs", "scripts/**/*.cjs"],
    rules: { "@typescript-eslint/no-require-imports": "off" }
  },
  {
    ignores: [".next/**", ".vercel/**", "node_modules/**", ".npm-cache/**"]
  }
];

export default eslintConfig;
