import AsyncStorage from "@react-native-async-storage/async-storage";
import CryptoJS from "crypto-js";
import * as SecureStore from "expo-secure-store";

import {
  loadLocalAccount,
  saveLocalAccount,
  verifyLocalAccount,
} from "../src/services/account";

jest.mock("@react-native-async-storage/async-storage", () => ({
  setItem: jest.fn(),
  getItem: jest.fn(),
  removeItem: jest.fn(),
}));

jest.mock("expo-secure-store", () => ({
  setItemAsync: jest.fn(),
  getItemAsync: jest.fn(),
}));

jest.mock("expo-crypto", () => ({
  digestStringAsync: jest.fn(),
  getRandomBytesAsync: jest.fn(),
  CryptoDigestAlgorithm: {
    SHA256: "sha256",
  },
}));

const ACCOUNT_KEY = "secpass_account";

const pbkdf2Hash = (password, salt) =>
  CryptoJS.PBKDF2(password, salt, {
    keySize: 256 / 32,
    iterations: 120000,
    hasher: CryptoJS.algo.SHA256,
  }).toString(CryptoJS.enc.Hex);

describe("account service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const expoCrypto = require("expo-crypto");
    expoCrypto.getRandomBytesAsync.mockResolvedValue(
      Uint8Array.from(Array(16).fill(11)),
    );
  });

  it("salva conta no SecureStore em formato v3 (PBKDF2) e remove legado", async () => {
    SecureStore.setItemAsync.mockResolvedValueOnce();

    await saveLocalAccount({
      email: "User@Email.com",
      password: "1234",
    });

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      ACCOUNT_KEY,
      expect.any(String),
    );

    const [, serializedAccount] = SecureStore.setItemAsync.mock.calls[0];
    const parsedAccount = JSON.parse(serializedAccount);

    expect(parsedAccount.email).toBe("user@email.com");
    expect(parsedAccount.version).toBe(3);
    expect(parsedAccount.kdf).toBe("pbkdf2");
    expect(parsedAccount.iterations).toBe(120000);
    expect(parsedAccount.keySize).toBe(256);
    expect(parsedAccount.passwordHash).toBe(
      pbkdf2Hash("1234", parsedAccount.salt),
    );
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith(ACCOUNT_KEY);
  });

  it("normaliza email com espacos e caixa mista ao salvar", async () => {
    SecureStore.setItemAsync.mockResolvedValueOnce();

    await saveLocalAccount({
      email: "  User.Mixed+tag@Email.COM  ",
      password: "Senha!123",
    });

    const [, serializedAccount] = SecureStore.setItemAsync.mock.calls[0];
    const parsedAccount = JSON.parse(serializedAccount);

    expect(parsedAccount.email).toBe("user.mixed+tag@email.com");
  });

  it("valida conta v3 com PBKDF2", async () => {
    const salt = "salt-v3";
    const password = "Abc!2345";

    SecureStore.getItemAsync.mockResolvedValueOnce(
      JSON.stringify({
        email: "user@email.com",
        salt,
        passwordHash: pbkdf2Hash(password, salt),
        version: 3,
        kdf: "pbkdf2",
        iterations: 120000,
        keySize: 256,
      }),
    );

    const isValid = await verifyLocalAccount({
      email: " User@Email.com ",
      password,
    });

    expect(isValid).toBe(true);
  });

  it("migra conta v2 para v3 no login bem-sucedido", async () => {
    const expoCrypto = require("expo-crypto");
    expoCrypto.digestStringAsync.mockResolvedValueOnce("legacy-v2-hash");

    SecureStore.getItemAsync.mockResolvedValueOnce(
      JSON.stringify({
        email: "user@email.com",
        salt: "legacy-salt",
        passwordHash: "legacy-v2-hash",
        version: 2,
      }),
    );

    const isValid = await verifyLocalAccount({
      email: "user@email.com",
      password: "1234",
    });

    expect(isValid).toBe(true);
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      ACCOUNT_KEY,
      expect.any(String),
    );

    const [, serializedAccount] = SecureStore.setItemAsync.mock.calls[0];
    const parsedAccount = JSON.parse(serializedAccount);

    expect(parsedAccount.version).toBe(3);
    expect(parsedAccount.kdf).toBe("pbkdf2");
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith(ACCOUNT_KEY);
  });

  it("migra conta legada v1 do AsyncStorage para SecureStore", async () => {
    SecureStore.getItemAsync.mockResolvedValueOnce(null);
    AsyncStorage.getItem.mockResolvedValueOnce(
      JSON.stringify({
        email: "legacy@email.com",
        password: "1234",
      }),
    );

    const loaded = await loadLocalAccount();

    expect(loaded).toEqual({ email: "legacy@email.com" });
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      ACCOUNT_KEY,
      expect.any(String),
    );
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith(ACCOUNT_KEY);
  });

  it("retorna false quando nao existe conta", async () => {
    SecureStore.getItemAsync.mockResolvedValueOnce(null);

    const isValid = await verifyLocalAccount({
      email: "user@email.com",
      password: "1234",
    });

    expect(isValid).toBe(false);
  });

  it("retorna null quando payload do SecureStore e invalido", async () => {
    SecureStore.getItemAsync.mockResolvedValueOnce("not-json");
    AsyncStorage.getItem.mockResolvedValueOnce(null);

    const loaded = await loadLocalAccount();

    expect(loaded).toBeNull();
  });

  it("retorna false quando payload da conta e invalido", async () => {
    SecureStore.getItemAsync.mockResolvedValueOnce('{"email":"x"}');

    const isValid = await verifyLocalAccount({
      email: "x@email.com",
      password: "1234",
    });

    expect(isValid).toBe(false);
  });

  it("usa fallback legado quando leitura do SecureStore falha", async () => {
    SecureStore.getItemAsync.mockRejectedValueOnce(new Error("secure-down"));
    AsyncStorage.getItem.mockResolvedValueOnce(
      JSON.stringify({
        email: "legacy@email.com",
        password: "1234",
      }),
    );

    const loaded = await loadLocalAccount();

    expect(loaded).toEqual({ email: "legacy@email.com" });
  });

  it("valida login via fallback legado quando SecureStore falha", async () => {
    const expoCrypto = require("expo-crypto");
    expoCrypto.digestStringAsync.mockResolvedValueOnce("legacy-v2-hash");

    SecureStore.getItemAsync.mockRejectedValueOnce(new Error("secure-down"));
    AsyncStorage.getItem.mockResolvedValueOnce(
      JSON.stringify({
        email: "legacy@email.com",
        salt: "legacy-salt",
        passwordHash: "legacy-v2-hash",
        version: 2,
      }),
    );

    const isValid = await verifyLocalAccount({
      email: "legacy@email.com",
      password: "1234",
    });

    expect(isValid).toBe(true);
  });

  it("lanca erro ao salvar quando SecureStore nao esta disponivel", async () => {
    SecureStore.setItemAsync.mockRejectedValueOnce(new Error("secure-down"));

    await expect(
      saveLocalAccount({
        email: "user@email.com",
        password: "1234",
      }),
    ).rejects.toThrow("Falha ao salvar conta no armazenamento seguro.");
  });
});
