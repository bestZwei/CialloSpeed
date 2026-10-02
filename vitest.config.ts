import { defineConfig } from 'vitest/config'

/**
 * 单元测试独立配置：不加载 vite.config.ts，避免构建期 i18n 插件干扰。
 * 环境用 node + 最小 DOM 桩（tests/setup.ts），不为几个纯函数引入 jsdom。
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
  },
})
