import { defineConfig, loadEnv } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import viteTsConfigPaths from 'vite-tsconfig-paths'
import { fileURLToPath, URL } from 'url'

import tailwindcss from '@tailwindcss/vite'
import { cloudflare } from '@cloudflare/vite-plugin'

const config = defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, process.cwd(), '')

  return {
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    // Make env vars available to server-side code
    define: {
      'process.env.WORKOS_CLIENT_ID': JSON.stringify(env.WORKOS_CLIENT_ID),
      'process.env.WORKOS_API_KEY': JSON.stringify(env.WORKOS_API_KEY),
      'process.env.WORKOS_REDIRECT_URI': JSON.stringify(env.WORKOS_REDIRECT_URI),
      'process.env.WORKOS_COOKIE_PASSWORD': JSON.stringify(env.WORKOS_COOKIE_PASSWORD),
      'process.env.WORKOS_API_HOSTNAME': JSON.stringify(env.WORKOS_API_HOSTNAME),
      'process.env.WORKOS_COOKIE_NAME': JSON.stringify(env.WORKOS_COOKIE_NAME),
    },
    plugins: [
      devtools(),
      cloudflare({ viteEnvironment: { name: 'ssr' } }),
      // this is the plugin that enables path aliases
      viteTsConfigPaths({
        projects: ['./tsconfig.json'],
      }),
      tailwindcss(),
      tanstackStart(),
      viteReact(),
    ],
  }
})

export default config
