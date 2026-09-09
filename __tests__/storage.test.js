import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

import {
  clearVault,
  getVaultModuleForBackend,
  loadPasswords,
  migrateVaultBackend,
  peekRemoteVault,
  peekRemoteVaultSummary,
  savePasswords,
  SYNC_BACKEND_UNAVAILABLE,
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
import { isDriveSignedIn } from "../src/services/driveAuth";
import DriveVaultModule from "../src/services/driveVaultModule";
import { getSyncBackendPreference } from "../src/services/syncPreference";
import { logSecurityEvent } from "../src/services/securityAudit";

jest.mock("../src/services/securityAudit", () => ({
  logSecurityEvent: jest.fn().mockResolvedValue(),
}));

jest.mock("../src/services/driveAuth", () => ({
  isDriveSignedIn: jest.fn(),
  signOutDrive: jest.fn().mockResolvedValue(),
}));

jest.mock("../src/services/syncPreference", () => ({
  SYNC_BACKEND_DRIVE: "drive",
  SYNC_BACKEND_ICLOUD: "icloud",
  getSyncBackendPreference: jest.fn(),
}));

jest.mock("../src/services/driveVaultModule", () => ({
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
    getSyncBackendPreference.mockResolvedValue("icloud");
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
    isDriveSignedIn.mockResolvedValue(false);
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
        envelope: JSON.stringify(
          encryptVaultItem(sampleList[0], keys, {
            revisionAt: 1,
            tombstone: false,
          }),
        ),
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

  it("clearVault registra evento quando o blob legado do iCloud Keychain nao pode ser apagado", async () => {
    SecureVaultSync.deleteItemAsync.mockRejectedValueOnce(
      new Error("keychain-down"),
    );

    await clearVault();

    expect(logSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "vault_delete_incomplete" }),
    );
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

describe("storage service - backend remoto no Android (Google Drive)", () => {
  const originalPlatformOS = Platform.OS;

  beforeEach(() => {
    Platform.OS = "android";
    jest.clearAllMocks();
    getSyncBackendPreference.mockResolvedValue("drive");
    SecureStore.setItemAsync.mockResolvedValue();
    SecureStore.getItemAsync.mockResolvedValue(null);
    SecureStore.deleteItemAsync.mockResolvedValue();
    AsyncStorage.getItem.mockResolvedValue(null);
    DriveVaultModule.getAccountStatusAsync.mockResolvedValue("available");
    DriveVaultModule.fetchVaultMetaAsync.mockResolvedValue(null);
    DriveVaultModule.saveVaultMetaAsync.mockResolvedValue();
    DriveVaultModule.fetchCredentialsAsync.mockResolvedValue([]);
    DriveVaultModule.upsertCredentialsAsync.mockResolvedValue();
    DriveVaultModule.deleteVaultAsync.mockResolvedValue();
  });

  afterEach(() => {
    Platform.OS = originalPlatformOS;
  });

  it("ignora o Drive quando o usuario nao autenticou com Google", async () => {
    isDriveSignedIn.mockResolvedValue(false);

    const remote = await peekRemoteVault();

    expect(remote).toEqual({ available: false, status: "unsupported", meta: null });
    expect(DriveVaultModule.getAccountStatusAsync).not.toHaveBeenCalled();
  });

  it("peekRemoteVault usa o Drive quando ha sessao Google ativa", async () => {
    isDriveSignedIn.mockResolvedValue(true);
    DriveVaultModule.fetchVaultMetaAsync.mockResolvedValueOnce({
      email: "user@email.com",
      salt: "aa",
      verifier: "bb",
      iterations: 600000,
    });

    const remote = await peekRemoteVault();

    expect(remote.available).toBe(true);
    expect(remote.meta.email).toBe("user@email.com");
    expect(SecureVaultCloudKit.getAccountStatusAsync).not.toHaveBeenCalled();
  });

  it("savePasswords publica no Drive quando o usuario esta autenticado com Google", async () => {
    isDriveSignedIn.mockResolvedValue(true);

    await savePasswords(sampleList, { vaultSecret: VAULT_SECRET });

    expect(DriveVaultModule.saveVaultMetaAsync).toHaveBeenCalled();
    expect(DriveVaultModule.upsertCredentialsAsync).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: "1", envelope: expect.any(String) }),
      ]),
    );
  });

  it("savePasswords nao chama o Drive quando o usuario nao ativou a sincronizacao", async () => {
    isDriveSignedIn.mockResolvedValue(false);

    await savePasswords(sampleList, { vaultSecret: VAULT_SECRET });

    expect(DriveVaultModule.upsertCredentialsAsync).not.toHaveBeenCalled();
    expect(SecureStore.setItemAsync).toHaveBeenCalled();
  });

  it("clearVault apaga o cofre no Drive e encerra a sessao Google", async () => {
    const { signOutDrive } = require("../src/services/driveAuth");
    isDriveSignedIn.mockResolvedValue(true);

    await clearVault();

    expect(DriveVaultModule.deleteVaultAsync).toHaveBeenCalled();
    expect(signOutDrive).toHaveBeenCalled();
  });
});

