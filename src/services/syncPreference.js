import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

const PREFERENCE_KEY = "secpass_sync_backend_preference";
const SECURE_STORE_OPTIONS = {
  keychainService: "secpass.syncPreference",
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export const SYNC_BACKEND_DRIVE = "drive";
export const SYNC_BACKEND_ICLOUD = "icloud";
const VALID_BACKENDS = [SYNC_BACKEND_DRIVE, SYNC_BACKEND_ICLOUD];

export const getSyncBackendPreference = async () => {
  try {
    const secureValue = await SecureStore.getItemAsync(
      PREFERENCE_KEY,
      SECURE_STORE_OPTIONS,
    );
    if (VALID_BACKENDS.includes(secureValue)) {
      return secureValue;
    }
  } catch {
    // Continua com fallback de leitura legado.
  }

  const legacyValue = await AsyncStorage.getItem(PREFERENCE_KEY);
  return VALID_BACKENDS.includes(legacyValue)
    ? legacyValue
    : SYNC_BACKEND_DRIVE;
};

export const setSyncBackendPreference = async (value) => {
  if (!VALID_BACKENDS.includes(value)) {
    throw new Error("Backend de sincronizacao invalido.");
  }

  await SecureStore.setItemAsync(PREFERENCE_KEY, value, SECURE_STORE_OPTIONS);
  await AsyncStorage.removeItem(PREFERENCE_KEY);
};
