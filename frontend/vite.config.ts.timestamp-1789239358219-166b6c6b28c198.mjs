// vite.config.ts
import { defineConfig } from "file:///C:/Users/BK%20Magsi/Downloads/school-management-system/frontend/node_modules/vite/dist/node/index.js";
import react from "file:///C:/Users/BK%20Magsi/Downloads/school-management-system/frontend/node_modules/@vitejs/plugin-react/dist/index.js";
import path from "path";
var __vite_injected_original_dirname = "C:\\Users\\BK Magsi\\Downloads\\school-management-system\\frontend";
var vite_config_default = defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__vite_injected_original_dirname, "./src")
    }
  },
  server: {
    host: true,
    // bind 0.0.0.0 so previews/dev on any host work
    port: 5173,
    // Allow the sandbox preview hosts and local development hosts
    allowedHosts: [".e2b.app", "localhost", "127.0.0.1"],
    proxy: {
      "/api": {
        target: process.env.VITE_PROXY_TARGET || "http://127.0.0.1:4000",
        changeOrigin: true
      },
      "/uploads": {
        target: process.env.VITE_PROXY_TARGET || "http://127.0.0.1:4000",
        changeOrigin: true
      }
    }
  },
  preview: {
    host: true,
    port: 4173,
    allowedHosts: [".e2b.app", "localhost", "127.0.0.1"]
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxCSyBNYWdzaVxcXFxEb3dubG9hZHNcXFxcc2Nob29sLW1hbmFnZW1lbnQtc3lzdGVtXFxcXGZyb250ZW5kXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxCSyBNYWdzaVxcXFxEb3dubG9hZHNcXFxcc2Nob29sLW1hbmFnZW1lbnQtc3lzdGVtXFxcXGZyb250ZW5kXFxcXHZpdGUuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9DOi9Vc2Vycy9CSyUyME1hZ3NpL0Rvd25sb2Fkcy9zY2hvb2wtbWFuYWdlbWVudC1zeXN0ZW0vZnJvbnRlbmQvdml0ZS5jb25maWcudHNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tICd2aXRlJztcbmltcG9ydCByZWFjdCBmcm9tICdAdml0ZWpzL3BsdWdpbi1yZWFjdCc7XG5pbXBvcnQgcGF0aCBmcm9tICdwYXRoJztcblxuLy8gaHR0cHM6Ly92aXRlanMuZGV2L2NvbmZpZy9cbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZyh7XG4gIHBsdWdpbnM6IFtyZWFjdCgpXSxcbiAgcmVzb2x2ZToge1xuICAgIGFsaWFzOiB7XG4gICAgICAnQCc6IHBhdGgucmVzb2x2ZShfX2Rpcm5hbWUsICcuL3NyYycpLFxuICAgIH0sXG4gIH0sXG4gIHNlcnZlcjoge1xuICAgIGhvc3Q6IHRydWUsIC8vIGJpbmQgMC4wLjAuMCBzbyBwcmV2aWV3cy9kZXYgb24gYW55IGhvc3Qgd29ya1xuICAgIHBvcnQ6IDUxNzMsXG4gICAgLy8gQWxsb3cgdGhlIHNhbmRib3ggcHJldmlldyBob3N0cyBhbmQgbG9jYWwgZGV2ZWxvcG1lbnQgaG9zdHNcbiAgICBhbGxvd2VkSG9zdHM6IFsnLmUyYi5hcHAnLCAnbG9jYWxob3N0JywgJzEyNy4wLjAuMSddLFxuICAgIHByb3h5OiB7XG4gICAgICAnL2FwaSc6IHtcbiAgICAgICAgdGFyZ2V0OiBwcm9jZXNzLmVudi5WSVRFX1BST1hZX1RBUkdFVCB8fCAnaHR0cDovLzEyNy4wLjAuMTo0MDAwJyxcbiAgICAgICAgY2hhbmdlT3JpZ2luOiB0cnVlLFxuICAgICAgfSxcbiAgICAgICcvdXBsb2Fkcyc6IHtcbiAgICAgICAgdGFyZ2V0OiBwcm9jZXNzLmVudi5WSVRFX1BST1hZX1RBUkdFVCB8fCAnaHR0cDovLzEyNy4wLjAuMTo0MDAwJyxcbiAgICAgICAgY2hhbmdlT3JpZ2luOiB0cnVlLFxuICAgICAgfSxcbiAgICB9LFxuICB9LFxuICBwcmV2aWV3OiB7XG4gICAgaG9zdDogdHJ1ZSxcbiAgICBwb3J0OiA0MTczLFxuICAgIGFsbG93ZWRIb3N0czogWycuZTJiLmFwcCcsICdsb2NhbGhvc3QnLCAnMTI3LjAuMC4xJ10sXG4gIH0sXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBdVgsU0FBUyxvQkFBb0I7QUFDcFosT0FBTyxXQUFXO0FBQ2xCLE9BQU8sVUFBVTtBQUZqQixJQUFNLG1DQUFtQztBQUt6QyxJQUFPLHNCQUFRLGFBQWE7QUFBQSxFQUMxQixTQUFTLENBQUMsTUFBTSxDQUFDO0FBQUEsRUFDakIsU0FBUztBQUFBLElBQ1AsT0FBTztBQUFBLE1BQ0wsS0FBSyxLQUFLLFFBQVEsa0NBQVcsT0FBTztBQUFBLElBQ3RDO0FBQUEsRUFDRjtBQUFBLEVBQ0EsUUFBUTtBQUFBLElBQ04sTUFBTTtBQUFBO0FBQUEsSUFDTixNQUFNO0FBQUE7QUFBQSxJQUVOLGNBQWMsQ0FBQyxZQUFZLGFBQWEsV0FBVztBQUFBLElBQ25ELE9BQU87QUFBQSxNQUNMLFFBQVE7QUFBQSxRQUNOLFFBQVEsUUFBUSxJQUFJLHFCQUFxQjtBQUFBLFFBQ3pDLGNBQWM7QUFBQSxNQUNoQjtBQUFBLE1BQ0EsWUFBWTtBQUFBLFFBQ1YsUUFBUSxRQUFRLElBQUkscUJBQXFCO0FBQUEsUUFDekMsY0FBYztBQUFBLE1BQ2hCO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7QUFBQSxFQUNBLFNBQVM7QUFBQSxJQUNQLE1BQU07QUFBQSxJQUNOLE1BQU07QUFBQSxJQUNOLGNBQWMsQ0FBQyxZQUFZLGFBQWEsV0FBVztBQUFBLEVBQ3JEO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
