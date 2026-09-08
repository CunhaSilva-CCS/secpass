import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import {
  createVaultMeta,
  decryptVaultEnvelope,
  decryptVaultItem,
  emailFromVaultSecret,
  encryptVaultItem,
  encryptVaultItems,
  unlockVaultKeys,
} from "./vaultCrypto";
import { mergeVaultItems } from "./vaultMerge";
import { isDriveSignedIn, signOutDrive } from "./driveAuth";
import {
  DEVICE_AUTH_NOT_CONFIGURED,
  isDeviceAuthNotConfiguredError,
} from "../utils/secureStoreErrors";

const KEY = "passwords";
const STORAGE_WRITE_ERROR =
  "Nao foi possivel salvar o cofre com seguranca neste dispositivo.";
const VAULT_SECRET_REQUIRED =
  "Nao e possivel salvar o cofre sem a senha de acesso.";
export const VAULT_DELETE_ERROR =
  "Nao foi possivel apagar o cofre sincronizado. Tente novamente.";
const SECURE_STORE_OPTIONS = {
  keychainService: "secpass.vault",
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

const getCloudKitModule = () => {
  if (Platform.OS !== "ios") {
    return null;
  }

  try {
    return require("../../modules/secure-vault-cloudkit/src/SecureVaultCloudKitModule")
      .default;
  } catch {
    return null;
  }
};

// So retorna o modulo Drive se ja houver sessao Google autenticada: sem
// login explicito do usuario nao ha "sync habilitado" (ver
// src/services/driveAuth.js - login e sempre uma acao explicita, nunca
// automatica no boot).
const getDriveVaultModule = async () => {
  if (Platform.OS !== "android") {
    return null;
  }

  try {
    const signedIn = await isDriveSignedIn();
    if (!signedIn) {
      return null;
    }
    return require("./driveVaultModule").default;
  } catch {
    return null;
  }
};

// Ponto unico de despacho do backend remoto: iOS usa CloudKit (inalterado),
// Android usa Google Drive quando o usuario ativou a sincronizacao. Nenhuma
// das duas depende de servidor proprio, e nenhuma altera o comportamento
// hoje existente quando nao configurada (retorna null -> cofre 100% local).
const getRemoteVaultModule = async () => {
  const cloudKit = getCloudKitModule();
  if (cloudKit) {
    return cloudKit;
  }

  return getDriveVaultModule();
};

// Legado: blob unico no iCloud Keychain, usado so para migrar para CloudKit.
const getLegacyKeychainSyncModule = () => {
  if (Platform.OS !== "ios") {
    return null;
  }

  try {
    return require("../../modules/secure-vault-sync/src/SecureVaultSyncModule")
      .default;
  } catch {
    return null;
  }
};

const isEncryptedEnvelope = (parsed) => parsed?.type === "encrypted_vault";

const writeLocalVault = async (payload) => {
  await SecureStore.setItemAsync(KEY, payload, SECURE_STORE_OPTIONS);
};

const readLegacyKeychainVault = async () => {
  const vaultSync = getLegacyKeychainSyncModule();
  if (!vaultSync) {
    return null;
  }

  try {
    return await vaultSync.getItemAsync(
      KEY,
      SECURE_STORE_OPTIONS.keychainService,
    );
  } catch {
    return null;
  }
};

const deleteLegacyKeychainVault = async () => {
  const vaultSync = getLegacyKeychainSyncModule();
  if (!vaultSync) {
    return;
  }

  try {
    await vaultSync.deleteItemAsync(KEY, SECURE_STORE_OPTIONS.keychainService);
  } catch {
    // Migracao ja foi para CloudKit; limpeza do Keychain e best-effort.
  }
};

const parseData = (rawValue) => {
  if (!rawValue) return [];

  try {
    const parsed = JSON.parse(rawValue);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const parsePayload = (rawValue) => {
  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue);
  } catch {
    return null;
  }
};

const encryptPayload = async (items, vaultSecret) =>
  JSON.stringify(await encryptVaultItems(items, vaultSecret));

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
      iterations: rawMeta.iterations || 310000,
      salt: rawMeta.salt || "",
    },
    verifier: rawMeta.verifier || "",
  };
};

const parseLoadedData = async (rawValue, vaultSecret) => {
  const parsedPayload = parsePayload(rawValue);

  if (Array.isArray(parsedPayload)) {
    return parsedPayload;
  }

  if (isEncryptedEnvelope(parsedPayload)) {
    if (!vaultSecret) {
      throw new Error("Cofre criptografado. Faca login novamente.");
    }

    return decryptVaultEnvelope(parsedPayload, vaultSecret);
  }

  return parseData(rawValue);
};

