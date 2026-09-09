// Preload minimo da janela oculta do CloudKit - so repassa comandos do
// processo main pro worker-renderer.js e as respostas de volta, igual ao
// preload principal (desktop/src/preload/index.js) nao tem logica de
// cripto/rede aqui.
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("cloudkitBridge", {
  onCommand: (callback) => {
    ipcRenderer.on("cloudkit:command", (_event, command) => callback(command));
  },
  reply: (requestId, result, error) => {
    ipcRenderer.send("cloudkit:reply", { requestId, result, error });
  },
});
