import { app, BrowserWindow, ipcMain, systemPreferences } from "electron";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { is } from "@electron-toolkit/utils";

import { deleteLocalAccount, loadLocalAccount, saveLocalAccount, verifyLocalAccount } from "./core/account.js";
import { validateAccessPasswordPolicy } from "./core/securityPolicy.js";
import { createVaultSecret, validateCredentialFields } from "./core/vaultCrypto.js";
import {
  clearLocalVaultCache,
  clearVault,
  getVaultModuleForBackend,
  loadPasswords,
  migrateVaultBackend,
  peekRemoteVault,
  savePasswords,
} from "./core/storage.js";
import { createVaultTombstone, getVisibleVaultItems } from "./core/vaultMerge.js";
import { createItemId } from "./core/createItemId.js";
import { generatePassword } from "./core/passwordGenerator.js";
import { isDriveSignedIn, signInWithGoogleDrive, signOutDrive } from "./core/driveAuth.js";
import { enableCloudKitSync } from "./core/cloudKitVaultModule.js";
import {
  getSyncBackendPreference,
  setSyncBackendPreference,
} from "./core/syncPreference.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

// Estado da sessao (equivalente ao vaultSecret/items em memoria no
// HomeScreen.js do app mobile) - nunca persistido em texto claro, so vive
// enquanto o processo principal roda.
let vaultSecret = null;
let currentItems = [];
let isUnlocked = false;

const resetSession = () => {
  vaultSecret = null;
  currentItems = [];
  isUnlocked = false;
};

const persistCurrentItems = async () => {
  if (!vaultSecret) {
    return;
  }
  await savePasswords(currentItems, { vaultSecret });
};

const createWindow = () => {
  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: "#0B1420",
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
    },
  });

  window.once("ready-to-show", () => {
    window.maximize();
    window.show();
  });

  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    window.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    window.loadFile(join(__dirname, "../renderer/index.html"));
  }
};

