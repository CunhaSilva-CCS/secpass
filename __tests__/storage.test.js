import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

import {
  clearVault,
  loadPasswords,
  peekRemoteVault,
  savePasswords,
  VAULT_DELETE_ERROR,
} from "../src/services/storage";
import {
  createVaultMeta,
  decryptVaultEnvelope,
  encryptVaultItem,
  encryptVaultItems,
  unlockVaultKeys,
} from "../src/services/vaultCrypto";
import SecureVaultCloudKit from "../modules/secure-vault-cloudkit/src/SecureVaultCloudKitModule";
import SecureVaultSync from "../modules/secure-vault-sync/src/SecureVaultSyncModule";

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

jest.mock("../modules/secure-vault-sync/src/SecureVaultSyncModule", () => ({
  __esModule: true,
  default: {
    setItemAsync: jest.fn(),
    getItemAsync: jest.fn(),
    deleteItemAsync: jest.fn(),
  },
}));

jest.mock("../modules/secure-vault-cloudkit/src/SecureVaultCloudKitModule", () => ({
  __esModule: true,
  default: {
    getAccountStatusAsync: jest.fn(),
    fetchVaultMetaAsync: jest.fn(),
    saveVaultMetaAsync: jest.fn(),
    fetchCredentialsAsync: jest.fn(),
    upsertCredentialsAsync: jest.fn(),
    deleteVaultAsync: jest.fn(),
  },
}));

const sampleList = [
  {
    id: "1",
    title: "Email",
    username: "user@example.com",
    password: "S3nha!123",
  },
];

const VAULT_SECRET = "user@email.com:Senha!123";

const expectEncryptedPayload = async (rawPayload, expectedItems = sampleList) => {
  const envelope = JSON.parse(rawPayload);
  expect(envelope.type).toBe("encrypted_vault");
  await expect(decryptVaultEnvelope(envelope, VAULT_SECRET)).resolves.toEqual(
    expectedItems,
  );
};

