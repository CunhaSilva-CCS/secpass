// Implementa o mesmo contrato de driveVaultModule.js/SecureVaultCloudKitModule.ts
// (getAccountStatusAsync/fetchVaultMetaAsync/saveVaultMetaAsync/
// fetchCredentialsAsync/upsertCredentialsAsync/deleteVaultAsync), delegando
// pra janela oculta que roda o CloudKit JS de verdade (ver
// ../cloudkit/cloudKitWindow.js - CloudKit JS precisa de DOM, que nao
// existe no processo main).
import { sendCommand, showSignInWindow } from "../cloudkit/cloudKitWindow.js";

const getAccountStatusAsync = async () => {
  try {
    const result = await sendCommand("getAccountStatusAsync", {});
    return result?.status || "unavailable";
  } catch {
    return "unavailable";
  }
};

const fetchVaultMetaAsync = async () => sendCommand("fetchVaultMetaAsync", {});

const saveVaultMetaAsync = async (meta) => sendCommand("saveVaultMetaAsync", meta);

const fetchCredentialsAsync = async () => sendCommand("fetchCredentialsAsync", {});

const upsertCredentialsAsync = async (records) =>
  sendCommand("upsertCredentialsAsync", records);

const deleteVaultAsync = async () => sendCommand("deleteVaultAsync", {});

// Chamado pelo handler IPC "cloudkit:enableSync" (acao explicita do
// usuario, ver src/main/index.js) - mostra a janela e conduz o sign-in
// interativo com Apple ID.
export const enableCloudKitSync = async () => showSignInWindow();

export default {
  getAccountStatusAsync,
  fetchVaultMetaAsync,
  saveVaultMetaAsync,
  fetchCredentialsAsync,
  upsertCredentialsAsync,
  deleteVaultAsync,
};