const decryptRemoteVaultItems = (records, keys) =>
  (Array.isArray(records) ? records : []).map((record) => {
    const envelope =
      typeof record?.envelope === "string"
        ? parsePayload(record.envelope)
        : record?.envelope;
    return decryptVaultItem(envelope, keys);
  });

const pushItemsToRemoteVault = async (remoteVault, items, vaultSecret) => {
  let rawMeta = await remoteVault.fetchVaultMetaAsync();
  let meta = toMetaShape(rawMeta);

  if (!meta?.verifier) {
    meta = createVaultMeta({
      vaultSecret,
      email: emailFromVaultSecret(vaultSecret),
    });
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
  const records = (Array.isArray(items) ? items : []).map((item) => ({
    id: String(item.id),
    envelope: JSON.stringify(encryptVaultItem(item, keys)),
    updatedAt: Number(item.updatedAt || item.deletedAt || 0),
    tombstone: Boolean(item.tombstone),
  }));

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
    return {
      available: true,
      status,
      meta: toMetaShape(rawMeta),
    };
  } catch {
    return { available: false, status: "error", meta: null };
  }
};

export const savePasswords = async (data, { vaultSecret } = {}) => {
  if (!vaultSecret) {
    throw new Error(VAULT_SECRET_REQUIRED);
  }

  const payload = await encryptPayload(data, vaultSecret);

  try {
    await writeLocalVault(payload);
    await AsyncStorage.removeItem(KEY);

    const remoteVault = await getRemoteVaultModule();
    if (remoteVault) {
      try {
        await pushItemsToRemoteVault(remoteVault, data, vaultSecret);
        await deleteLegacyKeychainVault();
      } catch {
        // Cache local ja foi gravado; o proximo unlock tenta o backend remoto de novo.
      }
    }

    return;
  } catch (err) {
    if (isDeviceAuthNotConfiguredError(err)) {
      throw new Error(DEVICE_AUTH_NOT_CONFIGURED);
    }
    throw new Error(STORAGE_WRITE_ERROR);
  }
};

export const loadPasswords = async ({ vaultSecret } = {}) => {
  let cloudItems = null;
  const remoteVault = await getRemoteVaultModule();

  if (remoteVault && vaultSecret) {
    try {
      const rawMeta = await remoteVault.fetchVaultMetaAsync();
      const meta = toMetaShape(rawMeta);
      if (meta?.verifier) {
        const keys = unlockVaultKeys(meta, vaultSecret);
        const records = await remoteVault.fetchCredentialsAsync();
        cloudItems = decryptRemoteVaultItems(records, keys);
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
      cloudItems = null;
    }
  }

  let localData = null;
  try {
    localData = await SecureStore.getItemAsync(KEY, SECURE_STORE_OPTIONS);
  } catch {
    // Continua com backend remoto / legado.
  }

  const legacyKeychain = await readLegacyKeychainVault();
  const sources = [];

  if (cloudItems) {
    sources.push(cloudItems);
  }

  if (localData) {
    sources.push(await parseLoadedData(localData, vaultSecret));
  }

  if (legacyKeychain) {
    sources.push(await parseLoadedData(legacyKeychain, vaultSecret));
  }

  if (sources.length === 0) {
    const legacyData = await AsyncStorage.getItem(KEY);
    const parsedLegacy = await parseLoadedData(legacyData, vaultSecret);

    if (legacyData && vaultSecret && remoteVault) {
      try {
        await pushItemsToRemoteVault(remoteVault, parsedLegacy, vaultSecret);
        await writeLocalVault(await encryptPayload(parsedLegacy, vaultSecret));
        await AsyncStorage.removeItem(KEY);
      } catch {
        // Mantem leitura legada.
      }
    }

    return parsedLegacy;
  }

  const merged = sources.reduce((acc, list) => mergeVaultItems(acc, list), []);

  if (vaultSecret && remoteVault && !cloudItems) {
    try {
      await pushItemsToRemoteVault(remoteVault, merged, vaultSecret);
      await deleteLegacyKeychainVault();
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

  await deleteLegacyKeychainVault();
  await signOutDrive();

  try {
    await SecureStore.deleteItemAsync(KEY, SECURE_STORE_OPTIONS);
  } catch {
    // Continua para limpar fallback.
  }

  await AsyncStorage.removeItem(KEY);
};
