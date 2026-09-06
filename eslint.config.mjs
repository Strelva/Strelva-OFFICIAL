import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  {
    ignores: [
      ".claude/**",
      ".next/**",
      ".next-playwright/**",
      ".playwright-mcp/**",
      "test-results/**",
      "src/sanity/**",
      // Independently configured applications, not source owned by this package.
      "strelva-marketing/**",
      "client-prototypes/**",
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
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
