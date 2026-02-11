export default {
  root: ".",
  // Vercel sets VERCEL=1 and serves at root; GitHub Pages uses /MetaMosqueHTML/
  base:
    process.env.VERCEL === "1"
      ? "/"
      : process.env.NODE_ENV === "production"
        ? "/MetaMosqueHTML/"
        : "/",
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
