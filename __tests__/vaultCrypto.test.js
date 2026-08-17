import {
  createVaultSecret,
  decryptVaultEnvelope,
  encryptVaultItems,
} from "../src/services/vaultCrypto";

jest.mock("expo-crypto", () => ({
  getRandomBytesAsync: jest.fn(),
}));

const expoCrypto = require("expo-crypto");

const sampleItems = [
  { id: "1", title: "GitHub", username: "dev", password: "Secr3t!" },
  { id: "2", title: "Email", username: "user@mail.com", password: "Ou7r@Pass" },
];

const mockRandomBytesSequential = () => {
  let call = 0;
  expoCrypto.getRandomBytesAsync.mockImplementation(async (byteCount) => {
    call += 1;
    return Uint8Array.from(Array(byteCount).fill(call));
  });
};

describe("vaultCrypto", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRandomBytesSequential();
  });

  it("faz o round-trip completo de criptografia e descriptografia", async () => {
    const vaultSecret = createVaultSecret({
      email: "User@Email.com",
      password: "Senha!123",
    });
    const envelope = await encryptVaultItems(sampleItems, vaultSecret);

    expect(envelope.type).toBe("encrypted_vault");
    expect(envelope.version).toBe(1);
    expect(envelope.alg).toBe("aes-256-cbc+hmac-sha256");
    expect(envelope.kdf.name).toBe("pbkdf2-sha256");
    expect(envelope.kdf.iterations).toBe(310000);
    expect(envelope.kdf.salt).toEqual(expect.any(String));
    expect(envelope.iv).toEqual(expect.any(String));
    expect(envelope.ciphertext).toEqual(expect.any(String));
    expect(envelope.mac).toEqual(expect.any(String));

    const decrypted = await decryptVaultEnvelope(envelope, vaultSecret);
    expect(decrypted).toEqual(sampleItems);
  });

  it("normaliza email na criacao do segredo do cofre", () => {
    const secret = createVaultSecret({
      email: "  User@Email.COM  ",
      password: "abc",
    });

    expect(secret).toBe("user@email.com:abc");
  });

  it("trata items nao-array como lista vazia ao criptografar", async () => {
    const vaultSecret = "secret";
    const envelope = await encryptVaultItems(null, vaultSecret);
    const decrypted = await decryptVaultEnvelope(envelope, vaultSecret);

    expect(decrypted).toEqual([]);
  });

  it("gera salt, iv e ciphertext diferentes a cada criptografia", async () => {
    const vaultSecret = "secret";
    const first = await encryptVaultItems(sampleItems, vaultSecret);
    const second = await encryptVaultItems(sampleItems, vaultSecret);

    expect(first.kdf.salt).not.toBe(second.kdf.salt);
    expect(first.iv).not.toBe(second.iv);
    expect(first.ciphertext).not.toBe(second.ciphertext);
    expect(first.mac).not.toBe(second.mac);
  });

  it("rejeita criptografar sem vaultSecret", async () => {
    await expect(encryptVaultItems(sampleItems, "")).rejects.toThrow(
      "Segredo do cofre ausente.",
    );
  });

  it("rejeita descriptografar sem vaultSecret", async () => {
    await expect(
      decryptVaultEnvelope({ type: "encrypted_vault" }, ""),
    ).rejects.toThrow("Segredo do cofre ausente.");
  });

  it("rejeita envelope com tipo invalido", async () => {
    await expect(
      decryptVaultEnvelope({ type: "plain" }, "secret"),
    ).rejects.toThrow("Formato de cofre criptografado invalido.");
  });

  it("rejeita envelope nulo", async () => {
    await expect(decryptVaultEnvelope(null, "secret")).rejects.toThrow(
      "Formato de cofre criptografado invalido.",
    );
  });

  it("rejeita envelope com campos incompletos", async () => {
    await expect(
      decryptVaultEnvelope(
        { type: "encrypted_vault", version: 1, kdf: {} },
        "secret",
      ),
    ).rejects.toThrow("Payload criptografado incompleto.");
  });

  it("descriptografa quando iterations nao esta presente (usa padrao)", async () => {
    const vaultSecret = "secret";
    const envelope = await encryptVaultItems(sampleItems, vaultSecret);
    delete envelope.kdf.iterations;

    const decrypted = await decryptVaultEnvelope(envelope, vaultSecret);
    expect(decrypted).toEqual(sampleItems);
  });

  it("detecta senha/segredo errado como falha de integridade", async () => {
    const envelope = await encryptVaultItems(sampleItems, "senha-certa");

    await expect(
      decryptVaultEnvelope(envelope, "senha-errada"),
    ).rejects.toThrow("Falha de integridade do cofre.");
  });

  it("detecta ciphertext adulterado", async () => {
    const envelope = await encryptVaultItems(sampleItems, "secret");
    const tampered = {
      ...envelope,
      ciphertext: `${envelope.ciphertext.slice(0, -4)}AAAA`,
    };

    await expect(decryptVaultEnvelope(tampered, "secret")).rejects.toThrow(
      "Falha de integridade do cofre.",
    );
  });

  it("detecta iv adulterado", async () => {
    const envelope = await encryptVaultItems(sampleItems, "secret");
    const tampered = { ...envelope, iv: "00".repeat(16) };

    await expect(decryptVaultEnvelope(tampered, "secret")).rejects.toThrow(
      "Falha de integridade do cofre.",
    );
  });

  it("detecta salt adulterado", async () => {
    const envelope = await encryptVaultItems(sampleItems, "secret");
    const tampered = {
      ...envelope,
      kdf: { ...envelope.kdf, salt: "00".repeat(16) },
    };

    await expect(decryptVaultEnvelope(tampered, "secret")).rejects.toThrow(
      "Falha de integridade do cofre.",
    );
  });

  it("detecta mac adulterado", async () => {
    const envelope = await encryptVaultItems(sampleItems, "secret");
    const tampered = { ...envelope, mac: "0".repeat(64) };

    await expect(decryptVaultEnvelope(tampered, "secret")).rejects.toThrow(
      "Falha de integridade do cofre.",
    );
  });

  it("preserva itens com caracteres unicode e especiais", async () => {
    const vaultSecret = "secret";
    const unicodeItems = [
      {
        id: "1",
        title: "Café ☕",
        username: "usuário",
        password: "Sénh@!ñ中文🔒",
      },
    ];

    const envelope = await encryptVaultItems(unicodeItems, vaultSecret);
    const decrypted = await decryptVaultEnvelope(envelope, vaultSecret);

    expect(decrypted).toEqual(unicodeItems);
  });
});
