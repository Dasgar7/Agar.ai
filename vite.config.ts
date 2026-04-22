import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [
      react(), 
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icon.svg'],
        manifest: {
          name: 'Agar.ai',
          short_name: 'Agar.ai',
          description: 'The ultimate professional assistant for the Agar.io community.',
          theme_color: '#ffffff',
          background_color: '#ffffff',
          display: 'standalone',
          icons: [
            {
              src: 'https://ais-dev-d3gc25x65e3de7aphxm3v3-668524114795.europe-west2.run.app/icon.svg?v=5',
              sizes: '192x192',
              type: 'image/svg+xml'
            },
            {
              src: 'https://ais-dev-d3gc25x65e3de7aphxm3v3-668524114795.europe-west2.run.app/icon.svg?v=5',
              sizes: '512x512',
              type: 'image/svg+xml'
            },
            {
              src: 'https://ais-dev-d3gc25x65e3de7aphxm3v3-668524114795.europe-west2.run.app/icon.svg?v=5',
              sizes: '512x512',
              type: 'image/svg+xml',
              purpose: 'any maskable'
            }
          ]
        }
      })
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
