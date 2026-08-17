import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import QuickCrypto from "react-native-quick-crypto";

import {
  DEVICE_AUTH_NOT_CONFIGURED,
  isDeviceAuthNotConfiguredError,
} from "../utils/secureStoreErrors";

const ACCOUNT_KEY = "secpass_account";
const ACCOUNT_VERSION = 3;
const PBKDF2_ITERATIONS = 310000;
const PBKDF2_KEY_SIZE_WORDS = 256 / 32;
const SECURE_STORE_ERROR = "Falha ao salvar conta no armazenamento seguro.";
const SECURE_STORE_OPTIONS = {
  keychainService: "secpass.account",
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

const parseAccount = (rawValue) => {
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue);
    if (!parsed?.email) {
      return null;
    }

    if (
      parsed.version === ACCOUNT_VERSION &&
      parsed.passwordHash &&
      parsed.salt &&
      parsed.kdf === "pbkdf2"
    ) {
      return {
        email: parsed.email,
        salt: parsed.salt,
        passwordHash: parsed.passwordHash,
        kdf: parsed.kdf,
        iterations: parsed.iterations,
        keySize: parsed.keySize,
        version: ACCOUNT_VERSION,
      };
    }

    if (parsed.passwordHash && parsed.salt) {
      return {
        email: parsed.email,
        salt: parsed.salt,
        passwordHash: parsed.passwordHash,
        version: 2,
      };
    }

    if (parsed.password) {
      return {
        email: parsed.email,
        legacyPassword: parsed.password,
        version: 1,
      };
    }

    return null;
  } catch {
    return null;
  }
};

const createSalt = () => {
  const randomBytes = QuickCrypto.randomBytes(16);
  return Array.from(randomBytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
};

const hashPasswordV2 = (password, salt) => {
  return QuickCrypto.createHash("sha256")
    .update(`${salt}:${password}`)
    .digest("hex");
};

const hashPasswordV3 = (password, salt) => {
  return QuickCrypto.pbkdf2Sync(
    password,
    salt,
    PBKDF2_ITERATIONS,
    PBKDF2_KEY_SIZE_WORDS * 4,
    "sha256",
  ).toString("hex");
};

const writeSecureAccount = async ({
  email,
  salt,
  passwordHash,
  version = ACCOUNT_VERSION,
}) => {
  const isV3 = version === ACCOUNT_VERSION;
  const payload = JSON.stringify({
    email: email.trim().toLowerCase(),
    salt,
    passwordHash,
    version,
    ...(isV3
      ? {
          kdf: "pbkdf2",
          iterations: PBKDF2_ITERATIONS,
          keySize: 256,
        }
      : {}),
  });

  try {
    await SecureStore.setItemAsync(ACCOUNT_KEY, payload, SECURE_STORE_OPTIONS);
    return "secure";
  } catch (err) {
    if (isDeviceAuthNotConfiguredError(err)) {
      throw new Error(DEVICE_AUTH_NOT_CONFIGURED);
    }
    throw new Error(SECURE_STORE_ERROR);
  }
};

const getStoredAccount = async () => {
  try {
    const secureAccount = await SecureStore.getItemAsync(
      ACCOUNT_KEY,
      SECURE_STORE_OPTIONS,
    );
    const parsedSecureAccount = parseAccount(secureAccount);

    if (parsedSecureAccount) {
      return {
        account: parsedSecureAccount,
        source: "secure",
      };
    }
  } catch {
    // Continua com fallback legado quando SecureStore nao estiver disponivel.
  }

  const fallbackAccount = await AsyncStorage.getItem(ACCOUNT_KEY);
  const parsedFallbackAccount = parseAccount(fallbackAccount);

  if (!parsedFallbackAccount) {
    return null;
  }

  return {
    account: parsedFallbackAccount,
    source: "legacy",
  };
};

export const saveLocalAccount = async ({ email, password }) => {
  const salt = createSalt();
  const passwordHash = hashPasswordV3(password, salt);

  const backend = await writeSecureAccount({ email, salt, passwordHash });
  if (backend === "secure") {
    await AsyncStorage.removeItem(ACCOUNT_KEY);
  }
};

export const loadLocalAccount = async () => {
  const storedAccount = await getStoredAccount();
  if (!storedAccount) {
    return null;
  }

  const { account, source } = storedAccount;

  if (account.version === 1) {
    try {
      await saveLocalAccount({
        email: account.email,
        password: account.legacyPassword,
      });
      if (source === "legacy") {
        await AsyncStorage.removeItem(ACCOUNT_KEY);
      }
    } catch {
      // Mantem a conta carregada mesmo sem conseguir concluir migracao.
    }

    return { email: account.email };
  }

  if (source === "legacy") {
    try {
      const backend = await writeSecureAccount({
        email: account.email,
        salt: account.salt,
        passwordHash: account.passwordHash,
        version: account.version,
      });
      if (backend === "secure") {
        await AsyncStorage.removeItem(ACCOUNT_KEY);
      }
    } catch {
      // Mantem leitura legada; migracao sera tentada novamente depois.
    }
  }

  return { email: account.email };
};

export const verifyLocalAccount = async ({ email, password }) => {
  const normalizedEmail = email.trim().toLowerCase();

  const storedAccount = await getStoredAccount();
  if (!storedAccount) {
    return false;
  }

  const { account: parsedSecureAccount } = storedAccount;

  if (parsedSecureAccount.version === 1) {
    if (
      parsedSecureAccount.email === normalizedEmail &&
      parsedSecureAccount.legacyPassword === password
    ) {
      await saveLocalAccount({
        email: parsedSecureAccount.email,
        password: parsedSecureAccount.legacyPassword,
      });
      return true;
    }

    return false;
  }

  if (parsedSecureAccount.email !== normalizedEmail) {
    return false;
  }

  if (parsedSecureAccount.version === 2) {
    const inputHash = hashPasswordV2(password, parsedSecureAccount.salt);
    const isValid = parsedSecureAccount.passwordHash === inputHash;

    if (isValid) {
      try {
        await saveLocalAccount({ email: normalizedEmail, password });
      } catch {
        // Login continua valido mesmo sem concluir promocao para v3.
      }
    }

    return isValid;
  }

  const inputHash = hashPasswordV3(password, parsedSecureAccount.salt);
  return parsedSecureAccount.passwordHash === inputHash;
};

export const deleteLocalAccount = async () => {
  try {
    await SecureStore.deleteItemAsync(ACCOUNT_KEY, SECURE_STORE_OPTIONS);
  } catch {
    // Continua para limpar fallback.
  }

  await AsyncStorage.removeItem(ACCOUNT_KEY);
};
