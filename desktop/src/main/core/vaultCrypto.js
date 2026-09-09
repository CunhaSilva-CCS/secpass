// Porta de src/services/vaultCrypto.js (app mobile) para node:crypto.
// Mesma logica, mesmo formato de envelope (PBKDF2-SHA256 + AES-256-GCM) -
// o cofre cifrado e compativel byte-a-byte entre mobile e desktop, so
// troca a implementacao de primitivas criptograficas (react-native-quick-
// crypto -> crypto nativo do Node, que tem a mesma API).
import { createCipheriv, createDecipheriv, createHmac, pbkdf2Sync, randomBytes } from "node:crypto";
import { constantTimeCompare } from "./constantTimeCompare.js";

const VAULT_VERSION = 2;
const LEGACY_VAULT_VERSION = 1;
// v3 do envelope por item (encryptVaultItem/decryptVaultItem, so sync
// remoto): amarra updatedAt/tombstone na AAD do GCM - ver mesmo comentario
// em src/services/vaultCrypto.js (app mobile). Sem isso, um backend remoto
// adulterado pode reetiquetar um envelope antigo com um updatedAt forjado
// para vencer o merge e ressuscitar um item apagado ou reverter uma senha
// ja trocada.
const ITEM_ENVELOPE_VERSION = 3;
const PBKDF2_ITERATIONS = 600000;
const LEGACY_PBKDF2_ITERATIONS = 310000;
const KEY_SIZE_BYTES = 64;
const GCM_NONCE_BYTES = 12;
const MAX_ITEM_FIELD_LENGTH = 4096;

const bytesToHex = (bytes) => Buffer.from(bytes).toString("hex");
const hexToBytes = (hex) => Buffer.from(hex, "hex");

const deriveKeys = ({ vaultSecret, saltHex, iterations = PBKDF2_ITERATIONS }) => {
  const derived = pbkdf2Sync(vaultSecret, hexToBytes(saltHex), iterations, KEY_SIZE_BYTES, "sha256");
  return {
    encKey: derived.subarray(0, 32),
    macKey: derived.subarray(32, 64),
  };
};

export const createVaultSecret = ({ email, password }) => {
  const normalizedEmail = email.trim().toLowerCase();
  return `${normalizedEmail}:${password}`;
};

export const emailFromVaultSecret = (vaultSecret) => {
  if (!vaultSecret || typeof vaultSecret !== "string") {
    return "";
  }
  const separator = vaultSecret.indexOf(":");
  return separator === -1 ? "" : vaultSecret.slice(0, separator);
};

const VERIFIER_PAYLOAD = "secpass-vault-verifier-v1";

export const createVaultMeta = ({ vaultSecret, email }) => {
  if (!vaultSecret) {
    throw new Error("Segredo do cofre ausente.");
  }

  const saltHex = bytesToHex(randomBytes(16));
  const { macKey } = deriveKeys({ vaultSecret, saltHex });
  const verifier = createHmac("sha256", macKey).update(VERIFIER_PAYLOAD).digest("hex");

  return {
    type: "vault_meta",
    version: VAULT_VERSION,
    email: (email || emailFromVaultSecret(vaultSecret)).trim().toLowerCase(),
    kdf: { name: "pbkdf2-sha256", iterations: PBKDF2_ITERATIONS, salt: saltHex },
    verifier,
  };
};

export const unlockVaultKeys = (meta, vaultSecret) => {
  if (!vaultSecret) {
    throw new Error("Segredo do cofre ausente.");
  }

  const saltHex = meta?.kdf?.salt || meta?.salt || "";
  const iterations = Number(meta?.kdf?.iterations || meta?.iterations || 0);
  const expectedVerifier = meta?.verifier || "";

  if (!saltHex || !expectedVerifier) {
    throw new Error("Metadados do cofre invalidos.");
  }

  const keys = deriveKeys({ vaultSecret, saltHex, iterations: iterations || PBKDF2_ITERATIONS });
  const verifier = createHmac("sha256", keys.macKey).update(VERIFIER_PAYLOAD).digest("hex");

  if (!constantTimeCompare(verifier, expectedVerifier)) {
    throw new Error("Falha de integridade do cofre.");
  }

  return keys;
};

const decryptVaultItemV1 = (envelope, keys) => {
  const { version, id, ivHex, ciphertext, expectedMac } = envelope;
  const macPayload = `${version}:${id}:${ivHex}:${ciphertext}`;
  const computedMac = createHmac("sha256", keys.macKey).update(macPayload).digest("hex");

  if (!constantTimeCompare(computedMac, expectedMac)) {
    throw new Error("Falha de integridade do cofre.");
  }

  try {
    const decipher = createDecipheriv("aes-256-cbc", keys.encKey, hexToBytes(ivHex));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64")), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("Falha ao descriptografar cofre.");
  }
};

