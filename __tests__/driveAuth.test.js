const mockHasPlayServices = jest.fn();
const mockSignIn = jest.fn();
const mockSignInSilently = jest.fn();
const mockGetTokens = jest.fn();
const mockHasPreviousSignIn = jest.fn();
const mockSignOut = jest.fn();
const mockConfigure = jest.fn();

jest.mock("@react-native-google-signin/google-signin", () => ({
  GoogleSignin: {
    configure: (...args) => mockConfigure(...args),
    hasPlayServices: (...args) => mockHasPlayServices(...args),
    signIn: (...args) => mockSignIn(...args),
    signInSilently: (...args) => mockSignInSilently(...args),
    getTokens: (...args) => mockGetTokens(...args),
    hasPreviousSignIn: (...args) => mockHasPreviousSignIn(...args),
    signOut: (...args) => mockSignOut(...args),
  },
}));

describe("driveAuth", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockHasPlayServices.mockResolvedValue(true);
    mockHasPreviousSignIn.mockReturnValue(false);
  });

  it("configura o escopo drive.appdata uma unica vez", async () => {
    const { signInWithGoogleDrive } = require("../src/services/driveAuth");
    mockSignIn.mockResolvedValue({ type: "success", data: {} });

    await signInWithGoogleDrive();
    await signInWithGoogleDrive();

    expect(mockConfigure).toHaveBeenCalledTimes(1);
    expect(mockConfigure).toHaveBeenCalledWith(
      expect.objectContaining({
        scopes: ["https://www.googleapis.com/auth/drive.appdata"],
      }),
    );
  });

  it("signInWithGoogleDrive retorna success quando o login da certo", async () => {
    const { signInWithGoogleDrive } = require("../src/services/driveAuth");
    mockSignIn.mockResolvedValueOnce({ type: "success", data: {} });

    await expect(signInWithGoogleDrive()).resolves.toEqual({
      success: true,
      cancelled: false,
    });
    expect(mockHasPlayServices).toHaveBeenCalled();
  });

  it("signInWithGoogleDrive retorna cancelled quando o usuario cancela", async () => {
    const { signInWithGoogleDrive } = require("../src/services/driveAuth");
    mockSignIn.mockResolvedValueOnce({ type: "cancelled", data: null });

    await expect(signInWithGoogleDrive()).resolves.toEqual({
      success: false,
      cancelled: true,
    });
  });

  it("signInWithGoogleDrive lanca erro amigavel em falha nativa", async () => {
    const { signInWithGoogleDrive } = require("../src/services/driveAuth");
    mockSignIn.mockRejectedValueOnce(new Error("PLAY_SERVICES_NOT_AVAILABLE"));

    await expect(signInWithGoogleDrive()).rejects.toThrow(
      "Falha ao autenticar com o Google.",
    );
  });

  it("getValidAccessToken retorna null quando nunca autenticou", async () => {
    const { getValidAccessToken } = require("../src/services/driveAuth");
    mockHasPreviousSignIn.mockReturnValue(false);

    await expect(getValidAccessToken()).resolves.toBeNull();
    expect(mockSignInSilently).not.toHaveBeenCalled();
  });

  it("getValidAccessToken renova a sessao e devolve o access token", async () => {
    const { getValidAccessToken } = require("../src/services/driveAuth");
    mockHasPreviousSignIn.mockReturnValue(true);
    mockSignInSilently.mockResolvedValueOnce({ type: "success", data: {} });
    mockGetTokens.mockResolvedValueOnce({
      accessToken: "access-1",
      idToken: "id-1",
    });

    await expect(getValidAccessToken()).resolves.toBe("access-1");
  });

  it("getValidAccessToken retorna null quando a renovacao falha", async () => {
    const { getValidAccessToken } = require("../src/services/driveAuth");
    mockHasPreviousSignIn.mockReturnValue(true);
    mockSignInSilently.mockRejectedValueOnce(new Error("SIGN_IN_REQUIRED"));

    await expect(getValidAccessToken()).resolves.toBeNull();
  });

  it("isDriveSignedIn reflete hasPreviousSignIn", async () => {
    const { isDriveSignedIn } = require("../src/services/driveAuth");

    mockHasPreviousSignIn.mockReturnValue(false);
    await expect(isDriveSignedIn()).resolves.toBe(false);

    mockHasPreviousSignIn.mockReturnValue(true);
    await expect(isDriveSignedIn()).resolves.toBe(true);
  });

  it("signOutDrive chama GoogleSignin.signOut e absorve erros", async () => {
    const { signOutDrive } = require("../src/services/driveAuth");
    mockSignOut.mockRejectedValueOnce(new Error("network-down"));

    await expect(signOutDrive()).resolves.toBeUndefined();
    expect(mockSignOut).toHaveBeenCalled();
  });
});
