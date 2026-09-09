// Armazenamento local seguro pro Electron, equivalente ao expo-secure-store
// do app mobile: cada chave vira um arquivo cifrado via safeStorage (que no
// macOS usa o Keychain do sistema para proteger a chave de criptografia).
import { app, safeStorage } from "electron";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const secureDir = () => {
  const dir = join(app.getPath("userData"), "secure");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
};

const fileFor = (key) => join(secureDir(), `${key}.bin`);

export const secureGet = (key) => {
  const file = fileFor(key);
  if (!existsSync(file)) {
    return null;
  }

  const raw = readFileSync(file);
  if (!safeStorage.isEncryptionAvailable()) {
    return raw.toString("utf8");
  }

  try {
    return safeStorage.decryptString(raw);
  } catch {
    return null;
  }
};

export const secureSet = (key, value) => {
  // Nunca grava em texto claro silenciosamente: se o Keychain do macOS
  // estiver indisponivel (VM sem Keychain provisionado, conta sem chave de
  // login, Keychain corrompido/bloqueado), isso protegeria a conta local
  // (hash da senha) e o refresh token do Google Drive com nada alem de
  // permissoes de arquivo - recusa a escrita em vez de degradar a
  // seguranca sem avisar ninguem.
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error(
      "Nao foi possivel salvar com seguranca: o Keychain do macOS esta indisponivel neste momento.",
    );
  }

  writeFileSync(fileFor(key), safeStorage.encryptString(value));
};

export const secureDelete = (key) => {
  const file = fileFor(key);
  if (existsSync(file)) {
    unlinkSync(file);
  }
};
