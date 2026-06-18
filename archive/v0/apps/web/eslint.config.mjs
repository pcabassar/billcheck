import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // WDK-generated runtime shims:
    "app/.well-known/**",
    "app/_workflow/**",
  ]),
  // AGENTS.md invariants, enforced for the app too (review F62 — these were
  // only promised, not wired, for apps/web):
  //  - no console.*: the field-allowlist logger is the only log path (PHI).
  //  - no direct Anthropic SDK imports: packages/shared/src/llm/client.ts is
  //    the single entry point (ledger + PHASE gate live there).
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "no-console": "error",
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@anthropic-ai/sdk",
              message:
                "Direct Anthropic SDK use is banned outside packages/shared/src/llm/client.ts — import { llm } from '@/lib/llm' (AGENTS.md: single LLM entry point).",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
