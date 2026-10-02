import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

/**
 * ESLint 扁平配置：TS 走 typescript-eslint recommended（其内部已关闭 no-undef，交给编译器判定）。
 * public/ 下是第三方原样提供的脚本（NDT7 worker），不参与本项目风格约束。
 */
export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'public/**',
      '.shots/**',
      '.zcode/**',
      '.codebuddy/**',
      '.playwright-cli/**',
      'docs-tmp.html',
      'mc-tmp.html',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      'no-empty': ['error', { allowEmptyCatch: true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['src/**/*.ts'],
    rules: {
      // 浏览器侧调试输出不该进主干；scripts/ 与 build/ 是 CLI/构建工具，console 即其输出
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
)
