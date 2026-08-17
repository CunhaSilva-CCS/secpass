import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ExpoCrypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";

const SESSION_KEY = "secpass_session";
const SESSION_ERROR =
  "Nao foi possivel salvar a sessao com seguranca neste dispositivo.";
const SECURE_STORE_OPTIONS = {
  keychainService: "secpass.session",
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  requireAuthentication: true,
  authenticationPrompt: "Autentique para restaurar sua sessao do SecPass.",
};

const toHex = (bytes) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

const createSessionToken = async () => {
  const randomBytes = await ExpoCrypto.getRandomBytesAsync(32);
  return `session:${toHex(randomBytes)}`;
};

export const saveSessionToken = async (token) => {
  const tokenToPersist = token ?? (await createSessionToken());

  try {
    await SecureStore.setItemAsync(
      SESSION_KEY,
      tokenToPersist,
      SECURE_STORE_OPTIONS,
    );
    await AsyncStorage.removeItem(SESSION_KEY);
    return tokenToPersist;
  } catch {
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
