import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  {
    ignores: [
      ".claude/**",
      ".next/**",
      // Isolated Next.js validation servers use a distinct distDir.
      ".next-*/**",
      ".next-playwright/**",
      ".next-self-service/**",
      ".next-self-service-build/**",
      ".playwright-mcp/**",
      "test-results/**",
      ".validation-artifacts/**",
      "src/sanity/**",
      // Generated output from independently configured applications. Their source
      // stays lintable if either workspace is ever checked into this repository.
      "strelva-marketing/.next/**",
      "strelva-marketing/.next-*/**",
      "client-prototypes/.next/**",
      "client-prototypes/.next-*/**",
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    // Node's explicitly CommonJS study/build tools use require by design.
    files: ["docs/prototypes/**/*.cjs", "scripts/**/*.cjs"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
      "@next/next/no-img-element": "off",
    },
  },
];

export default eslintConfig;
