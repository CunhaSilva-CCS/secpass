import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ExpoCrypto from "expo-crypto";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const SESSION_KEY = "secpass_session";
const SESSION_ERROR =
  "Nao foi possivel salvar a sessao com seguranca neste dispositivo.";
const IS_WEB = Platform.OS === "web";

const toHex = (bytes) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

const createSessionToken = async () => {
  const randomBytes = await ExpoCrypto.getRandomBytesAsync(32);
  return `session:${toHex(randomBytes)}`;
};

export const saveSessionToken = async (token) => {
  const tokenToPersist = token ?? (await createSessionToken());

  try {
    await SecureStore.setItemAsync(SESSION_KEY, tokenToPersist);
    await AsyncStorage.removeItem(SESSION_KEY);
    return tokenToPersist;
  } catch {
    if (IS_WEB) {
      await AsyncStorage.setItem(SESSION_KEY, tokenToPersist);
      return tokenToPersist;
    }

    throw new Error(SESSION_ERROR);
  }
};

export const loadSessionToken = async () => {
  try {
    const secureToken = await SecureStore.getItemAsync(SESSION_KEY);
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
    await SecureStore.deleteItemAsync(SESSION_KEY);
  } catch {
    // Continue and clear AsyncStorage fallback.
  }

  await AsyncStorage.removeItem(SESSION_KEY);
};
