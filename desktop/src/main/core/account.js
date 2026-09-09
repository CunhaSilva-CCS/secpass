// Porta simplificada de src/services/account.js (app mobile): mesma regra
// de hashing (PBKDF2-SHA256, 600k iteracoes) e comparacao em tempo
// constante. Sem os ramos de migracao de contas v1/v2 do mobile (esse app
// desktop e novo, nunca teve uma conta em formato antigo pra migrar).
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { constantTimeCompare } from "./constantTimeCompare.js";
import { secureDelete, secureGet, secureSet } from "../secureStore.js";

const ACCOUNT_KEY = "secpass_account";
const PBKDF2_ITERATIONS = 600000;
const PBKDF2_KEY_SIZE_BYTES = 32;

const DUMMY_SALT = "0123456789abcdef0123456789abcdef";
const DUMMY_HASH = "0".repeat(64);

const createSalt = () => randomBytes(16).toString("hex");

const hashPassword = (password, salt, iterations = PBKDF2_ITERATIONS) =>
  pbkdf2Sync(password, salt, iterations, PBKDF2_KEY_SIZE_BYTES, "sha256").toString("hex");

const parseAccount = (raw) => {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed?.email || !parsed?.passwordHash || !parsed?.salt) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

export const saveLocalAccount = ({ email, password }) => {
  const salt = createSalt();
  const passwordHash = hashPassword(password, salt);
  secureSet(
    ACCOUNT_KEY,
    JSON.stringify({
      email: email.trim().toLowerCase(),
      salt,
      passwordHash,
      iterations: PBKDF2_ITERATIONS,
    }),
  );
};

export const loadLocalAccount = () => {
  const account = parseAccount(secureGet(ACCOUNT_KEY));
  return account ? { email: account.email } : null;
};

export const verifyLocalAccount = ({ email, password }) => {
  const normalizedEmail = (email || "").trim().toLowerCase();
  const account = parseAccount(secureGet(ACCOUNT_KEY));

  const salt = account?.salt || DUMMY_SALT;
  const iterations = Number(account?.iterations) || PBKDF2_ITERATIONS;
  const expectedHash = account?.passwordHash || DUMMY_HASH;

  // Sempre calcula o hash, mesmo sem conta, pra nao vazar por timing se
  // existe conta local ou nao (mesma tecnica do app mobile).
  const inputHash = hashPassword(password || "", salt, iterations);
  const isHashValid = constantTimeCompare(expectedHash, inputHash);
  const isEmailValid = account ? constantTimeCompare(account.email, normalizedEmail) : false;

  return isEmailValid && isHashValid;
};

export const deleteLocalAccount = () => {
  secureDelete(ACCOUNT_KEY);
};
