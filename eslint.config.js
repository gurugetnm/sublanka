import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  { ignores: ['dist'] },
  js.configs.recommended,
  tseslint.configs.strict,
  reactHooks.configs.flat.recommended,
  { languageOptions: { globals: globals.browser } },
);
