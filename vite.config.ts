import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
    build: {
        outDir: "dist",
        emptyOutDir: true,
        sourcemap: true,
        lib: {
            entry: path.resolve(__dirname, "src/module.ts"),
            formats: ["es"],
            fileName: "module",
        },
        rollupOptions: {
            output: {
                // Keep CSS as a separate file
                assetFileNames: "[name][extname]",
            },
        },
    },
    css: {
        preprocessorOptions: {
            scss: {
                // Add any global SCSS variables or mixins here
            },
        },
    },
});
