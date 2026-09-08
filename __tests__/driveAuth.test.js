let mockExtra = {};
jest.mock("expo-constants", () => ({
  get expoConfig() {
    return { extra: mockExtra };
  },
}));

let mockSecureStoreState = {};
jest.mock("expo-secure-store", () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: "WHEN_UNLOCKED_THIS_DEVICE_ONLY",
  setItemAsync: jest.fn((key, value) => {
    mockSecureStoreState[key] = value;
    return Promise.resolve();
  }),
  getItemAsync: jest.fn((key) => Promise.resolve(mockSecureStoreState[key] ?? null)),
  deleteItemAsync: jest.fn((key) => {
    delete mockSecureStoreState[key];
    return Promise.resolve();
  }),
}));

const mockPromptAsync = jest.fn();
const mockExchangeCodeAsync = jest.fn();
const mockRefreshAsync = jest.fn();

jest.mock("expo-auth-session", () => ({
  AuthRequest: jest.fn().mockImplementation(() => ({
    codeVerifier: "verifier-abc",
    promptAsync: mockPromptAsync,
  })),
  makeRedirectUri: jest.fn(() => "secpass://redirect"),
  exchangeCodeAsync: (...args) => mockExchangeCodeAsync(...args),
  refreshAsync: (...args) => mockRefreshAsync(...args),
  ResponseType: { Code: "code" },
}));

describe("driveAuth", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockSecureStoreState = {};
    mockExtra = { googleDriveClientId: "client-123" };
  });

  it("getGoogleClientId le o client id do app config", () => {
    const { getGoogleClientId } = require("../src/services/driveAuth");
    expect(getGoogleClientId()).toBe("client-123");
  });

  it("signInWithGoogleDrive falha se nao houver client id configurado", async () => {
    mockExtra = {};
    const { signInWithGoogleDrive } = require("../src/services/driveAuth");

    await expect(signInWithGoogleDrive()).rejects.toThrow(
      "Sincronizacao com Google Drive nao configurada neste build.",
    );
  });

  it("signInWithGoogleDrive retorna cancelled quando o usuario fecha o navegador", async () => {
    mockPromptAsync.mockResolvedValueOnce({ type: "cancel" });
    const { signInWithGoogleDrive } = require("../src/services/driveAuth");

    await expect(signInWithGoogleDrive()).resolves.toEqual({
      success: false,
      cancelled: true,
    });
    expect(mockExchangeCodeAsync).not.toHaveBeenCalled();
  });

  it("signInWithGoogleDrive troca o code por tokens e persiste no SecureStore", async () => {
    mockPromptAsync.mockResolvedValueOnce({
      type: "success",
      params: { code: "auth-code-1" },
    });
    mockExchangeCodeAsync.mockResolvedValueOnce({
      accessToken: "access-1",
      refreshToken: "refresh-1",
      expiresIn: 3600,
    });
    const SecureStore = require("expo-secure-store");
    const { signInWithGoogleDrive } = require("../src/services/driveAuth");

    await expect(signInWithGoogleDrive()).resolves.toEqual({
      success: true,
      cancelled: false,
    });

    expect(mockExchangeCodeAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: "client-123",
        code: "auth-code-1",
        extraParams: { code_verifier: "verifier-abc" },
      }),
      expect.any(Object),
    );
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      "secpass_drive_tokens",
      expect.any(String),
      expect.objectContaining({ keychainService: "secpass.drivesync" }),
    );
  });

  it("getValidAccessToken retorna null quando nunca autenticou", async () => {
    const { getValidAccessToken } = require("../src/services/driveAuth");
    await expect(getValidAccessToken()).resolves.toBeNull();
  });

  it("getValidAccessToken retorna o token quando ainda esta valido", async () => {
    mockSecureStoreState.secpass_drive_tokens = JSON.stringify({
      accessToken: "access-1",
      refreshToken: "refresh-1",
      expiresAt: Date.now() + 10 * 60 * 1000,
    });
    const { getValidAccessToken } = require("../src/services/driveAuth");

    await expect(getValidAccessToken()).resolves.toBe("access-1");
    expect(mockRefreshAsync).not.toHaveBeenCalled();
  });

  it("getValidAccessToken renova o token quando expirado e persiste o novo", async () => {
    mockSecureStoreState.secpass_drive_tokens = JSON.stringify({
      accessToken: "access-old",
      refreshToken: "refresh-1",
      expiresAt: Date.now() - 1000,
    });
    mockRefreshAsync.mockResolvedValueOnce({
      accessToken: "access-new",
      expiresIn: 3600,
    });
    const { getValidAccessToken } = require("../src/services/driveAuth");

    await expect(getValidAccessToken()).resolves.toBe("access-new");
    expect(mockRefreshAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: "client-123",
        refreshToken: "refresh-1",
      }),
      expect.any(Object),
    );

    const persisted = JSON.parse(mockSecureStoreState.secpass_drive_tokens);
    expect(persisted.accessToken).toBe("access-new");
    expect(persisted.refreshToken).toBe("refresh-1");
  });

  it("getValidAccessToken retorna null quando o refresh falha", async () => {
    mockSecureStoreState.secpass_drive_tokens = JSON.stringify({
      accessToken: "access-old",
      refreshToken: "refresh-1",
      expiresAt: Date.now() - 1000,
    });
    mockRefreshAsync.mockRejectedValueOnce(new Error("revoked"));
    const { getValidAccessToken } = require("../src/services/driveAuth");

    await expect(getValidAccessToken()).resolves.toBeNull();
  });

  it("isDriveSignedIn reflete se ha tokens salvos", async () => {
    const { isDriveSignedIn } = require("../src/services/driveAuth");
    await expect(isDriveSignedIn()).resolves.toBe(false);

    mockSecureStoreState.secpass_drive_tokens = JSON.stringify({
      accessToken: "access-1",
    });
    await expect(isDriveSignedIn()).resolves.toBe(true);
  });

  it("signOutDrive remove os tokens do SecureStore", async () => {
    mockSecureStoreState.secpass_drive_tokens = JSON.stringify({
      accessToken: "access-1",
    });
    const { signOutDrive, isDriveSignedIn } = require("../src/services/driveAuth");

    await signOutDrive();

    await expect(isDriveSignedIn()).resolves.toBe(false);
  });
});
