import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Two builds share dist/:
//   default mode  -> popup (popup.html + hashed assets) and public/ (manifest, icons)
//   mode=content  -> content.js as one self-contained IIFE, because files injected with
//                    chrome.scripting.executeScript run as classic scripts and cannot import chunks.
export default defineConfig(({ mode }) => {
  if (mode === 'content') {
    return {
      publicDir: false,
      build: {
        outDir: 'dist',
        emptyOutDir: false,
        lib: { entry: 'src/content/index.ts', formats: ['iife'], name: 'SubLankaContent', fileName: () => 'content.js' },
      },
    };
  }

  return {
    plugins: [react(), tailwindcss()],
    build: {
      outDir: 'dist',
      // Watch mode (npm run dev) runs beside the content watcher, so it must not wipe content.js.
      emptyOutDir: mode === 'production',
      rollupOptions: { input: 'popup.html' },
    },
    test: { environment: 'jsdom' },
  };
});
