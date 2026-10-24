import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import prettierConfig from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import boundaries from 'eslint-plugin-boundaries';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

const ELEMENT_TYPES = ['app', 'pages', 'widgets', 'features', 'entities', 'shared', 'test'];

const publicApi = (type) => ({ type, internalPath: 'index.ts' });

const LAYER_RULES = [
  {
    from: { type: 'app' },
    allow: {
      to: [
        { type: 'app' },
        publicApi('pages'),
        publicApi('widgets'),
        publicApi('features'),
        publicApi('entities'),
        { type: 'shared' },
      ],
    },
  },
  {
    from: { type: 'pages' },
    allow: {
      to: [publicApi('widgets'), publicApi('features'), publicApi('entities'), { type: 'shared' }],
    },
  },
  {
    from: { type: 'widgets' },
    allow: { to: [publicApi('features'), publicApi('entities'), { type: 'shared' }] },
  },
  { from: { type: 'features' }, allow: { to: [publicApi('entities'), { type: 'shared' }] } },
  { from: { type: 'entities' }, allow: { to: [publicApi('entities'), { type: 'shared' }] } },
  { from: { type: 'shared' }, allow: { to: { type: 'shared' } } },
  { from: { type: 'test' }, allow: { to: { type: ELEMENT_TYPES } } },
];

const layerPolicy = (rules) => ['error', { default: 'disallow', rules }];

export default [
  {
    ignores: ['src/shared/api/schema.d.ts'],
  },

  js.configs.recommended,

  ...tsPlugin.configs['flat/recommended-type-checked'],
  ...tsPlugin.configs['flat/stylistic-type-checked'],

  react.configs.flat.recommended,
  react.configs.flat['jsx-runtime'],
  reactHooks.configs.flat.recommended,

  jsxA11y.flatConfigs.recommended,

  importPlugin.flatConfigs.recommended,
  importPlugin.flatConfigs.typescript,

  {
    languageOptions: {
      globals: {
        ...globals.browser,
      },
      ecmaVersion: 'latest',
      sourceType: 'module',
      parser: tsParser,
      parserOptions: {
        project: ['./tsconfig.json', './tsconfig.node.json'],
        tsconfigRootDir: import.meta.dirname,
        noWarnOnMultipleProjects: true,
        warnOnUnsupportedTypeScriptVersion: false,
      },
    },
    settings: {
      react: { version: 'detect' },
      'import/resolver': {
        typescript: {
          project: ['./tsconfig.json', './tsconfig.node.json'],
          noWarnOnMultipleProjects: true,
        },
        node: { extensions: ['.js', '.jsx', '.ts', '.tsx'] },
      },
      'boundaries/elements': [
        { type: 'app', pattern: 'src/app/*' },
        { type: 'pages', pattern: 'src/pages/*' },
        { type: 'widgets', pattern: 'src/widgets/*' },
        { type: 'features', pattern: 'src/features/*' },
        { type: 'entities', pattern: 'src/entities/*' },
        { type: 'shared', pattern: 'src/shared/*' },
        { type: 'test', pattern: 'src/test' },
      ],
    },
    plugins: {
      boundaries,
    },
    rules: {
      'no-console': ['error', { allow: ['warn', 'error'] }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/only-throw-error': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      'react-hooks/exhaustive-deps': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      'react/prop-types': 'off',
      'react/react-in-jsx-scope': 'off',
      'react/forbid-dom-props': ['error', { forbid: ['title'] }],
      'import/no-unresolved': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: "MetaProperty[meta.name='import'][property.name='meta']",
          message:
            'Use @/shared/config/build or @/shared/config/runtime instead of import.meta.env',
        },
        {
          selector: "MemberExpression[object.name='window'][property.name='__APP_CONFIG__']",
          message:
            'Use runtimeConfig from @/shared/config/runtime instead of window.__APP_CONFIG__',
        },
      ],
      'boundaries/no-unknown': 'error',
      'boundaries/dependencies': layerPolicy(LAYER_RULES),
      'import/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index', 'type'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'import/no-internal-modules': 'off',
    },
  },

  {
    files: ['src/test/**/*.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/consistent-type-imports': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
    },
  },

  {
    files: ['src/**/*.test.{ts,tsx}'],
    rules: {
      'boundaries/dependencies': layerPolicy([...LAYER_RULES, { allow: { to: { type: 'test' } } }]),
    },
  },

  prettierConfig,

  {
    files: ['src/app/main.tsx', '*.config.ts'],
    rules: {
      'import/no-internal-modules': 'off',
    },
  },
  {
    files: ['src/shared/config/runtime.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "MetaProperty[meta.name='import'][property.name='meta']",
          message:
            'Use @/shared/config/build or @/shared/config/runtime instead of import.meta.env',
        },
      ],
    },
  },
];
