import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { createItemId } from "../utils/createItemId";

const AUDIT_KEY = "secpass_security_audit";
const MAX_AUDIT_EVENTS = 200;
const SECURE_STORE_OPTIONS = {
  keychainService: "secpass.audit",
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

const parseEvents = (rawValue) => {
  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const loadSecurityEvents = async () => {
  try {
    const secureValue = await SecureStore.getItemAsync(
      AUDIT_KEY,
      SECURE_STORE_OPTIONS,
    );
    if (secureValue) {
      return parseEvents(secureValue);
    }
  } catch {
    // Continua com fallback de leitura legado.
  }

  const legacyValue = await AsyncStorage.getItem(AUDIT_KEY);
  const legacyEvents = parseEvents(legacyValue);

  if (legacyEvents.length) {
    try {
      await SecureStore.setItemAsync(
        AUDIT_KEY,
        JSON.stringify(legacyEvents),
        SECURE_STORE_OPTIONS,
      );
      await AsyncStorage.removeItem(AUDIT_KEY);
    } catch {
      // Mantem legado e tenta migrar novamente depois.
    }
  }

  return legacyEvents;
};

export const logSecurityEvent = async ({
  type,
  status = "info",
  details = {},
}) => {
  const events = await loadSecurityEvents();
  const nextEvents = [
    {
      id: createItemId(),
      type,
      status,
      details,
      createdAt: new Date().toISOString(),
    },
    ...events,
  ].slice(0, MAX_AUDIT_EVENTS);

  const payload = JSON.stringify(nextEvents);

  try {
    await SecureStore.setItemAsync(AUDIT_KEY, payload, SECURE_STORE_OPTIONS);
    await AsyncStorage.removeItem(AUDIT_KEY);
  } catch {
    throw new Error(
      "Nao foi possivel registrar evento de seguranca em armazenamento protegido.",
    );
  }
};

export const clearSecurityEvents = async () => {
  try {
    await SecureStore.deleteItemAsync(AUDIT_KEY, SECURE_STORE_OPTIONS);
  } catch {
    // Continua para limpar fallback.
  }

  await AsyncStorage.removeItem(AUDIT_KEY);
};
