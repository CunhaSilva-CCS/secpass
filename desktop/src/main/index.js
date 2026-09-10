import { app, BrowserWindow, ipcMain, powerMonitor } from "electron";
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
import { clearLoginGuard, loadLoginGuard, saveLoginGuard } from "./core/loginGuard.js";
import { canPromptDeviceAuth, isMac, promptDeviceAuth } from "./core/deviceAuth.js";
import {
  applyLockDecay,
  computeFailedLoginState,
  getLockRemainingSeconds,
  isLoginLocked,
} from "./core/loginThrottle.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

// Estado da sessao (equivalente ao vaultSecret/items em memoria no
// HomeScreen.js do app mobile) - nunca persistido em texto claro, so vive
// enquanto o processo principal roda.
let vaultSecret = null;
let currentItems = [];
let isUnlocked = false;
let mainWindow = null;

const resetSession = () => {
  vaultSecret = null;
  currentItems = [];
  isUnlocked = false;
};

// Mesmo limite do app mobile (ver IDLE_LOCK_MS em src/screens/HomeScreen.js)
// - sem isso o desktop nunca revalida o cofre remoto sozinho: ao contrario
// do mobile (que bloqueia ao ir para background e busca o Drive de novo a
// cada desbloqueio), uma janela do Electron pode ficar aberta e desbloqueada
// o dia inteiro. Nesse tempo, uma edicao feita em outro aparelho fica
// invisivel aqui - e se o usuario editar a MESMA credencial nesta janela
// (com base na copia desatualizada), o merge por timestamp mais recente
// (ver core/vaultMerge.js) aceita essa gravacao como "a mais nova" e
// sobrescreve silenciosamente a edicao feita no outro aparelho. Bloquear
// por inatividade fecha essa janela, forcando um novo unlock - que agora
// sempre busca o estado remoto atual (ver account:unlock/account:unlockWithPassword).
const IDLE_LOCK_MS = 2 * 60 * 1000;
let idleLockTimer = null;

const clearIdleLockTimer = () => {
  if (idleLockTimer) {
    clearTimeout(idleLockTimer);
    idleLockTimer = null;
  }
};

const lockVault = (reason) => {
  isUnlocked = false;
  clearIdleLockTimer();
  mainWindow?.webContents.send("session:autoLocked", { reason });
};

const scheduleIdleLock = () => {
  clearIdleLockTimer();
  if (!isUnlocked) {
    return;
  }
  idleLockTimer = setTimeout(() => lockVault("inactivity"), IDLE_LOCK_MS);
};

// Chamado a cada IPC que exige o cofre desbloqueado - equivalente a
// qualquer interacao do usuario resetar o timer de inatividade no mobile.
const registerActivity = () => {
  if (isUnlocked) {
    scheduleIdleLock();
  }
};

// O Mac indo dormir ou a tela sendo bloqueada e o analogo mais proximo de
// "app foi para background" no mobile - o dado sensivel nao deve continuar
// acessivel so porque a janela ainda esta aberta.
powerMonitor.on("suspend", () => lockVault("system-suspend"));
powerMonitor.on("lock-screen", () => lockVault("system-suspend"));

// Mesma politica do app mobile (ver src/utils/loginThrottle.js): 5
// tentativas, depois bloqueio progressivo (30s, 1min, 2min... ate 15min),
// que decai 1 nivel a cada 6h sem novo erro. Sem isso, nada impede tentar a
// senha de acesso local repetidamente via IPC (Touch ID tem o proprio
// limite do macOS, mas o fallback de senha - account:login/
// account:unlockWithPassword - nao tinha nenhum).
const requireLoginNotLocked = () => {
  const decayedState = applyLockDecay(loadLoginGuard());
  if (isLoginLocked(decayedState.lockUntil)) {
    return {
      locked: true,
      message: `Muitas tentativas. Tente novamente em ${getLockRemainingSeconds(decayedState.lockUntil)}s.`,
    };
  }
  return { locked: false, state: decayedState };
};

const registerFailedLoginAttempt = (decayedState) => {
  const throttleState = computeFailedLoginState({
    failedAttempts: decayedState.failedAttempts,
    lockLevel: decayedState.lockLevel,
  });

  try {
    saveLoginGuard(throttleState);
  } catch {
    // Best-effort (mesmo padrao de storage.js): uma falha ao persistir o
    // guard nao deve travar a resposta de "senha incorreta" ao usuario.
  }

  if (throttleState.justLocked) {
    return { ok: false, message: `Muitas tentativas. Tente novamente em ${throttleState.lockDurationSeconds}s.` };
  }

  return {
    ok: false,
    message: `Email ou senha incorretos. Restam ${throttleState.remainingAttempts} tentativa(s) antes do bloqueio.`,
  };
};