describe("storage service - preferencia de backend nao tem fallback automatico", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    SecureStore.setItemAsync.mockResolvedValue();
    SecureStore.getItemAsync.mockResolvedValue(null);
    AsyncStorage.getItem.mockResolvedValue(null);
    SecureVaultCloudKit.getAccountStatusAsync.mockResolvedValue("available");
    SecureVaultCloudKit.fetchVaultMetaAsync.mockResolvedValue(null);
    SecureVaultCloudKit.fetchCredentialsAsync.mockResolvedValue([]);
    isDriveSignedIn.mockResolvedValue(false);
  });

  it("nao cai pro CloudKit quando a preferencia e drive e o Google nao esta logado", async () => {
    getSyncBackendPreference.mockResolvedValue("drive");

    await savePasswords(sampleList, { vaultSecret: VAULT_SECRET });

    expect(SecureVaultCloudKit.saveVaultMetaAsync).not.toHaveBeenCalled();
    expect(SecureVaultCloudKit.upsertCredentialsAsync).not.toHaveBeenCalled();
    expect(SecureStore.setItemAsync).toHaveBeenCalled();
  });
});

describe("storage service - migrateVaultBackend", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    SecureVaultCloudKit.getAccountStatusAsync.mockResolvedValue("available");
    SecureVaultCloudKit.fetchVaultMetaAsync.mockResolvedValue(null);
    SecureVaultCloudKit.fetchCredentialsAsync.mockResolvedValue([]);
    SecureVaultCloudKit.saveVaultMetaAsync.mockResolvedValue();
    SecureVaultCloudKit.upsertCredentialsAsync.mockResolvedValue();
    DriveVaultModule.getAccountStatusAsync.mockResolvedValue("available");
    DriveVaultModule.fetchVaultMetaAsync.mockResolvedValue(null);
    DriveVaultModule.fetchCredentialsAsync.mockResolvedValue([]);
    DriveVaultModule.saveVaultMetaAsync.mockResolvedValue();
    DriveVaultModule.upsertCredentialsAsync.mockResolvedValue();
  });

  it("lanca erro quando o backend de destino nao esta disponivel", async () => {
    DriveVaultModule.getAccountStatusAsync.mockResolvedValueOnce("unavailable");

    await expect(
      migrateVaultBackend({
        fromModule: SecureVaultCloudKit,
        toModule: DriveVaultModule,
        vaultSecret: VAULT_SECRET,
      }),
    ).rejects.toThrow(SYNC_BACKEND_UNAVAILABLE);
    expect(DriveVaultModule.saveVaultMetaAsync).not.toHaveBeenCalled();
  });

  it("nao faz nada quando nao ha backend de origem", async () => {
    await migrateVaultBackend({
      fromModule: null,
      toModule: DriveVaultModule,
      vaultSecret: VAULT_SECRET,
    });

    expect(DriveVaultModule.saveVaultMetaAsync).not.toHaveBeenCalled();
    expect(DriveVaultModule.upsertCredentialsAsync).not.toHaveBeenCalled();
  });

  it("nao faz nada quando a origem nao tem cofre remoto", async () => {
    SecureVaultCloudKit.fetchVaultMetaAsync.mockResolvedValueOnce(null);

    await migrateVaultBackend({
      fromModule: SecureVaultCloudKit,
      toModule: DriveVaultModule,
      vaultSecret: VAULT_SECRET,
    });

    expect(DriveVaultModule.saveVaultMetaAsync).not.toHaveBeenCalled();
  });

  it("copia meta e credenciais cifradas da origem para o destino", async () => {
    const meta = createVaultMeta({
      vaultSecret: VAULT_SECRET,
      email: "user@email.com",
    });
    const keys = unlockVaultKeys(meta, VAULT_SECRET);
    const rawMeta = {
      email: meta.email,
      salt: meta.kdf.salt,
      iterations: meta.kdf.iterations,
      verifier: meta.verifier,
    };
    const records = [
      {
        id: "1",
        envelope: JSON.stringify(encryptVaultItem(sampleList[0], keys)),
        updatedAt: 1,
      },
    ];
    SecureVaultCloudKit.fetchVaultMetaAsync.mockResolvedValueOnce(rawMeta);
    SecureVaultCloudKit.fetchCredentialsAsync.mockResolvedValueOnce(records);

    await migrateVaultBackend({
      fromModule: SecureVaultCloudKit,
      toModule: DriveVaultModule,
      vaultSecret: VAULT_SECRET,
    });

    expect(DriveVaultModule.saveVaultMetaAsync).toHaveBeenCalledWith(rawMeta);
    expect(DriveVaultModule.upsertCredentialsAsync).toHaveBeenCalledWith(
      records,
    );
  });

  it("nao copia nada se a senha atual nao abrir o cofre de origem", async () => {
    const meta = createVaultMeta({
      vaultSecret: "outra:senha",
      email: "outra@email.com",
    });
    SecureVaultCloudKit.fetchVaultMetaAsync.mockResolvedValueOnce({
      email: meta.email,
      salt: meta.kdf.salt,
      iterations: meta.kdf.iterations,
      verifier: meta.verifier,
    });

    await expect(
      migrateVaultBackend({
        fromModule: SecureVaultCloudKit,
        toModule: DriveVaultModule,
        vaultSecret: VAULT_SECRET,
      }),
    ).rejects.toThrow("Falha de integridade do cofre.");
    expect(DriveVaultModule.saveVaultMetaAsync).not.toHaveBeenCalled();
  });
});

