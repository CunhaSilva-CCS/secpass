import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

import { loadPasswords, savePasswords } from "../src/services/storage";

jest.mock("@react-native-async-storage/async-storage", () => ({
  setItem: jest.fn(),
  getItem: jest.fn(),
  removeItem: jest.fn(),
}));

jest.mock("expo-secure-store", () => ({
  setItemAsync: jest.fn(),
  getItemAsync: jest.fn(),
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
    );
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith("passwords");
  });

  it("retorna lista vazia para JSON invalido", async () => {
    SecureStore.getItemAsync.mockResolvedValueOnce("not-json");

    const loaded = await loadPasswords();

    expect(loaded).toEqual([]);
  });
});
