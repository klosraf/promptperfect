import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Zero-any policy (baseline: 0 real occurrences, 2026-10-18).
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    // Server modules only from server contexts. Scoped to client-side
    // directories: lib/server files import each other via the same alias,
    // and Server Components may legitimately do so — both stay allowed.
    files: [
      'src/hooks/**/*.ts',
      'src/lib/client/**/*.ts',
      'src/components/**/*.ts',
      'src/components/**/*.tsx',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/lib/server/*'],
              // Type-only imports are erased at compile time and cannot
              // leak server code into client bundles.
              allowTypeImports: true,
              message:
                'Server-only module: import from Route Handlers or Server Components, never from client components/hooks.',
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "coverage/**",
    "extension/**",
  ]),
]);

export default eslintConfig;
