// Porta simplificada de src/services/storage.js (app mobile): mesma logica
// de cache local + push/pull no backend remoto (aqui so Drive, sem
// CloudKit) e merge por item. Sem os ramos de migracao de cofre legado do
// mobile (app desktop novo, sem instalacao antiga pra migrar).
import {
  createVaultMeta,
  decryptVaultEnvelope,
  decryptVaultItem,
  emailFromVaultSecret,
  encryptVaultItem,
  encryptVaultItems,
  unlockVaultKeys,
} from "./vaultCrypto.js";
import { mergeVaultItems } from "./vaultMerge.js";
import driveVaultModule from "./driveVaultModule.js";
import cloudKitVaultModule from "./cloudKitVaultModule.js";
import { isDriveSignedIn, signOutDrive } from "./driveAuth.js";
import { secureDelete, secureGet, secureSet } from "../secureStore.js";
import {
  SYNC_BACKEND_ICLOUD,
  getSyncBackendPreference,
} from "./syncPreference.js";

const KEY = "secpass_vault";
const VAULT_SECRET_REQUIRED = "Nao e possivel salvar o cofre sem a senha de acesso.";
export const VAULT_DELETE_ERROR = "Nao foi possivel apagar o cofre sincronizado. Tente novamente.";
export const SYNC_BACKEND_UNAVAILABLE = "Este backend de sincronizacao nao esta disponivel neste aparelho.";

// Usado so pelo reset de "esqueci minha senha": apaga o cache local (que
// ficaria inutil, cifrado com a senha antiga) sem tocar no cofre remoto do
// Drive - outro aparelho que ainda saiba a senha antiga continua acessando
// o cofre sincronizado normalmente.
export const clearLocalVaultCache = () => {
  secureDelete(KEY);
};

// Escolha explicita do usuario (ver syncPreference.js), nao mais um unico
// backend fixo: retornar null aqui e um estado normal ("sync desativado ou
// indisponivel neste aparelho" -> cofre 100% local). Tornar isso visivel ao
// usuario e responsabilidade da UI (peekRemoteVault), nao deste ponto de
// despacho.
const getRemoteVaultModule = async () => {
  const preference = getSyncBackendPreference();

  if (preference === SYNC_BACKEND_ICLOUD) {
    return cloudKitVaultModule;
  }

  const signedIn = await isDriveSignedIn();
  return signedIn ? driveVaultModule : null;
};

// Resolve o modulo de um backend especifico (nao o preferido/ativo) - usado
// pela UI de configuracao para obter "de onde" e "para onde" migrar.
export const getVaultModuleForBackend = async (backendId) => {
  if (backendId === SYNC_BACKEND_ICLOUD) {
    return cloudKitVaultModule;
  }

  const signedIn = await isDriveSignedIn();
  return signedIn ? driveVaultModule : null;
};

// Copia o cofre remoto (meta + credenciais, ainda cifradas) de um backend
// para outro, sem nunca decifrar os itens - so valida que a senha atual
// abre o cofre de origem antes de copiar. Nao apaga a origem. Quem chama
// so deve persistir a nova preferencia depois desta funcao resolver sem
// lancar.
export const migrateVaultBackend = async ({ fromModule, toModule, vaultSecret }) => {
  if (!toModule || (await toModule.getAccountStatusAsync()) !== "available") {
    throw new Error(SYNC_BACKEND_UNAVAILABLE);
  }

  if (!fromModule) {
    return;
  }

  const fromStatus = await fromModule.getAccountStatusAsync();
  const rawMeta = fromStatus === "available" ? await fromModule.fetchVaultMetaAsync() : null;
  const meta = toMetaShape(rawMeta);

  if (!meta?.verifier) {
    return;
  }

  unlockVaultKeys(meta, vaultSecret);

  await toModule.saveVaultMetaAsync(rawMeta);

  const records = await fromModule.fetchCredentialsAsync();
  if (Array.isArray(records) && records.length > 0) {
    await toModule.upsertCredentialsAsync(records);
  }
};

const toMetaShape = (rawMeta) => {
  if (!rawMeta) {
    return null;
  }
  if (rawMeta.kdf?.salt) {
    return rawMeta;
  }
  return {
    type: "vault_meta",
    version: rawMeta.version || 1,
    email: rawMeta.email || "",
    kdf: {
      name: rawMeta.kdfName || "pbkdf2-sha256",
      iterations: rawMeta.iterations || 600000,
      salt: rawMeta.salt || "",
    },
    verifier: rawMeta.verifier || "",
  };
};

