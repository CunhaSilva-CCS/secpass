import {
  clearVault,
  getVaultModuleForBackend,
  loadPasswords,
  migrateVaultBackend,
  peekRemoteVault,
  savePasswords,
  SYNC_BACKEND_UNAVAILABLE,
  VAULT_DELETE_ERROR,
} from "../src/main/core/storage.js";
import {
  createVaultMeta,
  encryptVaultItem,
  unlockVaultKeys,
} from "../src/main/core/vaultCrypto.js";
import { isDriveSignedIn, signOutDrive } from "../src/main/core/driveAuth.js";
import { secureDelete, secureGet, secureSet } from "../src/main/secureStore.js";
import { getSyncBackendPreference } from "../src/main/core/syncPreference.js";
import driveVaultModule from "../src/main/core/driveVaultModule.js";
import cloudKitVaultModule from "../src/main/core/cloudKitVaultModule.js";

jest.mock("../src/main/core/driveAuth.js", () => ({
  isDriveSignedIn: jest.fn(),
  signOutDrive: jest.fn(),
  getValidAccessToken: jest.fn(),
}));

jest.mock("../src/main/secureStore.js", () => ({
  secureGet: jest.fn(),
  secureSet: jest.fn(),
  secureDelete: jest.fn(),
}));

jest.mock("../src/main/core/syncPreference.js", () => ({
  SYNC_BACKEND_DRIVE: "drive",
  SYNC_BACKEND_ICLOUD: "icloud",
  getSyncBackendPreference: jest.fn(),
}));

