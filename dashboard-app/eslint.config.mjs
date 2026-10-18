import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import react from 'eslint-plugin-react';
import globals from 'globals';

export default defineConfig([
  {
    files: ['**/*.{js,jsx,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { react },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['error', { ignoreRestSiblings: true }],
      'react/jsx-uses-vars': 'error',
    },
  },
  globalIgnores(['.next/**', 'node_modules/**', 'out/**', 'build/**', 'next-env.d.ts', 'public/**']),
]);
