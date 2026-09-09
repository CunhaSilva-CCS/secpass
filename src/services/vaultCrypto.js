import { Buffer } from "@craftzdog/react-native-buffer";
import QuickCrypto from "react-native-quick-crypto";

import { constantTimeCompare } from "../utils/constantTimeCompare";

const VAULT_VERSION = 2;
const LEGACY_VAULT_VERSION = 1;
// v3 do envelope por item (encryptVaultItem/decryptVaultItem, usado so no
// registro remoto de sync): amarra updatedAt/tombstone na AAD do GCM junto
// com id, alem da versao. Sem isso, um backend remoto adulterado (Drive/
// CloudKit comprometido) pode reetiquetar um envelope antigo legitimo com
// um updatedAt forjado no futuro para vencer o merge (mergeVaultItems e
// last-write-wins) e ressuscitar permanentemente um item ja apagado ou
// reverter uma senha ja trocada - o merge nunca decifra nada, so compara
// esse campo em texto claro. Com a revisao amarrada na AAD, adulterar
// updatedAt/tombstone sem a senha mestra invalida o authTag e o item e
// descartado (ver decryptRemoteVaultItems), em vez de aceito com uma
// revisao forjada.
const ITEM_ENVELOPE_VERSION = 3;
// OWASP recomenda >=600k para PBKDF2-HMAC-SHA256 (2023+). So usado para
// novas contas/cofres: cofres existentes continuam com o valor gravado no
// proprio kdf.iterations, lido dinamicamente (nunca forcamos re-derivacao).
const PBKDF2_ITERATIONS = 600000;
// Fallback apenas para ler um envelope v1 legado que (por algum motivo)
// nao tenha "iterations" gravado - todo envelope v1 gerado em producao
// sempre gravou esse campo; isto e so uma rede de seguranca.
const LEGACY_PBKDF2_ITERATIONS = 310000;
const KEY_SIZE_BYTES = 64;
const GCM_NONCE_BYTES = 12;
const MAX_ITEM_FIELD_LENGTH = 4096;

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

  const saltBytes = QuickCrypto.randomBytes(16);
  const saltHex = bytesToHex(saltBytes);
  const { macKey } = deriveKeys({ vaultSecret, saltHex });
  const verifier = QuickCrypto.createHmac("sha256", macKey)
    .update(VERIFIER_PAYLOAD)
    .digest("hex");

  return {
    type: "vault_meta",
    version: VAULT_VERSION,
    email: (email || emailFromVaultSecret(vaultSecret)).trim().toLowerCase(),
    kdf: {
      name: "pbkdf2-sha256",
      iterations: PBKDF2_ITERATIONS,
      salt: saltHex,
    },
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

  const keys = deriveKeys({
    vaultSecret,
    saltHex,
    iterations: iterations || PBKDF2_ITERATIONS,
  });
  const verifier = QuickCrypto.createHmac("sha256", keys.macKey)
    .update(VERIFIER_PAYLOAD)
    .digest("hex");

  if (!constantTimeCompare(verifier, expectedVerifier)) {
    throw new Error("Falha de integridade do cofre.");
  }

  return keys;
};

// v1 (legado): AES-256-CBC + HMAC-SHA256 em encrypt-then-MAC manual.
// Mantido so para DESCRIPTOGRAFAR cofres/backups ja existentes; nada nesse
// codigo volta a cifrar nesse formato.
const decryptVaultItemV1 = (envelope, keys) => {
  const { version, id, ivHex, ciphertext, expectedMac } = envelope;

  const macPayload = `${version}:${id}:${ivHex}:${ciphertext}`;
  const computedMac = QuickCrypto.createHmac("sha256", keys.macKey)
    .update(macPayload)
    .digest("hex");

  if (!constantTimeCompare(computedMac, expectedMac)) {
    throw new Error("Falha de integridade do cofre.");
  }

  try {
    const decipher = QuickCrypto.createDecipheriv(
      "aes-256-cbc",
      keys.encKey,
      hexToBytes(ivHex),
    );
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("Falha ao descriptografar cofre.");
  }
};

