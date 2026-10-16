import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        URL: 'readonly',
        fetch: 'readonly',
      },
    },
    rules: {
      "@typescript-eslint/no-namespace": ["error", { "allowDeclarations": true }],
      "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }],
      "no-restricted-globals": [
        "error",
        {
          "name": "localStorage",
          "message": "localStorage is banned by product instruction L1: Speech is ephemeral."
        },
        {
          "name": "sessionStorage",
          "message": "sessionStorage is banned by product instruction L1: Speech is ephemeral."
        },
        {
          "name": "indexedDB",
          "message": "indexedDB is banned by product instruction L1: Speech is ephemeral."
        }
      ]
    }
  }
);
