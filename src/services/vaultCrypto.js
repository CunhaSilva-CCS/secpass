import { Buffer } from "@craftzdog/react-native-buffer";
import QuickCrypto from "react-native-quick-crypto";

import { constantTimeCompare } from "../utils/constantTimeCompare";

const VAULT_VERSION = 1;
const PBKDF2_ITERATIONS = 310000;
const KEY_SIZE_BYTES = 64;

const bytesToHex = (bytes) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

const hexToBytes = (hex) => {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = parseInt(hex.substr(index * 2, 2), 16);
  }
  return bytes;
};

const deriveKeys = ({
  vaultSecret,
  saltHex,
  iterations = PBKDF2_ITERATIONS,
}) => {
  const derived = QuickCrypto.pbkdf2Sync(
    vaultSecret,
    hexToBytes(saltHex),
    iterations,
    KEY_SIZE_BYTES,
    "sha256",
  );

  return {
    encKey: derived.subarray(0, 32),
    macKey: derived.subarray(32, 64),
  };
};

export const createVaultSecret = ({ email, password }) => {
  const normalizedEmail = email.trim().toLowerCase();
  return `${normalizedEmail}:${password}`;
};

export const encryptVaultItems = async (items, vaultSecret) => {
  if (!vaultSecret) {
    throw new Error("Segredo do cofre ausente.");
  }

  const safeItems = Array.isArray(items) ? items : [];
  const plaintext = JSON.stringify({ items: safeItems });

  const saltBytes = QuickCrypto.randomBytes(16);
  const ivBytes = QuickCrypto.randomBytes(16);
  const saltHex = bytesToHex(saltBytes);
  const ivHex = bytesToHex(ivBytes);

  const { encKey, macKey } = deriveKeys({ vaultSecret, saltHex });

  const cipher = QuickCrypto.createCipheriv("aes-256-cbc", encKey, ivBytes);
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(plaintext, "utf8")),
    cipher.final(),
  ]).toString("base64");

  const macPayload = `${VAULT_VERSION}:${saltHex}:${ivHex}:${ciphertext}`;
  const mac = QuickCrypto.createHmac("sha256", macKey)
    .update(macPayload)
    .digest("hex");

  return {
    type: "encrypted_vault",
    version: VAULT_VERSION,
    alg: "aes-256-cbc+hmac-sha256",
    kdf: {
      name: "pbkdf2-sha256",
      iterations: PBKDF2_ITERATIONS,
      salt: saltHex,
    },
    iv: ivHex,
    ciphertext,
    mac,
  };
};

export const decryptVaultEnvelope = async (envelope, vaultSecret) => {
  if (!vaultSecret) {
    throw new Error("Segredo do cofre ausente.");
  }

  if (!envelope || envelope.type !== "encrypted_vault") {
    throw new Error("Formato de cofre criptografado invalido.");
  }

  const version = Number(envelope.version || 0);
  const saltHex = envelope.kdf?.salt || "";
  const iterations = Number(envelope.kdf?.iterations || 0);
  const ivHex = envelope.iv || "";
  const ciphertext = envelope.ciphertext || "";
  const expectedMac = envelope.mac || "";

  if (!version || !saltHex || !ivHex || !ciphertext || !expectedMac) {
    throw new Error("Payload criptografado incompleto.");
  }

  const { encKey, macKey } = deriveKeys({
    vaultSecret,
    saltHex,
    iterations: iterations || PBKDF2_ITERATIONS,
  });

  const macPayload = `${version}:${saltHex}:${ivHex}:${ciphertext}`;
  const computedMac = QuickCrypto.createHmac("sha256", macKey)
    .update(macPayload)
    .digest("hex");

  if (!constantTimeCompare(computedMac, expectedMac)) {
    throw new Error("Falha de integridade do cofre.");
  }

  let plaintext;
  try {
    const decipher = QuickCrypto.createDecipheriv(
      "aes-256-cbc",
      encKey,
      hexToBytes(ivHex),
    );
    plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("Falha ao descriptografar cofre.");
  }

  if (!plaintext) {
    throw new Error("Falha ao descriptografar cofre.");
  }

  const parsed = JSON.parse(plaintext);
  return Array.isArray(parsed?.items) ? parsed.items : [];
};
