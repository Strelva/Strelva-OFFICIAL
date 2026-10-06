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
      // Local research and screenshot output, not product source.
      "output/**",
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
        "error",
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
  {
    // One model-call helper (docs/product/specs/ask-strelva.md section 5):
    // every model call goes through src/platform/infra/model-calls.ts, which
    // owns fallback, the pinned-model rule, and one cost row per provider call.
    files: ["src/**/*.{ts,tsx,js,jsx,mjs,cjs}"],
    ignores: ["src/platform/infra/model-calls.ts", "src/lib/ai-models.ts", "src/__tests__/**"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [
          {
            name: "ai",
            importNames: ["generateText", "streamText", "generateObject", "streamObject"],
            message: "Call models through src/platform/infra/model-calls.ts so every call is logged and costed.",
          },
          { name: "@ai-sdk/google", message: "Models come from src/lib/ai-models.ts through the model-call helper." },
          { name: "@ai-sdk/anthropic", message: "Models come from src/lib/ai-models.ts through the model-call helper." },
          { name: "@ai-sdk/openai", message: "Models come from src/lib/ai-models.ts through the model-call helper." },
        ],
      }],
      "no-restricted-syntax": ["error", {
        selector: "ImportExpression[source.value=/^(ai|@ai-sdk\\/(google|anthropic|openai))$/]",
        message: "Call models through src/platform/infra/model-calls.ts so every call is logged and costed.",
      }],
    },
  },
];

export default eslintConfig;
