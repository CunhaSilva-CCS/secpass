// Copia de src/services/driveVaultModule.js (app mobile) - so muda o
// import do driveAuth (fluxo de autenticacao e especifico de cada
// plataforma, o resto - chamadas REST ao Drive e merge - e identico).
import { mergeVaultItems } from "./vaultMerge.js";
import { getValidAccessToken } from "./driveAuth.js";

const DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";

const VAULT_META_FILE = "vault_meta.json";
const CREDENTIALS_FILE = "credentials.json";

const authorizedFetch = async (url, options = {}) => {
  const accessToken = await getValidAccessToken();
  if (!accessToken) {
    throw new Error("Sincronizacao com Google Drive nao autenticada.");
  }

  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Falha na chamada ao Google Drive (${response.status}).`);
  }

  return response;
};

const findFileId = async (name) => {
  const query = encodeURIComponent(`name = '${name}' and trashed = false`);
  const url = `${DRIVE_FILES_URL}?spaces=appDataFolder&q=${query}&fields=files(id,name)`;
  const response = await authorizedFetch(url);
  const data = await response.json();
  return data?.files?.[0]?.id || null;
};

const readJsonFile = async (name) => {
  const fileId = await findFileId(name);
  if (!fileId) {
    return null;
  }

  const response = await authorizedFetch(`${DRIVE_FILES_URL}/${fileId}?alt=media`);
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const createJsonFile = async (name, value) => {
  const boundary = "secpass-vault-sync-boundary";
  const metadata = JSON.stringify({ name, parents: ["appDataFolder"] });
  const body =
    `--${boundary}\r\n` +
    "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
    `${metadata}\r\n` +
    `--${boundary}\r\n` +
    "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
    `${JSON.stringify(value)}\r\n` +
    `--${boundary}--`;

  await authorizedFetch(`${DRIVE_UPLOAD_URL}?uploadType=multipart`, {
    method: "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
};

const updateJsonFile = async (fileId, value) => {
  await authorizedFetch(`${DRIVE_UPLOAD_URL}/${fileId}?uploadType=media`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
  });
};

const writeJsonFile = async (name, value) => {
  const fileId = await findFileId(name);
  if (fileId) {
    await updateJsonFile(fileId, value);
  } else {
    await createJsonFile(name, value);
  }
};

const deleteFileIfExists = async (name) => {
  const fileId = await findFileId(name);
  if (!fileId) {
    return;
  }
  await authorizedFetch(`${DRIVE_FILES_URL}/${fileId}`, { method: "DELETE" });
};

const getAccountStatusAsync = async () => {
  const accessToken = await getValidAccessToken();
  return accessToken ? "available" : "unavailable";
};

const fetchVaultMetaAsync = async () => readJsonFile(VAULT_META_FILE);

const saveVaultMetaAsync = async (meta) => writeJsonFile(VAULT_META_FILE, meta);

const fetchCredentialsAsync = async () => {
  const records = await readJsonFile(CREDENTIALS_FILE);
  return Array.isArray(records) ? records : [];
};

const upsertCredentialsAsync = async (records) => {
  const current = await fetchCredentialsAsync();
  const merged = mergeVaultItems(current, records);
  await writeJsonFile(CREDENTIALS_FILE, merged);
};

const deleteVaultAsync = async () => {
  await deleteFileIfExists(VAULT_META_FILE);
  await deleteFileIfExists(CREDENTIALS_FILE);
};

export default {
  getAccountStatusAsync,
  fetchVaultMetaAsync,
  saveVaultMetaAsync,
  fetchCredentialsAsync,
  upsertCredentialsAsync,
  deleteVaultAsync,
};
