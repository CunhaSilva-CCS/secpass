import driveVaultModule from "../src/services/driveVaultModule";
import { getValidAccessToken } from "../src/services/driveAuth";

jest.mock("../src/services/driveAuth", () => ({
  getValidAccessToken: jest.fn(),
}));

const jsonResponse = (body, ok = true, status = 200) => ({
  ok,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

describe("driveVaultModule", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getValidAccessToken.mockResolvedValue("access-token-123");
    global.fetch = jest.fn();
  });

  it("getAccountStatusAsync retorna available com token valido", async () => {
    await expect(driveVaultModule.getAccountStatusAsync()).resolves.toBe(
      "available",
    );
  });

  it("getAccountStatusAsync retorna unavailable sem token", async () => {
    getValidAccessToken.mockResolvedValueOnce(null);
    await expect(driveVaultModule.getAccountStatusAsync()).resolves.toBe(
      "unavailable",
    );
  });

  it("fetchVaultMetaAsync retorna null quando o arquivo nao existe", async () => {
    global.fetch.mockResolvedValueOnce(jsonResponse({ files: [] }));

    await expect(driveVaultModule.fetchVaultMetaAsync()).resolves.toBeNull();
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch.mock.calls[0][0]).toContain("spaces=appDataFolder");
  });

  it("fetchVaultMetaAsync baixa e faz parse do arquivo quando existe", async () => {
    global.fetch
      .mockResolvedValueOnce(
        jsonResponse({ files: [{ id: "file-1", name: "vault_meta.json" }] }),
      )
      .mockResolvedValueOnce(jsonResponse({ email: "a@b.com", verifier: "v" }));

    const meta = await driveVaultModule.fetchVaultMetaAsync();

    expect(meta).toEqual({ email: "a@b.com", verifier: "v" });
    expect(global.fetch.mock.calls[1][0]).toContain("file-1");
    expect(global.fetch.mock.calls[1][0]).toContain("alt=media");
  });

  it("saveVaultMetaAsync cria arquivo novo (multipart) quando nao existe", async () => {
    global.fetch
      .mockResolvedValueOnce(jsonResponse({ files: [] })) // findFileId
      .mockResolvedValueOnce(jsonResponse({ id: "new-file" })); // create

    await driveVaultModule.saveVaultMetaAsync({ email: "a@b.com" });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    const [createUrl, createOptions] = global.fetch.mock.calls[1];
    expect(createUrl).toContain("uploadType=multipart");
    expect(createOptions.method).toBe("POST");
    expect(createOptions.body).toContain("a@b.com");
  });

  it("saveVaultMetaAsync atualiza (PATCH) quando o arquivo ja existe", async () => {
    global.fetch
      .mockResolvedValueOnce(
        jsonResponse({ files: [{ id: "file-1", name: "vault_meta.json" }] }),
      )
      .mockResolvedValueOnce(jsonResponse({ id: "file-1" }));

    await driveVaultModule.saveVaultMetaAsync({ email: "a@b.com" });

    const [updateUrl, updateOptions] = global.fetch.mock.calls[1];
    expect(updateUrl).toContain("file-1");
    expect(updateOptions.method).toBe("PATCH");
    expect(JSON.parse(updateOptions.body)).toEqual({ email: "a@b.com" });
  });

  it("fetchCredentialsAsync retorna array vazio quando nao ha arquivo", async () => {
    global.fetch.mockResolvedValueOnce(jsonResponse({ files: [] }));

    await expect(driveVaultModule.fetchCredentialsAsync()).resolves.toEqual(
      [],
    );
  });

  it("upsertCredentialsAsync funde com o conteudo remoto existente e regrava o arquivo inteiro", async () => {
    const existing = [
      { id: "1", envelope: "old", updatedAt: 1, tombstone: false },
    ];
    const incoming = [
      { id: "1", envelope: "new", updatedAt: 5, tombstone: false },
      { id: "2", envelope: "brand-new", updatedAt: 2, tombstone: false },
    ];

    global.fetch
      .mockResolvedValueOnce(
        jsonResponse({ files: [{ id: "creds-file", name: "credentials.json" }] }),
      ) // findFileId (fetchCredentialsAsync)
      .mockResolvedValueOnce(jsonResponse(existing)) // download credentials.json
      .mockResolvedValueOnce(
        jsonResponse({ files: [{ id: "creds-file", name: "credentials.json" }] }),
      ) // findFileId (writeJsonFile)
      .mockResolvedValueOnce(jsonResponse({ id: "creds-file" })); // PATCH

    await driveVaultModule.upsertCredentialsAsync(incoming);

    const [, patchOptions] = global.fetch.mock.calls[3];
    const written = JSON.parse(patchOptions.body);
    expect(written).toEqual([
      { id: "1", envelope: "new", updatedAt: 5, tombstone: false },
      { id: "2", envelope: "brand-new", updatedAt: 2, tombstone: false },
    ]);
  });

  it("deleteVaultAsync apaga os dois arquivos quando existem", async () => {
    global.fetch
      .mockResolvedValueOnce(
        jsonResponse({ files: [{ id: "meta-file", name: "vault_meta.json" }] }),
      )
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(
        jsonResponse({ files: [{ id: "creds-file", name: "credentials.json" }] }),
      )
      .mockResolvedValueOnce(jsonResponse({}));

    await driveVaultModule.deleteVaultAsync();

    const deleteCalls = global.fetch.mock.calls.filter(
      ([, options]) => options?.method === "DELETE",
    );
    expect(deleteCalls).toHaveLength(2);
  });

  it("deleteVaultAsync nao chama DELETE quando os arquivos nao existem", async () => {
    global.fetch
      .mockResolvedValueOnce(jsonResponse({ files: [] }))
      .mockResolvedValueOnce(jsonResponse({ files: [] }));

    await driveVaultModule.deleteVaultAsync();

    const deleteCalls = global.fetch.mock.calls.filter(
      ([, options]) => options?.method === "DELETE",
    );
    expect(deleteCalls).toHaveLength(0);
  });

  it("lanca erro quando nao ha access token", async () => {
    getValidAccessToken.mockResolvedValueOnce(null);

    await expect(driveVaultModule.fetchVaultMetaAsync()).rejects.toThrow(
      "Sincronizacao com Google Drive nao autenticada.",
    );
  });

  it("lanca erro quando a resposta do Drive nao e ok", async () => {
    global.fetch.mockResolvedValueOnce(jsonResponse({}, false, 401));

    await expect(driveVaultModule.fetchVaultMetaAsync()).rejects.toThrow(
      "Falha na chamada ao Google Drive (401).",
    );
  });
});
