import AsyncStorage from "@react-native-async-storage/async-storage";
import crypto from "crypto";
import * as SecureStore from "expo-secure-store";

import {
  deleteLocalAccount,
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
  deleteItemAsync: jest.fn(),
}));

const ACCOUNT_KEY = "secpass_account";

const pbkdf2Hash = (password, salt) =>
  crypto.pbkdf2Sync(password, salt, 310000, 32, "sha256").toString("hex");

const sha256Hex = (value) =>
  crypto.createHash("sha256").update(value).digest("hex");

describe("account service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
      expect.any(Object),
    );

    const [, serializedAccount] = SecureStore.setItemAsync.mock.calls[0];
    const parsedAccount = JSON.parse(serializedAccount);

    expect(parsedAccount.email).toBe("user@email.com");
    expect(parsedAccount.version).toBe(3);
    expect(parsedAccount.kdf).toBe("pbkdf2");
    expect(parsedAccount.iterations).toBe(310000);
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
        iterations: 310000,
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
    const salt = "legacy-salt";
    const password = "1234";

    SecureStore.getItemAsync.mockResolvedValueOnce(
      JSON.stringify({
        email: "user@email.com",
        salt,
        passwordHash: sha256Hex(`${salt}:${password}`),
        version: 2,
      }),
    );

    const isValid = await verifyLocalAccount({
      email: "user@email.com",
      password,
    });

    expect(isValid).toBe(true);
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      ACCOUNT_KEY,
      expect.any(String),
      expect.any(Object),
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
      expect.any(Object),
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
    const salt = "legacy-salt";
    const password = "1234";

    SecureStore.getItemAsync.mockRejectedValueOnce(new Error("secure-down"));
    AsyncStorage.getItem.mockResolvedValueOnce(
      JSON.stringify({
        email: "legacy@email.com",
        salt,
        passwordHash: sha256Hex(`${salt}:${password}`),
        version: 2,
      }),
    );

    const isValid = await verifyLocalAccount({
      email: "legacy@email.com",
      password,
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

  it("retorna null quando o payload armazenado nao tem email", async () => {
    SecureStore.getItemAsync.mockResolvedValueOnce(
      JSON.stringify({ passwordHash: "x", salt: "y" }),
    );
    AsyncStorage.getItem.mockResolvedValueOnce(null);

    const loaded = await loadLocalAccount();

    expect(loaded).toBeNull();
  });

  it("migra conta v3 legada do AsyncStorage para o SecureStore ao carregar", async () => {
    const salt = "legacy-salt-v3";
    const password = "Abc!2345";

    SecureStore.getItemAsync.mockResolvedValueOnce(null);
    AsyncStorage.getItem.mockResolvedValueOnce(
      JSON.stringify({
        email: "user@email.com",
        salt,
        passwordHash: pbkdf2Hash(password, salt),
        version: 3,
        kdf: "pbkdf2",
        iterations: 310000,
        keySize: 256,
      }),
    );
    SecureStore.setItemAsync.mockResolvedValueOnce();

    const loaded = await loadLocalAccount();

    expect(loaded).toEqual({ email: "user@email.com" });
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      ACCOUNT_KEY,
      expect.any(String),
      expect.any(Object),
    );
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith(ACCOUNT_KEY);
  });

  it("mantem leitura legada quando a migracao para SecureStore falha", async () => {
    const salt = "legacy-salt-v3";
    const password = "Abc!2345";

    SecureStore.getItemAsync.mockResolvedValueOnce(null);
    AsyncStorage.getItem.mockResolvedValueOnce(
      JSON.stringify({
        email: "user@email.com",
        salt,
        passwordHash: pbkdf2Hash(password, salt),
        version: 3,
        kdf: "pbkdf2",
        iterations: 310000,
        keySize: 256,
      }),
    );
    SecureStore.setItemAsync.mockRejectedValueOnce(new Error("secure-down"));

    const loaded = await loadLocalAccount();

    expect(loaded).toEqual({ email: "user@email.com" });
    expect(AsyncStorage.removeItem).not.toHaveBeenCalledWith(ACCOUNT_KEY);
  });

  it("valida senha legada v1 correta e migra para v3", async () => {
    SecureStore.getItemAsync.mockResolvedValueOnce(
      JSON.stringify({
        email: "legacy@email.com",
        password: "senha-certa",
      }),
    );
    SecureStore.setItemAsync.mockResolvedValueOnce();

    const isValid = await verifyLocalAccount({
      email: "legacy@email.com",
      password: "senha-certa",
    });

    expect(isValid).toBe(true);
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      ACCOUNT_KEY,
      expect.any(String),
      expect.any(Object),
    );
  });

  it("retorna false para senha legada v1 incorreta", async () => {
    SecureStore.getItemAsync.mockResolvedValueOnce(
      JSON.stringify({
        email: "legacy@email.com",
        password: "senha-certa",
      }),
    );

    const isValid = await verifyLocalAccount({
      email: "legacy@email.com",
      password: "senha-errada",
    });

    expect(isValid).toBe(false);
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });

  it("retorna false quando o email nao confere com a conta v3", async () => {
    const salt = "salt-v3";
    const password = "Abc!2345";

    SecureStore.getItemAsync.mockResolvedValueOnce(
      JSON.stringify({
        email: "dono@email.com",
        salt,
        passwordHash: pbkdf2Hash(password, salt),
        version: 3,
        kdf: "pbkdf2",
        iterations: 310000,
        keySize: 256,
      }),
    );

    const isValid = await verifyLocalAccount({
      email: "outro@email.com",
      password,
    });

    expect(isValid).toBe(false);
  });

  it("deleteLocalAccount remove a conta do SecureStore e do AsyncStorage", async () => {
    SecureStore.deleteItemAsync.mockResolvedValueOnce();

    await deleteLocalAccount();

    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(
      ACCOUNT_KEY,
      expect.any(Object),
    );
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith(ACCOUNT_KEY);
  });

  it("deleteLocalAccount remove o fallback mesmo se o SecureStore falhar", async () => {
    SecureStore.deleteItemAsync.mockRejectedValueOnce(
      new Error("secure-down"),
    );

    await deleteLocalAccount();

    expect(AsyncStorage.removeItem).toHaveBeenCalledWith(ACCOUNT_KEY);
  });
});
