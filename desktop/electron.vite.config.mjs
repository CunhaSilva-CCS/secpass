import { cpSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";

// worker.html e worker-renderer.js (janela oculta do CloudKit, ver
// src/main/cloudkit/) sao pagina/script de browser puros, sem imports ES -
// nao precisam passar pelo Rollup, so ser copiados como estao pra dentro do
// bundle de saida do processo main (worker-preload.js, que usa "import" do
// modulo "electron", e bundlado de verdade via rollupOptions.input abaixo).
const CLOUDKIT_STATIC_ASSETS = ["worker.html", "worker-renderer.js"];

const copyCloudKitWorkerAssets = () => ({
  name: "copy-cloudkit-worker-assets",
  writeBundle() {
    const from = resolve(__dirname, "src/main/cloudkit");
    const to = resolve(__dirname, "out/main/cloudkit");
    mkdirSync(to, { recursive: true });
    for (const asset of CLOUDKIT_STATIC_ASSETS) {
      cpSync(resolve(from, asset), resolve(to, asset));
    }
  },
});

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin(), copyCloudKitWorkerAssets()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, "src/preload/index.js"),
          "cloudkit/worker-preload": resolve(
            __dirname,
            "src/main/cloudkit/worker-preload.js",
          ),
        },
      },
    },
  },
  renderer: {
    resolve: {
      alias: {
        "@renderer": resolve("src/renderer/src"),
      },
    },
    plugins: [react()],
  },
});
