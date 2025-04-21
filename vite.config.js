import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        player: 'public/player.html' // 或 'player.html' 视你的public配置
      }
    }
  }
});
