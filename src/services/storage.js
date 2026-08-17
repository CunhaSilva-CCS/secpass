import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { decryptVaultEnvelope, encryptVaultItems } from "./vaultCrypto";

const KEY = "passwords";
const STORAGE_WRITE_ERROR =
  "Nao foi possivel salvar o cofre com seguranca neste dispositivo.";
const SECURE_STORE_OPTIONS = {
  keychainService: "secpass.vault",
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  requireAuthentication: true,
  authenticationPrompt: "Autentique para abrir seu cofre criptografado.",
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

export const savePasswords = async (data, { vaultSecret } = {}) => {
  const payload = vaultSecret
    ? JSON.stringify(await encryptVaultItems(data, vaultSecret))
    : JSON.stringify(data);

  try {
    await SecureStore.setItemAsync(KEY, payload, SECURE_STORE_OPTIONS);
    await AsyncStorage.removeItem(KEY);
    return;
  } catch {
    throw new Error(STORAGE_WRITE_ERROR);
  }
};

export const loadPasswords = async ({ vaultSecret } = {}) => {
  const parseLoadedData = async (rawValue) => {
    const parsedPayload = parsePayload(rawValue);

    if (Array.isArray(parsedPayload)) {
      return parsedPayload;
    }

    if (parsedPayload?.type === "encrypted_vault") {
      if (!vaultSecret) {
        throw new Error("Cofre criptografado. Faca login novamente.");
      }

      return decryptVaultEnvelope(parsedPayload, vaultSecret);
    }

    return parseData(rawValue);
  };

  try {
    const encryptedData = await SecureStore.getItemAsync(
      KEY,
      SECURE_STORE_OPTIONS,
    );
    if (encryptedData) {
      return parseLoadedData(encryptedData);
    }
  } catch {
    // If SecureStore is unavailable, continue with legacy fallback.
  }

  const legacyData = await AsyncStorage.getItem(KEY);
  const parsedLegacy = await parseLoadedData(legacyData);

  if (legacyData) {
    try {
      await SecureStore.setItemAsync(KEY, legacyData, SECURE_STORE_OPTIONS);
      await AsyncStorage.removeItem(KEY);
    } catch {
      // Mantem leitura legada; migracao sera tentada novamente depois.
    }
  }

  return parsedLegacy;
};

export const clearVault = async () => {
  try {
    await SecureStore.deleteItemAsync(KEY, SECURE_STORE_OPTIONS);
  } catch {
    // Continua para limpar fallback.
  }

  await AsyncStorage.removeItem(KEY);
};
