import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

import {
  getSyncBackendPreference,
  setSyncBackendPreference,
  SYNC_BACKEND_DRIVE,
  SYNC_BACKEND_ICLOUD,
} from "../src/services/syncPreference";

jest.mock("@react-native-async-storage/async-storage", () => ({
  setItem: jest.fn(),
  getItem: jest.fn(),
  removeItem: jest.fn(),
}));

jest.mock("expo-secure-store", () => ({
  setItemAsync: jest.fn(),
  getItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: "WHEN_UNLOCKED_THIS_DEVICE_ONLY",
}));

describe("syncPreference service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    SecureStore.getItemAsync.mockResolvedValue(null);
    SecureStore.setItemAsync.mockResolvedValue();
    AsyncStorage.getItem.mockResolvedValue(null);
    AsyncStorage.removeItem.mockResolvedValue();
  });

  it("retorna drive como padrao quando nada foi gravado", async () => {
    const preference = await getSyncBackendPreference();
    expect(preference).toBe(SYNC_BACKEND_DRIVE);
  });

  it("retorna drive como padrao se o valor gravado for invalido", async () => {
    SecureStore.getItemAsync.mockResolvedValueOnce("qualquer-coisa");

    const preference = await getSyncBackendPreference();

    expect(preference).toBe(SYNC_BACKEND_DRIVE);
  });

  it("le do fallback AsyncStorage se o SecureStore falhar", async () => {
    SecureStore.getItemAsync.mockRejectedValueOnce(new Error("secure-down"));
    AsyncStorage.getItem.mockResolvedValueOnce(SYNC_BACKEND_ICLOUD);

    const preference = await getSyncBackendPreference();

    expect(preference).toBe(SYNC_BACKEND_ICLOUD);
  });

  it("grava a preferencia no SecureStore e limpa o fallback legado", async () => {
    await setSyncBackendPreference(SYNC_BACKEND_ICLOUD);

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      "secpass_sync_backend_preference",
      SYNC_BACKEND_ICLOUD,
      expect.any(Object),
    );
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith(
      "secpass_sync_backend_preference",
    );
  });

  it("rejeita um valor de backend invalido", async () => {
    await expect(setSyncBackendPreference("dropbox")).rejects.toThrow(
      "Backend de sincronizacao invalido.",
    );
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });

  it("le a preferencia gravada de volta apos setSyncBackendPreference", async () => {
    await setSyncBackendPreference(SYNC_BACKEND_ICLOUD);
    SecureStore.getItemAsync.mockResolvedValueOnce(SYNC_BACKEND_ICLOUD);

    const preference = await getSyncBackendPreference();

    expect(preference).toBe(SYNC_BACKEND_ICLOUD);
  });
});
