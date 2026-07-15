import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

const KEY = "passwords";

const parseData = (rawValue) => {
  if (!rawValue) return [];

  try {
    const parsed = JSON.parse(rawValue);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const savePasswords = async (data) => {
  const payload = JSON.stringify(data);

  try {
    await SecureStore.setItemAsync(KEY, payload);
    await AsyncStorage.removeItem(KEY);
    return;
  } catch {
    await AsyncStorage.setItem(KEY, payload);
  }
};

export const loadPasswords = async () => {
  try {
    const encryptedData = await SecureStore.getItemAsync(KEY);
    if (encryptedData) {
      return parseData(encryptedData);
    }
  } catch {
    // If SecureStore is unavailable, continue with legacy fallback.
  }

  const legacyData = await AsyncStorage.getItem(KEY);
  const parsedLegacy = parseData(legacyData);

  if (legacyData) {
    try {
      await SecureStore.setItemAsync(KEY, legacyData);
      await AsyncStorage.removeItem(KEY);
    } catch {
      // Keep legacy storage when secure migration is unavailable.
    }
  }

  return parsedLegacy;
};