describe("storage service - getVaultModuleForBackend", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("resolve o modulo CloudKit para 'icloud' no iOS", async () => {
    const resolved = await getVaultModuleForBackend("icloud");
    expect(resolved).toBe(SecureVaultCloudKit);
  });

  it("resolve o modulo Drive para 'drive' quando ha sessao Google ativa", async () => {
    isDriveSignedIn.mockResolvedValue(true);

    const resolved = await getVaultModuleForBackend("drive");

    expect(resolved).toBe(DriveVaultModule);
  });

  it("resolve null para 'drive' sem sessao Google ativa", async () => {
    isDriveSignedIn.mockResolvedValue(false);

    const resolved = await getVaultModuleForBackend("drive");

    expect(resolved).toBeNull();
  });
});

describe("storage service - peekRemoteVaultSummary", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getSyncBackendPreference.mockResolvedValue("icloud");
    SecureVaultCloudKit.getAccountStatusAsync.mockResolvedValue("available");
  });

  it("conta so itens ativos e acha a data de modificacao mais recente, sem decifrar nada", async () => {
    SecureVaultCloudKit.fetchCredentialsAsync.mockResolvedValueOnce([
      { id: "1", envelope: "cipher-1", updatedAt: 1000, tombstone: false },
      { id: "2", envelope: "cipher-2", updatedAt: 3000, tombstone: false },
      { id: "3", envelope: "cipher-3", updatedAt: 5000, tombstone: true },
    ]);

    const summary = await peekRemoteVaultSummary();

    expect(summary).toEqual({ itemCount: 2, lastModifiedAt: 3000 });
  });

  it("retorna itemCount 0 e lastModifiedAt null quando o cofre remoto esta vazio", async () => {
    SecureVaultCloudKit.fetchCredentialsAsync.mockResolvedValueOnce([]);

    const summary = await peekRemoteVaultSummary();

    expect(summary).toEqual({ itemCount: 0, lastModifiedAt: null });
  });

  it("retorna null quando o backend remoto nao esta disponivel", async () => {
    SecureVaultCloudKit.getAccountStatusAsync.mockResolvedValueOnce(
      "unavailable",
    );

    const summary = await peekRemoteVaultSummary();

    expect(summary).toBeNull();
    expect(SecureVaultCloudKit.fetchCredentialsAsync).not.toHaveBeenCalled();
  });

  it("retorna null quando ha falha ao consultar o backend remoto", async () => {
    SecureVaultCloudKit.fetchCredentialsAsync.mockRejectedValueOnce(
      new Error("network-down"),
    );

    const summary = await peekRemoteVaultSummary();

    expect(summary).toBeNull();
  });
});