jest.mock("../src/main/core/driveVaultModule.js", () => ({
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

jest.mock("../src/main/core/cloudKitVaultModule.js", () => ({
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
  { id: "1", title: "Email", username: "user@example.com", password: "S3nha!123" },
];
const VAULT_SECRET = "user@email.com:Senha!123";

describe("storage (desktop) - backend Drive", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getSyncBackendPreference.mockReturnValue("drive");
    isDriveSignedIn.mockResolvedValue(true);
    secureGet.mockReturnValue(null);
    driveVaultModule.getAccountStatusAsync.mockResolvedValue("available");
    driveVaultModule.fetchVaultMetaAsync.mockResolvedValue(null);
    driveVaultModule.fetchCredentialsAsync.mockResolvedValue([]);
    driveVaultModule.saveVaultMetaAsync.mockResolvedValue();
    driveVaultModule.upsertCredentialsAsync.mockResolvedValue();
    driveVaultModule.deleteVaultAsync.mockResolvedValue();
  });

  it("recusa salvar sem vaultSecret", async () => {
    await expect(savePasswords(sampleList)).rejects.toThrow(
      "Nao e possivel salvar o cofre sem a senha de acesso.",
    );
    expect(secureSet).not.toHaveBeenCalled();
  });

  it("grava cache local mesmo se o Drive falhar", async () => {
    driveVaultModule.fetchVaultMetaAsync.mockRejectedValueOnce(
      new Error("drive-down"),
    );

    await savePasswords(sampleList, { vaultSecret: VAULT_SECRET });

    expect(secureSet).toHaveBeenCalledWith("secpass_vault", expect.any(String));
  });

  it("nao usa o Drive quando o usuario nao esta autenticado", async () => {
    isDriveSignedIn.mockResolvedValue(false);

    await savePasswords(sampleList, { vaultSecret: VAULT_SECRET });

    expect(driveVaultModule.upsertCredentialsAsync).not.toHaveBeenCalled();
    expect(secureSet).toHaveBeenCalled();
  });

  it("um item remoto corrompido nao derruba o carregamento do resto do cofre", async () => {
    const meta = createVaultMeta({ vaultSecret: VAULT_SECRET, email: "user@email.com" });
    const keys = unlockVaultKeys(meta, VAULT_SECRET);
    const goodRecord = {
      id: "1",
      envelope: JSON.stringify(
        encryptVaultItem(sampleList[0], keys, { revisionAt: 1, tombstone: false }),
      ),
      updatedAt: 1,
      tombstone: false,
    };
    const corruptedRecord = { id: "2", envelope: "not-json{{{", updatedAt: 2, tombstone: false };

    driveVaultModule.fetchVaultMetaAsync.mockResolvedValue({
      email: meta.email,
      salt: meta.kdf.salt,
      iterations: meta.kdf.iterations,
      verifier: meta.verifier,
    });
    driveVaultModule.fetchCredentialsAsync.mockResolvedValue([
      goodRecord,
      corruptedRecord,
    ]);

    const loaded = await loadPasswords({ vaultSecret: VAULT_SECRET });

    expect(loaded).toEqual([sampleList[0]]);
  });

  it("peekRemoteVault devolve meta quando o Drive tem cofre", async () => {
    driveVaultModule.fetchVaultMetaAsync.mockResolvedValueOnce({
      email: "user@email.com",
      salt: "aa",
      verifier: "bb",
      iterations: 600000,
    });

    const remote = await peekRemoteVault();

    expect(remote.available).toBe(true);
    expect(remote.meta.email).toBe("user@email.com");
  });

  it("clearVault apaga o cofre remoto e encerra a sessao Google", async () => {
    await clearVault();

    expect(driveVaultModule.deleteVaultAsync).toHaveBeenCalled();
    expect(signOutDrive).toHaveBeenCalled();
    expect(secureDelete).toHaveBeenCalledWith("secpass_vault");
  });

  it("clearVault falha se o delete remoto falhar", async () => {
    driveVaultModule.deleteVaultAsync.mockRejectedValueOnce(new Error("drive-down"));

    await expect(clearVault()).rejects.toThrow(VAULT_DELETE_ERROR);
  });
});

describe("storage (desktop) - getVaultModuleForBackend", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("resolve o modulo CloudKit para 'icloud'", async () => {
    const resolved = await getVaultModuleForBackend("icloud");
    expect(resolved).toBe(cloudKitVaultModule);
  });

  it("resolve o modulo Drive para 'drive' quando ha sessao Google ativa", async () => {
    isDriveSignedIn.mockResolvedValue(true);

    const resolved = await getVaultModuleForBackend("drive");

    expect(resolved).toBe(driveVaultModule);
  });

  it("resolve null para 'drive' sem sessao Google ativa", async () => {
    isDriveSignedIn.mockResolvedValue(false);

    const resolved = await getVaultModuleForBackend("drive");

    expect(resolved).toBeNull();
  });
});

describe("storage (desktop) - migrateVaultBackend", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    driveVaultModule.getAccountStatusAsync.mockResolvedValue("available");
    driveVaultModule.fetchVaultMetaAsync.mockResolvedValue(null);
    driveVaultModule.fetchCredentialsAsync.mockResolvedValue([]);
    driveVaultModule.saveVaultMetaAsync.mockResolvedValue();
    driveVaultModule.upsertCredentialsAsync.mockResolvedValue();
    cloudKitVaultModule.getAccountStatusAsync.mockResolvedValue("available");
    cloudKitVaultModule.fetchVaultMetaAsync.mockResolvedValue(null);
    cloudKitVaultModule.fetchCredentialsAsync.mockResolvedValue([]);
    cloudKitVaultModule.saveVaultMetaAsync.mockResolvedValue();
    cloudKitVaultModule.upsertCredentialsAsync.mockResolvedValue();
  });

  it("lanca erro quando o backend de destino nao esta disponivel", async () => {
    driveVaultModule.getAccountStatusAsync.mockResolvedValueOnce("unavailable");

    await expect(
      migrateVaultBackend({
        fromModule: cloudKitVaultModule,
        toModule: driveVaultModule,
        vaultSecret: VAULT_SECRET,
      }),
    ).rejects.toThrow(SYNC_BACKEND_UNAVAILABLE);
    expect(driveVaultModule.saveVaultMetaAsync).not.toHaveBeenCalled();
  });

  it("nao faz nada quando nao ha backend de origem", async () => {
    await migrateVaultBackend({
      fromModule: null,
      toModule: driveVaultModule,
      vaultSecret: VAULT_SECRET,
    });

    expect(driveVaultModule.saveVaultMetaAsync).not.toHaveBeenCalled();
  });

  it("copia meta e credenciais cifradas da origem para o destino", async () => {
    const meta = createVaultMeta({ vaultSecret: VAULT_SECRET, email: "user@email.com" });
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
        envelope: JSON.stringify(
          encryptVaultItem(sampleList[0], keys, { revisionAt: 1, tombstone: false }),
        ),
        updatedAt: 1,
        tombstone: false,
      },
    ];
    cloudKitVaultModule.fetchVaultMetaAsync.mockResolvedValueOnce(rawMeta);
    cloudKitVaultModule.fetchCredentialsAsync.mockResolvedValueOnce(records);

    await migrateVaultBackend({
      fromModule: cloudKitVaultModule,
      toModule: driveVaultModule,
      vaultSecret: VAULT_SECRET,
    });

    expect(driveVaultModule.saveVaultMetaAsync).toHaveBeenCalledWith(rawMeta);
    expect(driveVaultModule.upsertCredentialsAsync).toHaveBeenCalledWith(records);
  });

  it("nao copia nada se a senha atual nao abrir o cofre de origem", async () => {
    const otherMeta = createVaultMeta({ vaultSecret: "outra:senha", email: "outra@email.com" });
    cloudKitVaultModule.fetchVaultMetaAsync.mockResolvedValueOnce({
      email: otherMeta.email,
      salt: otherMeta.kdf.salt,
      iterations: otherMeta.kdf.iterations,
      verifier: otherMeta.verifier,
    });

    await expect(
      migrateVaultBackend({
        fromModule: cloudKitVaultModule,
        toModule: driveVaultModule,
        vaultSecret: VAULT_SECRET,
      }),
    ).rejects.toThrow("Falha de integridade do cofre.");
    expect(driveVaultModule.saveVaultMetaAsync).not.toHaveBeenCalled();
  });
});
