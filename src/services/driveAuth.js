// Autenticacao Google (OAuth2 + PKCE) usada so para o escopo
// drive.appdata: o token nunca da acesso ao Drive visivel do usuario, so a
// pasta oculta do proprio app. Tokens ficam no SecureStore, nunca no
// AsyncStorage (mesmo padrao de src/services/account.js).
import * as AuthSession from "expo-auth-session";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "secpass_drive_tokens";
const SECURE_STORE_OPTIONS = {
  keychainService: "secpass.drivesync",
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

const DISCOVERY = {
  authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenEndpoint: "https://oauth2.googleapis.com/token",
  revocationEndpoint: "https://oauth2.googleapis.com/revoke",
};

const SCOPES = ["https://www.googleapis.com/auth/drive.appdata"];

// Expirar a antecipacao evita usar um access token nos seus ultimos
// segundos de vida, o que causaria uma chamada Drive falhar por 401 em vez
// de renovar o token preventivamente.
const EXPIRY_SAFETY_MARGIN_MS = 60_000;

export const getGoogleClientId = () =>
  Constants.expoConfig?.extra?.googleDriveClientId || "";

const readTokens = async () => {
  try {
    const raw = await SecureStore.getItemAsync(TOKEN_KEY, SECURE_STORE_OPTIONS);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const writeTokens = async (tokens) => {
  await SecureStore.setItemAsync(
    TOKEN_KEY,
    JSON.stringify(tokens),
    SECURE_STORE_OPTIONS,
  );
};

const isExpired = (tokens) =>
  !tokens?.expiresAt || Date.now() >= tokens.expiresAt - EXPIRY_SAFETY_MARGIN_MS;

const persistFromTokenResponse = async (tokenResponse) => {
  const tokens = {
    accessToken: tokenResponse.accessToken,
    refreshToken: tokenResponse.refreshToken,
    expiresAt: Date.now() + (tokenResponse.expiresIn || 0) * 1000,
  };
  await writeTokens(tokens);
  return tokens;
};

// Inicia o fluxo interativo (abre o navegador do sistema para login
// Google) e persiste os tokens resultantes. So deve ser chamado a partir de
// uma acao explicita do usuario (botao "Ativar sincronizacao" / "Ja uso o
// SecPass em outro aparelho"), nunca automaticamente no boot do app.
export const signInWithGoogleDrive = async () => {
  const clientId = getGoogleClientId();
  if (!clientId) {
    throw new Error(
      "Sincronizacao com Google Drive nao configurada neste build.",
    );
  }

  const redirectUri = AuthSession.makeRedirectUri({ scheme: "secpass" });
  const request = new AuthSession.AuthRequest({
    clientId,
    scopes: SCOPES,
    redirectUri,
    responseType: AuthSession.ResponseType.Code,
    usePKCE: true,
  });

  const result = await request.promptAsync(DISCOVERY);
  if (result.type !== "success" || !result.params?.code) {
    if (result.type === "cancel" || result.type === "dismiss") {
      return { success: false, cancelled: true };
    }
    throw new Error("Falha ao autenticar com o Google.");
  }

  const tokenResponse = await AuthSession.exchangeCodeAsync(
    {
      clientId,
      code: result.params.code,
      redirectUri,
      extraParams: { code_verifier: request.codeVerifier || "" },
    },
    DISCOVERY,
  );

  await persistFromTokenResponse(tokenResponse);
  return { success: true, cancelled: false };
};

const refreshTokens = async (tokens) => {
  const clientId = getGoogleClientId();
  if (!clientId || !tokens?.refreshToken) {
    return null;
  }

  try {
    const refreshed = await AuthSession.refreshAsync(
      { clientId, refreshToken: tokens.refreshToken },
      DISCOVERY,
    );
    const nextTokens = await persistFromTokenResponse({
      ...refreshed,
      refreshToken: refreshed.refreshToken || tokens.refreshToken,
    });
    return nextTokens;
  } catch {
    return null;
  }
};

// Devolve um access token valido, renovando via refresh token se
// necessario. Retorna null se nunca autenticou ou se o refresh falhou (ex:
// usuario revogou acesso na conta Google) - quem chama trata isso como
// "sync indisponivel", nunca como erro fatal do cofre local.
export const getValidAccessToken = async () => {
  const tokens = await readTokens();
  if (!tokens?.accessToken) {
    return null;
  }

  if (!isExpired(tokens)) {
    return tokens.accessToken;
  }

  const refreshed = await refreshTokens(tokens);
  return refreshed?.accessToken || null;
};

export const isDriveSignedIn = async () => {
  const tokens = await readTokens();
  return Boolean(tokens?.accessToken);
};

export const signOutDrive = async () => {
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY, SECURE_STORE_OPTIONS);
  } catch {
    // Best-effort: pior caso o token fica no SecureStore ate a proxima tentativa.
  }
};
