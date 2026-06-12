import tseslint from "typescript-eslint";

/**
 * Root lint rules for packages/** (apps/web carries its own Next.js config).
 * These rules are load-bearing plan invariants, not style:
 *  - no-console: workers/jobs must use the @billcheck/shared logger (field
 *    allowlist = the no-PHI-in-logs enforcement mechanism).
 *  - no-restricted-imports @anthropic-ai/sdk: the shared LLM client wrapper is
 *    the ONLY Anthropic entry point (it writes the ai_calls ledger).
 *  - engine/shared purity: no React/Next imports in packages (arch D2/D9).
 */
export default [
  { ignores: ["**/node_modules/**", "**/.next/**", "**/dist/**", "apps/**"] },
  {
    files: ["packages/**/*.ts"],
    languageOptions: { parser: tseslint.parser },
    rules: {
      "no-console": "error",
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@anthropic-ai/sdk",
              message:
                "Direct Anthropic SDK use is banned — call @billcheck/shared's llm client (the only entry point; writes the ai_calls ledger).",
            },
            { name: "react", message: "packages/* are UI-free (arch D2/D9)." },
            { name: "next", message: "packages/* are UI-free (arch D2/D9)." },
          ],
          patterns: ["next/*", "react-dom*", "@anthropic-ai/sdk/*"],
        },
      ],
    },
  },
  {
    // The single sanctioned Anthropic entry point.
    files: ["packages/shared/src/llm/**"],
    rules: { "no-restricted-imports": "off" },
  },
  {
    // The logger itself writes to stdout by design.
    files: ["packages/shared/src/logger.ts"],
    rules: { "no-console": "off" },
  },
];
