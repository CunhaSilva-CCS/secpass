import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

import {
  clearSessionToken,
  loadSessionToken,
  saveSessionToken,
} from "../src/services/session";

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

describe("session service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("gera token aleatorio e salva no SecureStore", async () => {
    const token = await saveSessionToken();

    expect(token.startsWith("session:")).toBe(true);
    expect(token).toHaveLength("session:".length + 64);
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      "secpass_session",
      token,
      expect.any(Object),
    );
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith("secpass_session");
  });

  it("lanca erro quando SecureStore nao consegue salvar sessao", async () => {
    SecureStore.setItemAsync.mockRejectedValueOnce(new Error("secure-failure"));

    await expect(saveSessionToken("session:token")).rejects.toThrow(
      "Nao foi possivel salvar a sessao com seguranca neste dispositivo.",
    );
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it("retorna o token quando presente no SecureStore", async () => {
    SecureStore.getItemAsync.mockResolvedValueOnce("session:abc123");

    const token = await loadSessionToken();

    expect(token).toBe("session:abc123");
    expect(AsyncStorage.getItem).not.toHaveBeenCalled();
  });

  it("retorna null quando leitura do SecureStore falha", async () => {
    SecureStore.getItemAsync.mockRejectedValueOnce(new Error("secure-failure"));

    const token = await loadSessionToken();

    expect(token).toBeNull();
  });

  it("limpa sessao no SecureStore e legado", async () => {
    await clearSessionToken();

    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(
      "secpass_session",
      expect.any(Object),
    );
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith("secpass_session");
  });
});