const decryptVaultItemV2 = (envelope, keys) => {
  const { version, id, ivHex, ciphertext, authTag } = envelope;
  if (!authTag) {
    throw new Error("Payload criptografado incompleto.");
  }

  try {
    const decipher = createDecipheriv("aes-256-gcm", keys.encKey, hexToBytes(ivHex));
    decipher.setAAD(Buffer.from(`${version}:${id}`, "utf8"));
    decipher.setAuthTag(Buffer.from(authTag, "hex"));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64")), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("Falha de integridade do cofre.");
  }
};

const decryptVaultItemV3 = (envelope, keys) => {
  const { version, id, ivHex, ciphertext, authTag, revision } = envelope;
  if (!authTag) {
    throw new Error("Payload criptografado incompleto.");
  }

  const revisionAt = Number(revision?.revisionAt || 0);
  const tombstone = Boolean(revision?.tombstone);

  try {
    const decipher = createDecipheriv("aes-256-gcm", keys.encKey, hexToBytes(ivHex));
    decipher.setAAD(Buffer.from(`${version}:${id}:${revisionAt}:${tombstone}`, "utf8"));
    decipher.setAuthTag(Buffer.from(authTag, "hex"));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64")), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("Falha de integridade do cofre.");
  }
};

export const encryptVaultItem = (item, keys, revision) => {
  if (!keys?.encKey || !keys?.macKey) {
    throw new Error("Segredo do cofre ausente.");
  }

  const ivBytes = randomBytes(GCM_NONCE_BYTES);
  const ivHex = bytesToHex(ivBytes);
  const plaintext = JSON.stringify(item ?? {});
  const id = item?.id || "";
  const revisionAt = Number(revision?.revisionAt || 0);
  const tombstone = Boolean(revision?.tombstone);

  const cipher = createCipheriv("aes-256-gcm", keys.encKey, ivBytes);
  cipher.setAAD(Buffer.from(`${ITEM_ENVELOPE_VERSION}:${id}:${revisionAt}:${tombstone}`, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(plaintext, "utf8")), cipher.final()]).toString("base64");
  const authTag = cipher.getAuthTag().toString("hex");

  return { type: "encrypted_item", version: ITEM_ENVELOPE_VERSION, id, iv: ivHex, ciphertext, authTag };
};

export const decryptVaultItem = (envelope, keys, revision) => {
  if (!keys?.encKey || !keys?.macKey) {
    throw new Error("Segredo do cofre ausente.");
  }

  if (!envelope || envelope.type !== "encrypted_item") {
    throw new Error("Formato de cofre criptografado invalido.");
  }

  const version = Number(envelope.version || 0);
  const id = envelope.id || "";
  const ivHex = envelope.iv || "";
  const ciphertext = envelope.ciphertext || "";

  if (!version || !ivHex || !ciphertext) {
    throw new Error("Payload criptografado incompleto.");
  }

  let plaintext;
  if (version === LEGACY_VAULT_VERSION) {
    plaintext = decryptVaultItemV1({ version, id, ivHex, ciphertext, expectedMac: envelope.mac || "" }, keys);
  } else if (version >= ITEM_ENVELOPE_VERSION) {
    plaintext = decryptVaultItemV3({ version, id, ivHex, ciphertext, authTag: envelope.authTag, revision }, keys);
  } else {
    plaintext = decryptVaultItemV2({ version, id, ivHex, ciphertext, authTag: envelope.authTag }, keys);
  }

  return JSON.parse(plaintext);
};

export const encryptVaultItems = async (items, vaultSecret) => {
  if (!vaultSecret) {
    throw new Error("Segredo do cofre ausente.");
  }

  const safeItems = Array.isArray(items) ? items : [];
  const plaintext = JSON.stringify({ items: safeItems });

  const saltHex = bytesToHex(randomBytes(16));
  const ivBytes = randomBytes(GCM_NONCE_BYTES);
  const ivHex = bytesToHex(ivBytes);
  const iterations = PBKDF2_ITERATIONS;

  const { encKey } = deriveKeys({ vaultSecret, saltHex, iterations });

  const cipher = createCipheriv("aes-256-gcm", encKey, ivBytes);
  cipher.setAAD(Buffer.from(`${VAULT_VERSION}:${saltHex}:${iterations}`, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(plaintext, "utf8")), cipher.final()]).toString("base64");
  const authTag = cipher.getAuthTag().toString("hex");

  return {
    type: "encrypted_vault",
    version: VAULT_VERSION,
    alg: "aes-256-gcm",
    kdf: { name: "pbkdf2-sha256", iterations, salt: saltHex },
    iv: ivHex,
    ciphertext,
    authTag,
  };
};