// v2 (atual): AES-256-GCM (AEAD). O authTag do GCM ja autentica
// ciphertext+IV+AAD, entao a verificacao de integridade e a propria
// descriptografia: nao ha comparacao manual de MAC.
const decryptVaultItemV2 = (envelope, keys) => {
  const { version, id, ivHex, ciphertext, authTag } = envelope;

  if (!authTag) {
    throw new Error("Payload criptografado incompleto.");
  }

  try {
    const decipher = QuickCrypto.createDecipheriv(
      "aes-256-gcm",
      keys.encKey,
      hexToBytes(ivHex),
    );
    decipher.setAAD(Buffer.from(`${version}:${id}`, "utf8"));
    decipher.setAuthTag(Buffer.from(authTag, "hex"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("Falha de integridade do cofre.");
  }
};

export const encryptVaultItem = (item, keys, revision) => {
  if (!keys?.encKey || !keys?.macKey) {
    throw new Error("Segredo do cofre ausente.");
  }

  const ivBytes = QuickCrypto.randomBytes(GCM_NONCE_BYTES);
  const ivHex = bytesToHex(ivBytes);
  const plaintext = JSON.stringify(item ?? {});
  const id = item?.id || "";
  const revisionAt = Number(revision?.revisionAt || 0);
  const tombstone = Boolean(revision?.tombstone);

  const cipher = QuickCrypto.createCipheriv(
    "aes-256-gcm",
    keys.encKey,
    ivBytes,
  );
  cipher.setAAD(
    Buffer.from(
      `${ITEM_ENVELOPE_VERSION}:${id}:${revisionAt}:${tombstone}`,
      "utf8",
    ),
  );
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(plaintext, "utf8")),
    cipher.final(),
  ]).toString("base64");
  const authTag = cipher.getAuthTag().toString("hex");

  return {
    type: "encrypted_item",
    version: ITEM_ENVELOPE_VERSION,
    id,
    iv: ivHex,
    ciphertext,
    authTag,
  };
};

// v3 (atual, so para o envelope por item de sync remoto): igual ao v2, mas
// a AAD tambem amarra updatedAt/tombstone - ver comentario de
// ITEM_ENVELOPE_VERSION. `revision` precisa vir de fora (do registro
// remoto que acompanha o envelope, nunca de dentro dele) com os MESMOS
// valores usados por quem chamou encryptVaultItem, senao a autenticacao
// falha por design.
const decryptVaultItemV3 = (envelope, keys) => {
  const { version, id, ivHex, ciphertext, authTag, revision } = envelope;

  if (!authTag) {
    throw new Error("Payload criptografado incompleto.");
  }

  const revisionAt = Number(revision?.revisionAt || 0);
  const tombstone = Boolean(revision?.tombstone);

  try {
    const decipher = QuickCrypto.createDecipheriv(
      "aes-256-gcm",
      keys.encKey,
      hexToBytes(ivHex),
    );
    decipher.setAAD(
      Buffer.from(`${version}:${id}:${revisionAt}:${tombstone}`, "utf8"),
    );
    decipher.setAuthTag(Buffer.from(authTag, "hex"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("Falha de integridade do cofre.");
  }
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
    plaintext = decryptVaultItemV1(
      { version, id, ivHex, ciphertext, expectedMac: envelope.mac || "" },
      keys,
    );
  } else if (version >= ITEM_ENVELOPE_VERSION) {
    plaintext = decryptVaultItemV3(
      { version, id, ivHex, ciphertext, authTag: envelope.authTag, revision },
      keys,
    );
  } else {
    plaintext = decryptVaultItemV2(
      { version, id, ivHex, ciphertext, authTag: envelope.authTag },
      keys,
    );
  }

  return JSON.parse(plaintext);
};

export const encryptVaultItems = async (items, vaultSecret) => {
  if (!vaultSecret) {
    throw new Error("Segredo do cofre ausente.");
  }

  const safeItems = Array.isArray(items) ? items : [];
  const plaintext = JSON.stringify({ items: safeItems });

  const saltBytes = QuickCrypto.randomBytes(16);
  const ivBytes = QuickCrypto.randomBytes(GCM_NONCE_BYTES);
  const saltHex = bytesToHex(saltBytes);
  const ivHex = bytesToHex(ivBytes);
  const iterations = PBKDF2_ITERATIONS;

  const { encKey } = deriveKeys({ vaultSecret, saltHex, iterations });

  const cipher = QuickCrypto.createCipheriv("aes-256-gcm", encKey, ivBytes);
  cipher.setAAD(
    Buffer.from(`${VAULT_VERSION}:${saltHex}:${iterations}`, "utf8"),
  );
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(plaintext, "utf8")),
    cipher.final(),
  ]).toString("base64");
  const authTag = cipher.getAuthTag().toString("hex");

  return {
    type: "encrypted_vault",
    version: VAULT_VERSION,
    alg: "aes-256-gcm",
    kdf: {
      name: "pbkdf2-sha256",
      iterations,
      salt: saltHex,
    },
    iv: ivHex,
    ciphertext,
    authTag,
  };
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

    if (
      typeof item.title !== "string" ||
      typeof item.username !== "string" ||
      typeof item.password !== "string" ||
      item.title.length > MAX_ITEM_FIELD_LENGTH ||
      item.username.length > MAX_ITEM_FIELD_LENGTH ||
      item.password.length > MAX_ITEM_FIELD_LENGTH
    ) {
      throw new Error("Item de cofre invalido.");
    }
  }

  return items;
};

