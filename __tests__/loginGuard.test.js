import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

import {
  clearLoginGuard,
  loadLoginGuard,
  saveLoginGuard,
} from "../src/services/loginGuard";

jest.mock("@react-native-async-storage/async-storage", () => ({
  setItem: jest.fn(),
  getItem: jest.fn(),
  removeItem: jest.fn(),
}));

jest.mock("expo-secure-store", () => ({
  setItemAsync: jest.fn(),
  getItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

describe("loginGuard service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("salva estado no SecureStore e limpa legado", async () => {
    await saveLoginGuard({
      failedAttempts: 2,
      lockLevel: 1,
      lockUntil: 1000,
    });

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      "secpass_login_guard",
      JSON.stringify({ failedAttempts: 2, lockLevel: 1, lockUntil: 1000 }),
      expect.any(Object),
    );
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith("secpass_login_guard");
  });

  it("carrega estado do SecureStore", async () => {
    SecureStore.getItemAsync.mockResolvedValueOnce(
      JSON.stringify({ failedAttempts: 1, lockLevel: 2, lockUntil: 2000 }),
    );

    const guard = await loadLoginGuard();

    expect(guard).toEqual({ failedAttempts: 1, lockLevel: 2, lockUntil: 2000 });
  });

  it("usa fallback legado e tenta migrar para SecureStore", async () => {
    SecureStore.getItemAsync.mockResolvedValueOnce(null);
    AsyncStorage.getItem.mockResolvedValueOnce(
      JSON.stringify({ failedAttempts: 3, lockLevel: 1, lockUntil: 3000 }),
    );

    const guard = await loadLoginGuard();

    expect(guard).toEqual({ failedAttempts: 3, lockLevel: 1, lockUntil: 3000 });
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      "secpass_login_guard",
      JSON.stringify({ failedAttempts: 3, lockLevel: 1, lockUntil: 3000 }),
      expect.any(Object),
    );
  });

  it("retorna null quando os dados armazenados sao invalidos", async () => {
    SecureStore.getItemAsync.mockResolvedValueOnce("not-json");
    AsyncStorage.getItem.mockResolvedValueOnce(null);

    const guard = await loadLoginGuard();

    expect(guard).toBeNull();
  });

  it("retorna null quando nao ha estado de guarda em nenhum armazenamento", async () => {
    SecureStore.getItemAsync.mockResolvedValueOnce(null);
    AsyncStorage.getItem.mockResolvedValueOnce(null);

    const guard = await loadLoginGuard();

    expect(guard).toBeNull();
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });

  it("limpa estado de lock nas duas stores", async () => {
    await clearLoginGuard();

    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(
      "secpass_login_guard",
      expect.any(Object),
    );
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith("secpass_login_guard");
  });
});
