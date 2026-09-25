import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import hooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', '*.cjs', 'tests/**'] },
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    plugins: { 'react-hooks': hooks },
    linterOptions: { reportUnusedDisableDirectives: false },
    languageOptions: { globals: { window: 'readonly', document: 'readonly', navigator: 'readonly', console: 'readonly', localStorage: 'readonly', FormData: 'readonly', File: 'readonly', Blob: 'readonly', URL: 'readonly', URLSearchParams: 'readonly', CustomEvent: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly' } },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      // Existing API envelopes are progressively typed by each module.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      'no-undef': 'off',
    },
  },
);
