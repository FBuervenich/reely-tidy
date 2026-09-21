import { defineConfig } from 'vite-plus'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    restoreMocks: true,
    unstubGlobals: true,
  },
  fmt: {
    singleQuote: true,
    semi: false,
  },
  lint: {
    plugins: ['typescript', 'vue'],
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  staged: {
    '*.{css,html,json,js,ts,tsx,vue}': 'vp check --fix',
  },
})