// Um unico registro remoto corrompido/adulterado nao deve derrubar o
// carregamento do cofre inteiro - descarta so o item afetado (ver mesma
// logica em src/services/storage.js do app mobile).
const decryptRemoteVaultItems = (records, keys) => {
  const items = [];

  for (const record of Array.isArray(records) ? records : []) {
    try {
      const envelope = typeof record?.envelope === "string" ? JSON.parse(record.envelope) : record?.envelope;
      const revision = {
        revisionAt: Number(record?.updatedAt || 0),
        tombstone: Boolean(record?.tombstone),
      };
      items.push(decryptVaultItem(envelope, keys, revision));
    } catch {
      // Item individual descartado; o resto do cofre continua acessivel.
    }
  }

  return items;
};

const pushItemsToRemoteVault = async (remoteVault, items, vaultSecret) => {
  let rawMeta = await remoteVault.fetchVaultMetaAsync();
  let meta = toMetaShape(rawMeta);

  if (!meta?.verifier) {
    meta = createVaultMeta({ vaultSecret, email: emailFromVaultSecret(vaultSecret) });
    await remoteVault.saveVaultMetaAsync({
      email: meta.email,
      version: meta.version,
      kdfName: meta.kdf.name,
      iterations: meta.kdf.iterations,
      salt: meta.kdf.salt,
      verifier: meta.verifier,
    });
  }

  const keys = unlockVaultKeys(meta, vaultSecret);
  const records = (Array.isArray(items) ? items : []).map((item) => {
    const revision = {
      revisionAt: Number(item.updatedAt || item.deletedAt || 0),
      tombstone: Boolean(item.tombstone),
    };
    return {
      id: String(item.id),
      envelope: JSON.stringify(encryptVaultItem(item, keys, revision)),
      updatedAt: revision.revisionAt,
      tombstone: revision.tombstone,
    };
  });

  await remoteVault.upsertCredentialsAsync(records);
};

export const peekRemoteVault = async () => {
  const remoteVault = await getRemoteVaultModule();
  if (!remoteVault) {
    return { available: false, status: "unsupported", meta: null };
  }

  try {
    const status = await remoteVault.getAccountStatusAsync();
    if (status !== "available") {
      return { available: false, status, meta: null };
    }
    const rawMeta = await remoteVault.fetchVaultMetaAsync();
    return { available: true, status, meta: toMetaShape(rawMeta) };
  } catch {
    return { available: false, status: "error", meta: null };
  }
};

export const savePasswords = async (data, { vaultSecret } = {}) => {
  if (!vaultSecret) {
    throw new Error(VAULT_SECRET_REQUIRED);
  }

  const payload = JSON.stringify(await encryptVaultItems(data, vaultSecret));
  secureSet(KEY, payload);

  const remoteVault = await getRemoteVaultModule();
  if (remoteVault) {
    try {
      await pushItemsToRemoteVault(remoteVault, data, vaultSecret);
    } catch {
      // Cache local ja foi gravado; o proximo unlock tenta o Drive de novo.
    }
  }
};

export const loadPasswords = async ({ vaultSecret } = {}) => {
  let remoteItems = null;
  const remoteVault = await getRemoteVaultModule();

  if (remoteVault && vaultSecret) {
    try {
      const rawMeta = await remoteVault.fetchVaultMetaAsync();
      const meta = toMetaShape(rawMeta);
      if (meta?.verifier) {
        const keys = unlockVaultKeys(meta, vaultSecret);
        const records = await remoteVault.fetchCredentialsAsync();
        remoteItems = decryptRemoteVaultItems(records, keys);
      }
    } catch (err) {
      if (
        typeof err?.message === "string" &&
        (err.message.includes("integridade") ||
          err.message.includes("Segredo do cofre") ||
          err.message.includes("Metadados"))
      ) {
        throw err;
      }
      remoteItems = null;
    }
  }

  const localRaw = secureGet(KEY);
  const sources = [];

  if (remoteItems) {
    sources.push(remoteItems);
  }

  if (localRaw) {
    const parsed = JSON.parse(localRaw);
    if (parsed?.type === "encrypted_vault") {
      if (!vaultSecret) {
        throw new Error("Cofre criptografado. Faca login novamente.");
      }
      sources.push(await decryptVaultEnvelope(parsed, vaultSecret));
    } else if (Array.isArray(parsed)) {
      sources.push(parsed);
    }
  }

  if (sources.length === 0) {
    return [];
  }

  const merged = sources.reduce((acc, list) => mergeVaultItems(acc, list), []);

  if (vaultSecret && remoteVault && !remoteItems) {
    try {
      await pushItemsToRemoteVault(remoteVault, merged, vaultSecret);
    } catch {
      // Proxima gravacao tenta de novo.
    }
  }

  return merged;
};

export const clearVault = async () => {
  const remoteVault = await getRemoteVaultModule();
  if (remoteVault) {
    try {
      const status = await remoteVault.getAccountStatusAsync();
      if (status === "available") {
        await remoteVault.deleteVaultAsync();
      }
    } catch {
      throw new Error(VAULT_DELETE_ERROR);
    }
  }

  await signOutDrive();
  secureDelete(KEY);
};
