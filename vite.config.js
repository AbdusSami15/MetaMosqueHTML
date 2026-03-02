import { defineConfig } from 'vite';

export default defineConfig({
    server: {
        port: 5173,
        proxy: {
            '/api': {
                target: 'https://app.metamosque.com',
                changeOrigin: true,
                secure: true,
            }
        }
    },
    build: {
        outDir: 'dist',
    }
});
