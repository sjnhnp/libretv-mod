// import { defineConfig } from 'vite';
export default defineConfig({
  base: '/', // 确保与 Cloudflare Pages 部署路径一致
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        player: 'player.html'
      }
    }
  }
});

