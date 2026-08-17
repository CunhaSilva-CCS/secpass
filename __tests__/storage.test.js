import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

import { clearVault, loadPasswords, savePasswords } from "../src/services/storage";
import { encryptVaultItems } from "../src/services/vaultCrypto";

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

const sampleList = [
  {
    id: "1",
    title: "Email",
    username: "user@example.com",
    password: "S3nha!123",
  },
];

describe("storage service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("salva no SecureStore e remove legado do AsyncStorage", async () => {
    SecureStore.setItemAsync.mockResolvedValueOnce();

    await savePasswords(sampleList);

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      "passwords",
      JSON.stringify(sampleList),
      expect.any(Object),
    );
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith("passwords");
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it("falha ao salvar quando SecureStore falha", async () => {
    SecureStore.setItemAsync.mockRejectedValueOnce(new Error("secure-failure"));

    await expect(savePasswords(sampleList)).rejects.toThrow(
      "Nao foi possivel salvar o cofre com seguranca neste dispositivo.",
    );
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it("carrega dados do SecureStore quando disponiveis", async () => {
    SecureStore.getItemAsync.mockResolvedValueOnce(JSON.stringify(sampleList));

    const loaded = await loadPasswords();

    expect(loaded).toEqual(sampleList);
    expect(AsyncStorage.getItem).not.toHaveBeenCalled();
  });

  it("migra dados legados do AsyncStorage para SecureStore", async () => {
    SecureStore.getItemAsync.mockResolvedValueOnce(null);
    AsyncStorage.getItem.mockResolvedValueOnce(JSON.stringify(sampleList));
    SecureStore.setItemAsync.mockResolvedValueOnce();

    const loaded = await loadPasswords();

    expect(loaded).toEqual(sampleList);
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      "passwords",
      JSON.stringify(sampleList),
      expect.any(Object),
    );
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith("passwords");
  });

  it("retorna lista vazia para JSON invalido", async () => {
    SecureStore.getItemAsync.mockResolvedValueOnce("not-json");

    const loaded = await loadPasswords();

    expect(loaded).toEqual([]);
  });

  it("retorna lista vazia quando o payload nao e array nem cofre cifrado", async () => {
    SecureStore.getItemAsync.mockResolvedValueOnce(
      JSON.stringify({ foo: "bar" }),
    );

    const loaded = await loadPasswords();

    expect(loaded).toEqual([]);
  });

  it("retorna lista vazia quando nao ha dados em nenhum armazenamento", async () => {
    SecureStore.getItemAsync.mockResolvedValueOnce(null);
    AsyncStorage.getItem.mockResolvedValueOnce(null);

    const loaded = await loadPasswords();

    expect(loaded).toEqual([]);
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });

  it("descriptografa o cofre com sucesso quando vaultSecret esta presente", async () => {
    const vaultSecret = "user@email.com:Senha!123";
    const envelope = await encryptVaultItems(sampleList, vaultSecret);
    SecureStore.getItemAsync.mockResolvedValueOnce(JSON.stringify(envelope));

    const loaded = await loadPasswords({ vaultSecret });

    expect(loaded).toEqual(sampleList);
  });

  it("lanca erro ao carregar cofre cifrado sem vaultSecret", async () => {
    SecureStore.getItemAsync.mockResolvedValueOnce(
      JSON.stringify({ type: "encrypted_vault" }),
    );

    await expect(loadPasswords()).rejects.toThrow(
      "Cofre criptografado. Faca login novamente.",
    );
  });

  it("clearVault remove o cofre do SecureStore e do AsyncStorage", async () => {
    SecureStore.deleteItemAsync.mockResolvedValueOnce();

    await clearVault();

    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(
      "passwords",
      expect.any(Object),
    );
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith("passwords");
  });

  it("clearVault remove o fallback mesmo se o SecureStore falhar", async () => {
    SecureStore.deleteItemAsync.mockRejectedValueOnce(
      new Error("secure-down"),
    );

    await clearVault();

    expect(AsyncStorage.removeItem).toHaveBeenCalledWith("passwords");
  });
});
