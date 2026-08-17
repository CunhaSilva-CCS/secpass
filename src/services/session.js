import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import QuickCrypto from "react-native-quick-crypto";

import {
  DEVICE_AUTH_NOT_CONFIGURED,
  isDeviceAuthNotConfiguredError,
} from "../utils/secureStoreErrors";

const SESSION_KEY = "secpass_session";
const SESSION_ERROR =
  "Nao foi possivel salvar a sessao com seguranca neste dispositivo.";
const SECURE_STORE_OPTIONS = {
  keychainService: "secpass.session",
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

const toHex = (bytes) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

const createSessionToken = () => {
  const randomBytes = QuickCrypto.randomBytes(32);
  return `session:${toHex(randomBytes)}`;
};

export const saveSessionToken = async (token) => {
  const tokenToPersist = token ?? createSessionToken();

  try {
    await SecureStore.setItemAsync(
      SESSION_KEY,
      tokenToPersist,
      SECURE_STORE_OPTIONS,
    );
    await AsyncStorage.removeItem(SESSION_KEY);
    return tokenToPersist;
  } catch (err) {
    if (isDeviceAuthNotConfiguredError(err)) {
      throw new Error(DEVICE_AUTH_NOT_CONFIGURED);
    }
    throw new Error(SESSION_ERROR);
  }
};

export const loadSessionToken = async () => {
  try {
    const secureToken = await SecureStore.getItemAsync(
      SESSION_KEY,
      SECURE_STORE_OPTIONS,
    );
    if (secureToken) {
      return secureToken;
    }
  } catch {
    // Continua com fallback legado em AsyncStorage.
  }

  const legacyToken = await AsyncStorage.getItem(SESSION_KEY);
  return legacyToken || null;
};

export const clearSessionToken = async () => {
  try {
    await SecureStore.deleteItemAsync(SESSION_KEY, SECURE_STORE_OPTIONS);
  } catch {
    // Continue and clear AsyncStorage fallback.
  }

  await AsyncStorage.removeItem(SESSION_KEY);
};
