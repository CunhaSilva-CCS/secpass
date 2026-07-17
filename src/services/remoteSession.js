import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const REFRESH_TOKEN_KEY = "secpass_refresh_token";
const IS_WEB = Platform.OS === "web";

export const saveRefreshToken = async (token) => {
  if (!token) {
    return;
  }

  try {
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
    await AsyncStorage.removeItem(REFRESH_TOKEN_KEY);
  } catch {
    if (IS_WEB) {
      await AsyncStorage.setItem(REFRESH_TOKEN_KEY, token);
      return;
    }

    throw new Error(
      "Nao foi possivel salvar o refresh token com seguranca neste dispositivo.",
    );
  }
};

export const loadRefreshToken = async () => {
  try {
    const secureToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
    if (secureToken) {
      return secureToken;
    }
  } catch {
    // Continua com fallback legado em AsyncStorage.
  }

  const legacyToken = await AsyncStorage.getItem(REFRESH_TOKEN_KEY);
  return legacyToken || null;
};

export const clearRefreshToken = async () => {
  try {
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  } catch {
    // Continua para limpar fallback legado.
  }

  await AsyncStorage.removeItem(REFRESH_TOKEN_KEY);
};