const registerIpcHandlers = () => {
  ipcMain.handle("session:init", async () => {
    const account = loadLocalAccount();
    const remoteVault = await peekRemoteVault();
    return {
      hasLocalAccount: Boolean(account),
      email: account?.email || remoteVault?.meta?.email || "",
      hasRemoteVault: Boolean(remoteVault?.meta?.verifier),
      driveSyncActive: await isDriveSignedIn(),
      syncBackendPreference: getSyncBackendPreference(),
    };
  });

  ipcMain.handle("account:register", async (_event, { email, password }) => {
    const policyError = validateAccessPasswordPolicy(password);
    if (policyError) {
      return { ok: false, message: policyError };
    }

    try {
      saveLocalAccount({ email, password });
    } catch (err) {
      return { ok: false, message: err?.message || "Falha ao salvar a conta local." };
    }

    vaultSecret = createVaultSecret({ email, password });
    try {
      currentItems = await loadPasswords({ vaultSecret });
    } catch (err) {
      resetSession();
      return { ok: false, message: err?.message || "Falha ao abrir o cofre." };
    }
    isUnlocked = true;
    return { ok: true };
  });

  ipcMain.handle("account:login", async (_event, { email, password }) => {
    const isValid = verifyLocalAccount({ email, password });
    if (!isValid) {
      return { ok: false, message: "Email ou senha incorretos." };
    }

    vaultSecret = createVaultSecret({ email, password });
    try {
      currentItems = await loadPasswords({ vaultSecret });
    } catch (err) {
      resetSession();
      return { ok: false, message: err?.message || "Falha ao abrir o cofre." };
    }
    isUnlocked = true;
    return { ok: true };
  });

  ipcMain.handle("account:lock", () => {
    isUnlocked = false;
    return { ok: true };
  });

  ipcMain.handle("account:unlock", async () => {
    if (!vaultSecret) {
      // Depois de um restart do app (fechar/abrir de novo) a memoria do
      // processo principal e zerada - Touch ID sozinho nao tem como
      // rederivar a chave do cofre, entao pede a senha direto em vez de
      // deixar so uma mensagem sem saida.
      return {
        ok: false,
        message: "Digite sua senha de acesso - o app foi reiniciado.",
        requiresPassword: true,
      };
    }

    if (systemPreferences.canPromptTouchID?.()) {
      try {
        await systemPreferences.promptTouchID("desbloquear o cofre de senhas");
        isUnlocked = true;
        return { ok: true };
      } catch {
        return { ok: false, message: "" };
      }
    }

    return { ok: false, message: "Touch ID indisponivel neste Mac.", requiresPassword: true };
  });

  ipcMain.handle("account:unlockWithPassword", async (_event, { email, password }) => {
    const isValid = verifyLocalAccount({ email, password });
    if (!isValid) {
      return { ok: false, message: "Senha incorreta." };
    }

    // Depois de um restart do app, vaultSecret/currentItems em memoria
    // ficam zerados (ver comentario no topo do arquivo) - precisa
    // rederivar a chave e recarregar o cofre aqui, igual ao account:login,
    // senao a tela desbloqueia mas o cofre fica vazio/inacessivel.
    vaultSecret = createVaultSecret({ email, password });
    try {
      currentItems = await loadPasswords({ vaultSecret });
    } catch (err) {
      resetSession();
      return { ok: false, message: err?.message || "Falha ao abrir o cofre." };
    }

    isUnlocked = true;
    return { ok: true };
  });

  ipcMain.handle("account:logout", () => {
    resetSession();
    return { ok: true };
  });

  ipcMain.handle("account:delete", async () => {
    await clearVault();
    deleteLocalAccount();
    resetSession();
    return { ok: true };
  });

  // "Esqueci minha senha": mesma intencao do app mobile (ver
  // handleForgotPassword em src/screens/HomeScreen.js) - reseta a
  // credencial local e o cache do cofre neste Mac (inuteis mesmo, cifrados
  // com a senha antiga), pra permitir criar uma senha nova. NAO apaga o
  // cofre remoto no Drive: se outro aparelho ainda tem a senha antiga, o
  // cofre sincronizado continua intacto la. A senha antiga em si nunca e
  // recuperavel.
  ipcMain.handle("account:resetLocalAccess", async () => {
    if (systemPreferences.canPromptTouchID?.()) {
      try {
        await systemPreferences.promptTouchID("confirmar redefinicao de acesso");
      } catch {
        return { ok: false, cancelled: true };
      }
    }

    deleteLocalAccount();
    clearLocalVaultCache();
    resetSession();
    return { ok: true };
  });

  const requireUnlocked = () => {
    if (!isUnlocked || !vaultSecret) {
      throw new Error("Cofre bloqueado.");
    }
  };

  ipcMain.handle("vault:list", () => {
    requireUnlocked();
    return getVisibleVaultItems(currentItems);
  });

  ipcMain.handle("vault:add", async (_event, { title, username, password }) => {
    requireUnlocked();
    // Valida antes de aceitar: um item invalido (ex: renderer comprometido
    // chamando addItem com um tipo errado) so seria pego no proximo load,
    // e a validacao de leitura e tudo-ou-nada - derrubaria o cofre inteiro
    // em vez de so rejeitar este item na hora.
    validateCredentialFields({ title, username, password });
    const now = Date.now();
    const item = { id: createItemId(), title, username, password, createdAt: now, updatedAt: now };
    currentItems = [...currentItems, item];
    await persistCurrentItems();
    return getVisibleVaultItems(currentItems);
  });

  ipcMain.handle("vault:update", async (_event, { id, title, username, password }) => {
    requireUnlocked();
    validateCredentialFields({ title, username, password });
    const now = Date.now();
    currentItems = currentItems.map((item) =>
      item.id === id && !item.tombstone ? { ...item, title, username, password, updatedAt: now } : item,
    );
    await persistCurrentItems();
    return getVisibleVaultItems(currentItems);
  });

  ipcMain.handle("vault:delete", async (_event, { id }) => {
    requireUnlocked();
    currentItems = currentItems.map((item) => (item.id === id ? createVaultTombstone(id) : item));
    await persistCurrentItems();
    return getVisibleVaultItems(currentItems);
  });

  ipcMain.handle("vault:generatePassword", () => generatePassword());

  ipcMain.handle("drive:enableSync", async () => {
    const result = await signInWithGoogleDrive();
    if (!result.success) {
      return result;
    }

    if (vaultSecret) {
      try {
        await savePasswords(currentItems, { vaultSecret });
      } catch {
        // sessao local continua valida; proxima gravacao tenta de novo
      }
    }

    return { success: true, cancelled: false };
  });

  ipcMain.handle("drive:disableSync", async () => {
    await signOutDrive();
    return { ok: true };
  });

  ipcMain.handle("drive:useExisting", async () => {
    const result = await signInWithGoogleDrive();
    if (!result.success) {
      return { ok: false, cancelled: result.cancelled };
    }

    const remoteVault = await peekRemoteVault();
    return {
      ok: true,
      hasRemoteVault: Boolean(remoteVault?.meta?.verifier),
      email: remoteVault?.meta?.email || "",
    };
  });

  ipcMain.handle("cloudkit:enableSync", async () => {
    const result = await enableCloudKitSync();
    if (result?.status !== "available") {
      return { success: false, cancelled: false };
    }

    if (vaultSecret) {
      try {
        await savePasswords(currentItems, { vaultSecret });
      } catch {
        // sessao local continua valida; proxima gravacao tenta de novo
      }
    }

    return { success: true, cancelled: false };
  });

  ipcMain.handle("sync:getPreference", () => ({
    backend: getSyncBackendPreference(),
  }));

  // Troca de backend e uma acao explicita (nao um fallback automatico, ver
  // core/storage.js): migra o cofre pro novo backend antes de persistir a
  // preferencia, pra nunca deixar "preferencia trocada mas dados nao
  // copiados". Exige cofre desbloqueado porque a migracao precisa da
  // vaultSecret pra validar/reciframar as chaves.
  ipcMain.handle("sync:setBackend", async (_event, { backend }) => {
    try {
      requireUnlocked();
      const currentPreference = getSyncBackendPreference();
      const fromModule = await getVaultModuleForBackend(currentPreference);
      const toModule = await getVaultModuleForBackend(backend);

      await migrateVaultBackend({ fromModule, toModule, vaultSecret });
      setSyncBackendPreference(backend);

      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        message: err?.message || "Falha ao trocar o backend de sincronizacao.",
      };
    }
  });
};

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
