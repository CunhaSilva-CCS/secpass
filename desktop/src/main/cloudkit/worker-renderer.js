// Roda dentro da janela oculta do CloudKit (worker.html), com acesso ao
// CloudKit JS (carregado via <script> no HTML) e ao DOM real - nenhum dos
// dois existe no processo main (Node puro), por isso essa janela existe.
//
// AVISO: este arquivo implementa o contrato de 6 funcoes (o mesmo que
// modules/secure-vault-cloudkit/src/SecureVaultCloudKitModule.ts no iOS e
// src/services/driveVaultModule.js) contra a API documentada do CloudKit
// JS (setUpAuth/whenUserSignsIn/gotoAuthenticationPage, e as operacoes de
// database fetchRecords/performQuery/saveRecords/deleteRecords). Rodar
// CloudKit JS dentro de uma BrowserWindow do Electron (em vez de uma pagina
// web real) NAO e um cenario documentado oficialmente pela Apple - isto
// precisa ser validado num Mac real antes de confiar no fluxo de sign-in
// (ver checklist no plano). Ajuste esta implementacao conforme o
// comportamento real observado.

const RECORD_TYPE_META = "VaultMeta";
const RECORD_TYPE_CREDENTIAL = "Credential";
const META_RECORD_NAME = "vault-meta";
const BATCH_SIZE = 100;

let container = null;
let privateDB = null;

const statusEl = document.getElementById("status");
const signInButton = document.getElementById("signInButton");

const setStatus = (text) => {
  if (statusEl) statusEl.textContent = text;
};

const ensureContainer = ({ containerId, apiToken, environment }) => {
  if (container) {
    return container;
  }

  window.CloudKit.configure({
    containers: [
      {
        containerIdentifier: containerId,
        apiTokenAuth: { apiToken, persist: true },
        environment: environment || "development",
      },
    ],
  });

  container = window.CloudKit.getDefaultContainer();
  privateDB = container.privateCloudDatabase;
  return container;
};

const metaToFields = (meta) => ({
  email: { value: meta?.email || "" },
  version: { value: Number(meta?.version || meta?.kdf ? 2 : meta?.version || 0) },
  kdfName: { value: meta?.kdfName || meta?.kdf?.name || "" },
  iterations: { value: Number(meta?.iterations || meta?.kdf?.iterations || 0) },
  salt: { value: meta?.salt || meta?.kdf?.salt || "" },
  verifier: { value: meta?.verifier || "" },
});

const fieldsToMeta = (fields) => ({
  email: fields?.email?.value || "",
  version: Number(fields?.version?.value || 0),
  kdfName: fields?.kdfName?.value || "",
  iterations: Number(fields?.iterations?.value || 0),
  salt: fields?.salt?.value || "",
  verifier: fields?.verifier?.value || "",
});

const credentialToFields = (record) => ({
  envelope: { value: record?.envelope || "" },
  updatedAt: { value: Number(record?.updatedAt || 0) },
  tombstone: { value: record?.tombstone ? 1 : 0 },
});

const recordToCredential = (record) => ({
  id: record.recordName,
  envelope: record.fields?.envelope?.value || "",
  updatedAt: Number(record.fields?.updatedAt?.value || 0),
  tombstone: Boolean(record.fields?.tombstone?.value),
});

const isNotFoundError = (err) =>
  err?.ckErrorCode === "NOT_FOUND" ||
  err?.serverErrorCode === "NOT_FOUND" ||
  err?.reason === "record not found";

const chunk = (list, size) => {
  const chunks = [];
  for (let i = 0; i < list.length; i += size) {
    chunks.push(list.slice(i, i + size));
  }
  return chunks;
};

const handlers = {
  configure: async (payload) => {
    ensureContainer(payload);
    setStatus("Conectado ao container CloudKit.");
    return { ok: true };
  },

  // Fluxo interativo de sign-in - so deve ser chamado quando a janela esta
  // visivel (ver cloudKitWindow.js: showSignInWindow). setUpAuth() resolve
  // com a identidade se ja houver sessao valida (silencioso); caso
  // contrario mostra o botao e espera o clique + whenUserSignsIn().
  signIn: async () => {
    const userIdentity = await container.setUpAuth();
    if (userIdentity) {
      setStatus("Ja conectado ao iCloud.");
      return { status: "available" };
    }

    setStatus("Entre com sua conta Apple ID para continuar.");
    signInButton.style.display = "inline-block";

    const signInPromise = container.whenUserSignsIn();
    signInButton.onclick = () => {
      signInButton.disabled = true;
      container.gotoAuthenticationPage();
    };

    try {
      const signedInIdentity = await signInPromise;
      signInButton.style.display = "none";
      setStatus(signedInIdentity ? "Conectado ao iCloud." : "Nao foi possivel entrar.");
      return { status: signedInIdentity ? "available" : "unavailable" };
    } catch {
      signInButton.style.display = "none";
      return { status: "unavailable" };
    }
  },

  getAccountStatusAsync: async () => {
    try {
      const userIdentity = await container.setUpAuth();
      return { status: userIdentity ? "available" : "unavailable" };
    } catch {
      return { status: "unavailable" };
    }
  },

  fetchVaultMetaAsync: async () => {
    try {
      const response = await privateDB.fetchRecords(META_RECORD_NAME);
      const record = response?.records?.[0];
      if (!record || record.recordName !== META_RECORD_NAME) {
        return null;
      }
      return fieldsToMeta(record.fields);
    } catch (err) {
      if (isNotFoundError(err)) {
        return null;
      }
      throw err;
    }
  },

  saveVaultMetaAsync: async (meta) => {
    await privateDB.saveRecords([
      {
        recordType: RECORD_TYPE_META,
        recordName: META_RECORD_NAME,
        fields: metaToFields(meta),
      },
    ]);
    return { ok: true };
  },

  fetchCredentialsAsync: async () => {
    const response = await privateDB.performQuery({ recordType: RECORD_TYPE_CREDENTIAL });
    return (response?.records || []).map(recordToCredential);
  },

  upsertCredentialsAsync: async (records) => {
    const list = Array.isArray(records) ? records : [];
    for (const batch of chunk(list, BATCH_SIZE)) {
      await privateDB.saveRecords(
        batch.map((record) => ({
          recordType: RECORD_TYPE_CREDENTIAL,
          recordName: String(record.id),
          fields: credentialToFields(record),
        })),
      );
    }
    return { ok: true };
  },

  deleteVaultAsync: async () => {
    const response = await privateDB.performQuery({ recordType: RECORD_TYPE_CREDENTIAL });
    const recordNames = [
      META_RECORD_NAME,
      ...(response?.records || []).map((record) => record.recordName),
    ];
    for (const batch of chunk(recordNames, BATCH_SIZE)) {
      await privateDB.deleteRecords(batch);
    }
    return { ok: true };
  },
};

window.cloudkitBridge.onCommand(async ({ requestId, type, payload }) => {
  try {
    const handler = handlers[type];
    if (!handler) {
      throw new Error(`Comando CloudKit desconhecido: ${type}`);
    }
    const result = await handler(payload);
    window.cloudkitBridge.reply(requestId, result, null);
  } catch (err) {
    window.cloudkitBridge.reply(requestId, null, err?.message || String(err));
  }
});
