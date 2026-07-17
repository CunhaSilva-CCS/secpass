import CryptoJS from "crypto-js";
import * as ExpoCrypto from "expo-crypto";

const VAULT_VERSION = 1;
const PBKDF2_ITERATIONS = 120000;
const KEY_SIZE_WORDS = 512 / 32;

const toWordArray = (bytes) => {
  return bytes.reduce((words, byte, index) => {
    words[index >>> 2] |= byte << (24 - (index % 4) * 8);
    return words;
  }, []);
};

const bytesToHex = (bytes) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

const hexToWordArray = (hex) => CryptoJS.enc.Hex.parse(hex);

const constantTimeCompare = (left, right) => {
  if (!left || !right || left.length !== right.length) {
    return false;
  }

  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return diff === 0;
};

const deriveKeys = ({
  vaultSecret,
  saltHex,
  iterations = PBKDF2_ITERATIONS,
}) => {
  const derived = CryptoJS.PBKDF2(vaultSecret, hexToWordArray(saltHex), {
    keySize: KEY_SIZE_WORDS,
    iterations,
    hasher: CryptoJS.algo.SHA256,
  });

  const derivedHex = derived.toString(CryptoJS.enc.Hex);
  const encKeyHex = derivedHex.slice(0, 64);
  const macKeyHex = derivedHex.slice(64, 128);

  return {
    encKey: hexToWordArray(encKeyHex),
    macKey: hexToWordArray(macKeyHex),
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

  const saltBytes = await ExpoCrypto.getRandomBytesAsync(16);
  const ivBytes = await ExpoCrypto.getRandomBytesAsync(16);
  const saltHex = bytesToHex(saltBytes);
  const ivHex = bytesToHex(ivBytes);

  const { encKey, macKey } = deriveKeys({ vaultSecret, saltHex });

  const encrypted = CryptoJS.AES.encrypt(plaintext, encKey, {
    iv: CryptoJS.lib.WordArray.create(toWordArray(ivBytes), ivBytes.length),
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });

  const ciphertext = encrypted.ciphertext.toString(CryptoJS.enc.Base64);
  const macPayload = `${VAULT_VERSION}:${saltHex}:${ivHex}:${ciphertext}`;
  const mac = CryptoJS.HmacSHA256(macPayload, macKey).toString(
    CryptoJS.enc.Hex,
  );

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
  const computedMac = CryptoJS.HmacSHA256(macPayload, macKey).toString(
    CryptoJS.enc.Hex,
  );

  if (!constantTimeCompare(computedMac, expectedMac)) {
    throw new Error("Falha de integridade do cofre.");
  }

  const decrypted = CryptoJS.AES.decrypt(
    {
      ciphertext: CryptoJS.enc.Base64.parse(ciphertext),
    },
    encKey,
    {
      iv: hexToWordArray(ivHex),
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    },
  );

  const plaintext = decrypted.toString(CryptoJS.enc.Utf8);
  if (!plaintext) {
    throw new Error("Falha ao descriptografar cofre.");
  }

  const parsed = JSON.parse(plaintext);
  return Array.isArray(parsed?.items) ? parsed.items : [];
};