const clearLoginThrottle = () => {
  try {
    clearLoginGuard();
  } catch {
    // Best-effort - nao impede o login que ja foi validado.
  }
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
    // "hiddenInset" (botoes de fechar/minimizar/maximizar flutuando sobre o
    // conteudo) e um estilo especifico do macOS - no Windows/Linux usa a
    // barra de titulo padrao do sistema (frame:true, o default do Electron
    // quando titleBarStyle nao e informado).
    ...(isMac ? { titleBarStyle: "hiddenInset" } : {}),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      // Desativa o DevTools (menu e atalho Cmd+Option+I) em build de
      // producao: com o cofre desbloqueado, alguem com acesso fisico breve
      // ao Mac poderia abrir o console e chamar qualquer metodo exposto em
      // window.secpass diretamente (ex: deleteAccount), pulando qualquer
      // confirmacao da UI. Em dev fica ligado (necessario pro dia a dia de
      // desenvolvimento).
      devTools: is.dev,
    },
  });

  // Equivalente ao ScreenCapture.preventScreenCaptureAsync() do mobile
  // (ver src/screens/HomeScreen.js): impede que screenshot/gravacao de tela
  // (incluindo apps de compartilhamento de tela tipo Zoom/Meet) capturem o
  // conteudo da janela. Ativo pela vida inteira da janela, nao so depois do
  // login - a senha de acesso pode ser revelada em texto claro na propria
  // tela de cadastro/login (icone de olho), igual no mobile.
  window.setContentProtection(true);

  window.once("ready-to-show", () => {
    window.maximize();
    window.show();
  });

  window.on("closed", () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });

  mainWindow = window;

  // Sem isso, um renderer comprometido (dependencia npm maliciosa, ver
  // achado de seguranca) podia navegar a propria janela pra uma pagina
  // remota via `window.location = "https://..."` - o preload.js roda de
  // novo no documento novo e reexpoe window.secpass la, agora fora da CSP
  // do app (default-src 'self' em renderer/index.html), livre pra roubar
  // o cofre decifrado ou phishar a senha. Mesmo principio ja usado na
  // janela oculta do CloudKit (ver cloudkit/cloudKitWindow.js). Essa SPA
  // nunca precisa de navegacao de verdade (as telas trocam via estado do
  // React, nao via URL) - bloquear tudo incondicionalmente nao quebra
  // nenhum uso legitimo. `will-navigate` nao dispara pro loadFile/loadURL
  // inicial abaixo, so pra navegacoes causadas de dentro da pagina.
  window.webContents.on("will-navigate", (event) => {
    event.preventDefault();
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

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
      // Deixa o renderer adaptar textos/fluxo especificos de plataforma
      // (ex: LockedScreen so mostra o botao de Touch ID no macOS) sem
      // duplicar deteccao de SO no lado renderer.
      canPromptDeviceAuth: canPromptDeviceAuth(),
      platform: process.platform,
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
    scheduleIdleLock();
    return { ok: true };
  });

  ipcMain.handle("account:login", async (_event, { email, password }) => {
    const guardCheck = requireLoginNotLocked();
    if (guardCheck.locked) {
      return { ok: false, message: guardCheck.message };
    }

    const isValid = verifyLocalAccount({ email, password });
    if (!isValid) {
      return registerFailedLoginAttempt(guardCheck.state);
    }
    clearLoginThrottle();

    vaultSecret = createVaultSecret({ email, password });
    try {
      currentItems = await loadPasswords({ vaultSecret });
    } catch (err) {
      resetSession();
      return { ok: false, message: err?.message || "Falha ao abrir o cofre." };
    }
    isUnlocked = true;
    scheduleIdleLock();
    return { ok: true };
  });

  ipcMain.handle("account:lock", () => {
    isUnlocked = false;
    clearIdleLockTimer();
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

    if (canPromptDeviceAuth()) {
      try {
        await promptDeviceAuth("desbloquear o cofre de senhas");
      } catch {
        return { ok: false, message: "" };
      }

      // Mesmo tratamento de erro do account:unlockWithPassword: um cofre
      // remoto indisponivel (rede, Drive fora do ar) nao deve bloquear o
      // desbloqueio local - so nao ha o que puxar de novo agora, e o cofre
      // em memoria (potencialmente desatualizado) continua sendo usado ate
      // o proximo unlock bem-sucedido buscar o estado remoto atual.
      try {
        currentItems = await loadPasswords({ vaultSecret });
      } catch {
        // Mantem currentItems atual; proximo unlock tenta buscar de novo.
      }
      isUnlocked = true;
      scheduleIdleLock();
      return { ok: true };
    }

    return {
      ok: false,
      message: isMac ? "Touch ID indisponivel neste Mac." : "Desbloqueio biometrico indisponivel neste sistema.",
      requiresPassword: true,
    };
  });

  ipcMain.handle("account:unlockWithPassword", async (_event, { email, password }) => {
    const guardCheck = requireLoginNotLocked();
    if (guardCheck.locked) {
      return { ok: false, message: guardCheck.message };
    }

    const isValid = verifyLocalAccount({ email, password });
    if (!isValid) {
      return registerFailedLoginAttempt(guardCheck.state);
    }
    clearLoginThrottle();

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
    scheduleIdleLock();
    return { ok: true };
  });

  ipcMain.handle("account:logout", () => {
    resetSession();
    clearIdleLockTimer();
    return { ok: true };
  });

  // Acao destrutiva e irreversivel (apaga o cofre local E o remoto no
  // Drive/iCloud). O confirm() da VaultScreen roda no renderer e nao
  // protege nada sozinho: qualquer coisa capaz de chamar
  // window.secpass.deleteAccount() direto (DevTools, script injetado por
  // uma dependencia comprometida) pularia essa caixa de dialogo. Por isso
  // a senha de acesso e reverificada aqui no processo principal - o unico
  // segredo que um renderer comprometido nao tem como produzir sozinho -
  // antes de agir. Toque ID (quando disponivel) continua sendo pedido
  // depois, como uma segunda camada, mas nunca a UNICA camada (era esse o
  // gap: em Windows/Linux ou Mac sem Touch ID, canPromptDeviceAuth() e
  // sempre false e a acao seguia sem nenhuma verificacao real).
  ipcMain.handle("account:delete", async (_event, { password } = {}) => {
    const account = loadLocalAccount();
    if (!account || !verifyLocalAccount({ email: account.email, password: password || "" })) {
      return { ok: false, message: "Senha incorreta." };
    }

    if (canPromptDeviceAuth()) {
      try {
        await promptDeviceAuth("confirmar exclusao da conta e do cofre");
      } catch {
        return { ok: false, cancelled: true };
      }
    }

    await clearVault();
    deleteLocalAccount();
    resetSession();
    clearIdleLockTimer();
    return { ok: true };
  });

  // "Esqueci minha senha": mesma intencao do app mobile (ver
  // handleForgotPassword em src/screens/HomeScreen.js) - reseta a
  // credencial local e o cache do cofre neste Mac (inuteis mesmo, cifrados
  // com a senha antiga), pra permitir criar uma senha nova. NAO apaga o
  // cofre remoto no Drive: se outro aparelho ainda tem a senha antiga, o
  // cofre sincronizado continua intacto la. A senha antiga em si nunca e
  // recuperavel.
  //
  // Desconecta o Drive deste Mac (nao apaga nada remoto, so a sessao local)
  // - sem isso, uma conta nova criada com senha diferente da antiga nunca
  // consegue abrir: toda tentativa de registrar/desbloquear tenta reconciliar
  // com o cofre remoto antigo (vinculado a senha que acabou de ser
  // descartada), falha com "Falha de integridade do cofre." e deixa o
  // usuario preso num loop ate digitar por acaso a senha antiga de novo.
  // Reconectar e uma escolha explicita de novo, depois que a conta nova
  // existir (ver drive:enableSync).
  ipcMain.handle("account:resetLocalAccess", async () => {
    if (canPromptDeviceAuth()) {
      try {
        await promptDeviceAuth("confirmar redefinicao de acesso");
      } catch {
        return { ok: false, cancelled: true };
      }
    }

    deleteLocalAccount();
    clearLocalVaultCache();
    await signOutDrive();
    resetSession();
    clearIdleLockTimer();
    return { ok: true };
  });

  const requireUnlocked = () => {
    if (!isUnlocked || !vaultSecret) {
      throw new Error("Cofre bloqueado.");
    }
    registerActivity();
  };

  ipcMain.handle("vault:list", () => {
    requireUnlocked();
    return getVisibleVaultItems(currentItems);
  });

  // Botao "Atualizar" da tela do cofre: re-busca o Drive e mescla com o
  // estado atual em memoria, mesmo principio do unlock (ver account:unlock
  // acima) - cobre o caso da janela ficar aberta enquanto outro aparelho
  // grava no Drive, sem precisar bloquear/desbloquear pra ver a mudanca.
  ipcMain.handle("vault:refresh", async () => {
    requireUnlocked();
    try {
      currentItems = await loadPasswords({ vaultSecret });
    } catch (err) {
      return { ok: false, message: err?.message || "Falha ao atualizar o cofre." };
    }
    return { ok: true, items: getVisibleVaultItems(currentItems) };
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

// Duas instancias do app rodando ao mesmo tempo (ex: abrir o .app duas
// vezes) leriam/escreveriam os MESMOS arquivos em
// app.getPath("userData")/secure/*.bin (cofre local, conta, guard de
// login) a partir de dois processos Node independentes, sem nenhuma
// coordenacao entre eles - a segunda instancia so foca a janela da
// primeira em vez de abrir uma nova sessao concorrente.
const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    registerIpcHandlers();
    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
