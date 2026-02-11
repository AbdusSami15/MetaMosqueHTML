export default {
  root: ".",
  base: process.env.NODE_ENV === "production" ? "/MetaMosqueHTML/" : "/",
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
