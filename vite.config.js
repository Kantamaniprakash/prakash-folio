import 'dotenv/config'
import restart from 'vite-plugin-restart'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default {
    root: 'sources/', // Sources files (typically where index.html is)
    envDir: '../',  // Directory where the env file is located
    publicDir: '../static/', // Path from "root" to static assets (files that are served as they are)
    base: './', // Public path (what's after the domain)
    server:
    {
        // https: true,
        host: true, // Open to local network and display URL
        open: true // Open in browser
    },
    build:
    {
        outDir: '../dist', // Output in the dist/ folder
        emptyOutDir: true, // Empty the folder first
        sourcemap: false, // Add sourcemap
        // Explicit target: without it, vite-plugin-top-level-await falls back to the
        // old Vite 6 default list (es2020/chrome87/...), which esbuild >= 0.27 (pulled
        // in by Vite 7.3) can no longer lower destructuring to. es2022 matches Vite 7's
        // "baseline-widely-available" default browser support.
        target: 'es2022'
    },
    plugins:
    [
        wasm(),
        topLevelAwait(),
        restart({ restart: [ '../static/**', ] }), // Restart server on static file change
        nodePolyfills(),
        // basicSsl()
    ]
}