import js from '@eslint/js'
import vue from 'eslint-plugin-vue'
import ts from 'typescript-eslint'

export default ts.config(
  { ignores: ['**/.nuxt/**', '**/.output/**', '**/node_modules/**'] },
  js.configs.recommended,
  ...ts.configs.recommended,
  // TypeScript checks undefined identifiers, including DOM globals, with the app tsconfigs.
  { files: ['**/*.ts', '**/*.vue'], rules: { 'no-undef': 'off' } },
  ...vue.configs['flat/recommended'],
  { files: ['**/*.vue'], languageOptions: { parserOptions: { parser: ts.parser } }, rules: { 'vue/multi-word-component-names': 'off', 'vue/html-self-closing': 'off', 'vue/max-attributes-per-line': 'off', 'vue/singleline-html-element-content-newline': 'off' } },
  { files: ['**/*.ts', '**/*.vue'], languageOptions: { globals: { defineNuxtConfig: 'readonly', useHead: 'readonly', defineNuxtPlugin: 'readonly' } } },
)