// Exportado pra ser chamado tambem no momento de escrita (vault:add/
// vault:update em main/index.js), nao so na releitura - um item invalido
// gravado hoje (ex: renderer comprometido chamando addItem(123, {}, null)
// via DevTools) so seria pego depois, no proximo load, e a checagem de
// validateVaultItems e tudo-ou-nada: um item invalido derruba a leitura do
// cofre inteiro. Rejeitar na escrita evita que um item ruim chegue a
// existir no cofre.
export const validateCredentialFields = ({ title, username, password }) => {
  if (
    typeof title !== "string" ||
    typeof username !== "string" ||
    typeof password !== "string" ||
    title.length > MAX_ITEM_FIELD_LENGTH ||
    username.length > MAX_ITEM_FIELD_LENGTH ||
    password.length > MAX_ITEM_FIELD_LENGTH
  ) {
    throw new Error("Credencial invalida.");
  }
};

const validateVaultItems = (items) => {
  if (!Array.isArray(items)) {
    throw new Error("Formato de cofre invalido.");
  }

  for (const item of items) {
    if (!item || typeof item !== "object" || typeof item.id !== "string") {
      throw new Error("Item de cofre invalido.");
    }

    if (item.id.length === 0 || item.id.length > MAX_ITEM_FIELD_LENGTH) {
      throw new Error("Item de cofre invalido.");
    }

    if (item.tombstone) {
      if (!Number.isFinite(Number(item.deletedAt))) {
        throw new Error("Item de cofre invalido.");
      }
      continue;
    }

    try {
      validateCredentialFields(item);
    } catch {
      throw new Error("Item de cofre invalido.");
    }
  }

  return items;
};

const decryptVaultEnvelopeV1 = ({ version, saltHex, iterations, ivHex, ciphertext, expectedMac, vaultSecret }) => {
  const { encKey, macKey } = deriveKeys({ vaultSecret, saltHex, iterations: iterations || LEGACY_PBKDF2_ITERATIONS });
  const macPayload = `${version}:${saltHex}:${ivHex}:${ciphertext}`;
  const computedMac = createHmac("sha256", macKey).update(macPayload).digest("hex");

  if (!constantTimeCompare(computedMac, expectedMac)) {
    throw new Error("Falha de integridade do cofre.");
  }

  try {
    const decipher = createDecipheriv("aes-256-cbc", encKey, hexToBytes(ivHex));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64")), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("Falha ao descriptografar cofre.");
  }
};

const decryptVaultEnvelopeV2 = ({ version, saltHex, iterations, ivHex, ciphertext, authTag, vaultSecret }) => {
  const effectiveIterations = iterations || PBKDF2_ITERATIONS;
  const { encKey } = deriveKeys({ vaultSecret, saltHex, iterations: effectiveIterations });

  try {
    const decipher = createDecipheriv("aes-256-gcm", encKey, hexToBytes(ivHex));
    decipher.setAAD(Buffer.from(`${version}:${saltHex}:${effectiveIterations}`, "utf8"));
    decipher.setAuthTag(Buffer.from(authTag, "hex"));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64")), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("Falha de integridade do cofre.");
  }
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

  if (!version || !saltHex || !ivHex || !ciphertext) {
    throw new Error("Payload criptografado incompleto.");
  }

  let plaintext;
  if (version === LEGACY_VAULT_VERSION) {
    const expectedMac = envelope.mac || "";
    if (!expectedMac) {
      throw new Error("Payload criptografado incompleto.");
    }
    plaintext = decryptVaultEnvelopeV1({ version, saltHex, iterations, ivHex, ciphertext, expectedMac, vaultSecret });
  } else {
    const authTag = envelope.authTag || "";
    if (!authTag) {
      throw new Error("Payload criptografado incompleto.");
    }
    plaintext = decryptVaultEnvelopeV2({ version, saltHex, iterations, ivHex, ciphertext, authTag, vaultSecret });
  }

  if (!plaintext) {
    throw new Error("Falha ao descriptografar cofre.");
  }

  const parsed = JSON.parse(plaintext);
  return validateVaultItems(parsed?.items);
};
