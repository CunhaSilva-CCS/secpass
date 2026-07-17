import AsyncStorage from "@react-native-async-storage/async-storage";
import CryptoJS from "crypto-js";
import * as ExpoCrypto from "expo-crypto";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const ACCOUNT_KEY = "secpass_account";
const ACCOUNT_VERSION = 3;
const PBKDF2_ITERATIONS = 120000;
const PBKDF2_KEY_SIZE_WORDS = 256 / 32;
const SECURE_STORE_ERROR = "Falha ao salvar conta no armazenamento seguro.";
const IS_WEB = Platform.OS === "web";

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

const createSalt = async () => {
  const randomBytes = await ExpoCrypto.getRandomBytesAsync(16);
  return Array.from(randomBytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
};

const hashPasswordV2 = async (password, salt) => {
  return ExpoCrypto.digestStringAsync(
    ExpoCrypto.CryptoDigestAlgorithm.SHA256,
    `${salt}:${password}`,
  );
};

const hashPasswordV3 = (password, salt) => {
  return CryptoJS.PBKDF2(password, salt, {
    keySize: PBKDF2_KEY_SIZE_WORDS,
    iterations: PBKDF2_ITERATIONS,
    hasher: CryptoJS.algo.SHA256,
  }).toString(CryptoJS.enc.Hex);
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
    await SecureStore.setItemAsync(ACCOUNT_KEY, payload);
    return "secure";
  } catch {
    if (IS_WEB) {
      await AsyncStorage.setItem(ACCOUNT_KEY, payload);
      return "legacy";
    }

    throw new Error(SECURE_STORE_ERROR);
  }
};

const getStoredAccount = async () => {
  try {
    const secureAccount = await SecureStore.getItemAsync(ACCOUNT_KEY);
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
  const salt = await createSalt();
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
    const inputHash = await hashPasswordV2(password, parsedSecureAccount.salt);
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