// v1 (legado): AES-256-CBC + HMAC-SHA256 sobre o envelope inteiro. Mantido
// so para abrir cofres locais e backups exportados anteriores a esta
// versao; toda escrita nova usa decryptVaultEnvelopeV2 (GCM).
const decryptVaultEnvelopeV1 = ({
  version,
  saltHex,
  iterations,
  ivHex,
  ciphertext,
  expectedMac,
  vaultSecret,
}) => {
  const { encKey, macKey } = deriveKeys({
    vaultSecret,
    saltHex,
    iterations: iterations || LEGACY_PBKDF2_ITERATIONS,
  });

  const macPayload = `${version}:${saltHex}:${ivHex}:${ciphertext}`;
  const computedMac = QuickCrypto.createHmac("sha256", macKey)
    .update(macPayload)
    .digest("hex");

  if (!constantTimeCompare(computedMac, expectedMac)) {
    throw new Error("Falha de integridade do cofre.");
  }

  try {
    const decipher = QuickCrypto.createDecipheriv(
      "aes-256-cbc",
      encKey,
      hexToBytes(ivHex),
    );
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("Falha ao descriptografar cofre.");
  }
};

const decryptVaultEnvelopeV2 = ({
  version,
  saltHex,
  iterations,
  ivHex,
  ciphertext,
  authTag,
  vaultSecret,
}) => {
  const effectiveIterations = iterations || PBKDF2_ITERATIONS;
  const { encKey } = deriveKeys({
    vaultSecret,
    saltHex,
    iterations: effectiveIterations,
  });

  try {
    const decipher = QuickCrypto.createDecipheriv(
      "aes-256-gcm",
      encKey,
      hexToBytes(ivHex),
    );
    decipher.setAAD(
      Buffer.from(`${version}:${saltHex}:${effectiveIterations}`, "utf8"),
    );
    decipher.setAuthTag(Buffer.from(authTag, "hex"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
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
    plaintext = decryptVaultEnvelopeV1({
      version,
      saltHex,
      iterations,
      ivHex,
      ciphertext,
      expectedMac,
      vaultSecret,
    });
  } else {
    const authTag = envelope.authTag || "";
    if (!authTag) {
      throw new Error("Payload criptografado incompleto.");
    }
    plaintext = decryptVaultEnvelopeV2({
      version,
      saltHex,
      iterations,
      ivHex,
      ciphertext,
      authTag,
      vaultSecret,
    });
  }

  if (!plaintext) {
    throw new Error("Falha ao descriptografar cofre.");
  }

  const parsed = JSON.parse(plaintext);
  return validateVaultItems(parsed?.items);
};
