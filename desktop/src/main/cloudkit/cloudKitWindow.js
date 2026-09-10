// Gerencia a BrowserWindow oculta que hospeda o CloudKit JS (biblioteca de
// browser da Apple - nao roda no processo main, que e Node puro sem DOM).
// Protocolo request/response por id sobre IPC, mesmo principio do resto do
// app (ver ipcMain.handle em src/main/index.js).
import { BrowserWindow, ipcMain } from "electron";
import { is } from "@electron-toolkit/utils";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CLOUDKIT_API_TOKEN,
  CLOUDKIT_CONTAINER_ID,
  CLOUDKIT_ENVIRONMENT,
} from "../cloudkitConfig.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

const COMMAND_TIMEOUT_MS = 30000;

let workerWindow = null;
let readyPromise = null;
let requestSeq = 0;
const pending = new Map();

ipcMain.on("cloudkit:reply", (event, { requestId, result, error }) => {
  // So aceita resposta de quem o main de fato mandou trabalhar: a janela
  // oculta do CloudKit hospeda script remoto de terceiro, entao qualquer
  // outro sender (ou uma navegacao inesperada dessa mesma janela) nao pode
  // forjar a resposta de um fetchVaultMetaAsync/saveVaultMetaAsync em voo.
  if (!workerWindow || event.sender !== workerWindow.webContents) {
    return;
  }

  const waiter = pending.get(requestId);
  if (!waiter) {
    return;
  }
  pending.delete(requestId);
  if (error) {
    waiter.reject(new Error(error));
  } else {
    waiter.resolve(result);
  }
});

const rawSendCommand = (window, type, payload) => {
  const requestId = `${Date.now()}-${requestSeq++}`;

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(requestId);
      reject(new Error("Tempo esgotado ao falar com o iCloud."));
    }, COMMAND_TIMEOUT_MS);

    pending.set(requestId, {
      resolve: (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      reject: (err) => {
        clearTimeout(timeout);
        reject(err);
      },
    });

    window.webContents.send("cloudkit:command", { requestId, type, payload });
  });
};

// Sessao persistida numa partition dedicada ("persist:cloudkit") - os
// cookies/estado de auth do CloudKit JS sobrevivem a restarts do app, entao
// a janela so precisa ficar visivel na primeira vez / apos expirar.
const createWorkerWindow = () => {
  const window = new BrowserWindow({
    width: 480,
    height: 360,
    show: false,
    webPreferences: {
      // Bundlado separadamente pelo electron-vite (ver
      // electron.vite.config.mjs, entrada "cloudkit/worker-preload") -
      // fica em out/preload/, nao em out/main/cloudkit/ como worker.html
      // (que e copiado como asset estatico, sem passar pelo Rollup).
      preload: join(__dirname, "../preload/cloudkit/worker-preload.js"),
      partition: "persist:cloudkit",
      devTools: is.dev,
    },
  });

  window.loadFile(join(__dirname, "cloudkit/worker.html"));

  // Essa janela hospeda CloudKit JS (script remoto de terceiro) e expoe a
  // ponte privilegiada cloudkitBridge - trava a navegacao do frame
  // principal aos dominios esperados do fluxo (Apple ID sign-in), pra que
  // uma navegacao inesperada nao acabe reaproveitando o mesmo preload
  // privilegiado num destino nao confiavel.
  const ALLOWED_NAVIGATION_HOSTS = [
    "cdn.apple-cloudkit.com",
    "idmsa.apple.com",
    "appleid.apple.com",
  ];
  const isAllowedNavigation = (url) => {
    try {
      return ALLOWED_NAVIGATION_HOSTS.includes(new URL(url).hostname);
    } catch {
      return false;
    }
  };
  window.webContents.on("will-navigate", (event, url) => {
    if (url.startsWith("file://")) {
      return;
    }
    if (!isAllowedNavigation(url)) {
      event.preventDefault();
    }
  });
  window.webContents.setWindowOpenHandler(({ url }) =>
    isAllowedNavigation(url)
      ? { action: "allow" }
      : { action: "deny" },
  );

  window.on("closed", () => {
    workerWindow = null;
    readyPromise = null;
  });

  return window;
};

const getReadyWorkerWindow = async () => {
  if (!workerWindow || workerWindow.isDestroyed()) {
    workerWindow = createWorkerWindow();
    readyPromise = new Promise((resolve) => {
      workerWindow.webContents.once("did-finish-load", resolve);
    }).then(() =>
      rawSendCommand(workerWindow, "configure", {
        containerId: CLOUDKIT_CONTAINER_ID,
        apiToken: CLOUDKIT_API_TOKEN,
        environment: CLOUDKIT_ENVIRONMENT,
      }),
    );
  }

  await readyPromise;
  return workerWindow;
};

export const sendCommand = async (type, payload) => {
  const window = await getReadyWorkerWindow();
  return rawSendCommand(window, type, payload);
};

// Sign-in e sempre uma acao explicita do usuario (mesmo principio do Drive,
// ver src/services/driveAuth.js) - so mostra a janela quando chamado por um
// clique real, nunca automaticamente no boot/getAccountStatusAsync.
export const showSignInWindow = async () => {
  const window = await getReadyWorkerWindow();
  window.show();

  try {
    return await rawSendCommand(window, "signIn", {});
  } finally {
    if (!window.isDestroyed()) {
      window.hide();
    }
  }
};
