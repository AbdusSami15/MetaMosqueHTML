export default {
  root: ".",
  // For GitHub Pages: if site is at user.github.io/RepoName/, set base: "/RepoName/"
  base: "/",
  publicDir: "public",
  server: {
    port: 5173,
    open: true,
  },
  build: {
    outDir: "dist",
    rollupOptions: {
      input: "index.html",
    },
  },
};