describe("storage service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    SecureStore.setItemAsync.mockResolvedValue();
    SecureStore.getItemAsync.mockResolvedValue(null);
    SecureStore.deleteItemAsync.mockResolvedValue();
    AsyncStorage.getItem.mockResolvedValue(null);
    SecureVaultCloudKit.getAccountStatusAsync.mockResolvedValue("available");
    SecureVaultCloudKit.fetchVaultMetaAsync.mockResolvedValue(null);
    SecureVaultCloudKit.saveVaultMetaAsync.mockResolvedValue();
    SecureVaultCloudKit.fetchCredentialsAsync.mockResolvedValue([]);
    SecureVaultCloudKit.upsertCredentialsAsync.mockResolvedValue();
    SecureVaultCloudKit.deleteVaultAsync.mockResolvedValue();
    SecureVaultSync.getItemAsync.mockResolvedValue(null);
  });

  it("recusa salvar sem vaultSecret", async () => {
    await expect(savePasswords(sampleList)).rejects.toThrow(
      "Nao e possivel salvar o cofre sem a senha de acesso.",
    );
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
    expect(SecureVaultCloudKit.upsertCredentialsAsync).not.toHaveBeenCalled();
  });

  it("grava cache local mesmo se o CloudKit falhar", async () => {
    SecureVaultCloudKit.fetchVaultMetaAsync.mockRejectedValueOnce(
      new Error("icloud-down"),
    );

    await savePasswords(sampleList, { vaultSecret: VAULT_SECRET });

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      "passwords",
      expect.any(String),
      expect.any(Object),
    );
    await expectEncryptedPayload(SecureStore.setItemAsync.mock.calls[0][1]);
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith("passwords");
  });

  it("falha ao salvar quando o SecureStore local falha", async () => {
    SecureStore.setItemAsync.mockRejectedValueOnce(new Error("secure-failure"));

    await expect(
      savePasswords(sampleList, { vaultSecret: VAULT_SECRET }),
    ).rejects.toThrow(
      "Nao foi possivel salvar o cofre com seguranca neste dispositivo.",
    );
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it("carrega dados do SecureStore quando CloudKit ainda nao tem cofre", async () => {
    SecureStore.getItemAsync.mockResolvedValueOnce(JSON.stringify(sampleList));

    const loaded = await loadPasswords({ vaultSecret: VAULT_SECRET });

    expect(loaded).toEqual(sampleList);
    expect(SecureVaultCloudKit.upsertCredentialsAsync).toHaveBeenCalled();
  });

  it("nao promove plaintext legado ao CloudKit sem vaultSecret", async () => {
    AsyncStorage.getItem.mockResolvedValueOnce(JSON.stringify(sampleList));

    const loaded = await loadPasswords();

    expect(loaded).toEqual(sampleList);
    expect(SecureVaultCloudKit.upsertCredentialsAsync).not.toHaveBeenCalled();
    expect(AsyncStorage.removeItem).not.toHaveBeenCalled();
  });

  it("migra dados legados do AsyncStorage para o CloudKit", async () => {
    AsyncStorage.getItem.mockResolvedValueOnce(JSON.stringify(sampleList));

    const loaded = await loadPasswords({ vaultSecret: VAULT_SECRET });

    expect(loaded).toEqual(sampleList);
    expect(SecureVaultCloudKit.saveVaultMetaAsync).toHaveBeenCalled();
    expect(SecureVaultCloudKit.upsertCredentialsAsync).toHaveBeenCalled();
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith("passwords");
  });

  it("retorna lista vazia para JSON invalido", async () => {
    SecureStore.getItemAsync.mockResolvedValueOnce("not-json");

    const loaded = await loadPasswords();

    expect(loaded).toEqual([]);
  });

  it("descriptografa o cofre local com sucesso quando vaultSecret esta presente", async () => {
    const envelope = await encryptVaultItems(sampleList, VAULT_SECRET);
    SecureStore.getItemAsync.mockResolvedValueOnce(JSON.stringify(envelope));

    const loaded = await loadPasswords({ vaultSecret: VAULT_SECRET });

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

  it("peekRemoteVault devolve meta quando o CloudKit tem cofre", async () => {
    SecureVaultCloudKit.fetchVaultMetaAsync.mockResolvedValueOnce({
      email: "user@email.com",
      salt: "aa",
      verifier: "bb",
      iterations: 310000,
    });

    const remote = await peekRemoteVault();

    expect(remote.available).toBe(true);
    expect(remote.meta.email).toBe("user@email.com");
    expect(remote.meta.verifier).toBe("bb");
  });

  it("savePasswords envia cada credencial cifrada ao CloudKit", async () => {
    await savePasswords(sampleList, { vaultSecret: VAULT_SECRET });

    expect(SecureVaultCloudKit.saveVaultMetaAsync).toHaveBeenCalled();
    expect(SecureVaultCloudKit.upsertCredentialsAsync).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: "1",
          envelope: expect.any(String),
        }),
      ]),
    );
    const envelope = JSON.parse(
      SecureVaultCloudKit.upsertCredentialsAsync.mock.calls[0][0][0].envelope,
    );
    expect(envelope.type).toBe("encrypted_item");
  });

  it("loadPasswords le credenciais do CloudKit", async () => {
    const meta = createVaultMeta({
      vaultSecret: VAULT_SECRET,
      email: "user@email.com",
    });
    const keys = unlockVaultKeys(meta, VAULT_SECRET);
    SecureVaultCloudKit.fetchVaultMetaAsync.mockResolvedValueOnce({
      email: meta.email,
      salt: meta.kdf.salt,
      iterations: meta.kdf.iterations,
      verifier: meta.verifier,
    });
    SecureVaultCloudKit.fetchCredentialsAsync.mockResolvedValueOnce([
      {
        id: "1",
        envelope: JSON.stringify(encryptVaultItem(sampleList[0], keys)),
        updatedAt: 1,
      },
    ]);

    const loaded = await loadPasswords({ vaultSecret: VAULT_SECRET });

    expect(loaded).toEqual([sampleList[0]]);
  });

  it("clearVault apaga o cofre no CloudKit", async () => {
    await clearVault();

    expect(SecureVaultCloudKit.deleteVaultAsync).toHaveBeenCalled();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalled();
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith("passwords");
  });

  it("clearVault falha se o delete no CloudKit falhar", async () => {
    SecureVaultCloudKit.deleteVaultAsync.mockRejectedValueOnce(
      new Error("icloud-down"),
    );

    await expect(clearVault()).rejects.toThrow(VAULT_DELETE_ERROR);
    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
  });

  it("clearVault remove o fallback local mesmo se o SecureStore falhar", async () => {
    SecureStore.deleteItemAsync.mockRejectedValueOnce(
      new Error("secure-down"),
    );

    await clearVault();

    expect(AsyncStorage.removeItem).toHaveBeenCalledWith("passwords");
  });
});
