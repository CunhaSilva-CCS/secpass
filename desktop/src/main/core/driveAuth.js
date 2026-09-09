// Autenticacao Google para o cliente Desktop (fluxo "installed app" via
// loopback HTTP local + PKCE, RFC 8252) - o tipo de cliente OAuth
// recomendado pelo proprio Google para apps desktop, sem os problemas de
// redirect_uri que o tipo "Android" causou (ver historico do projeto).
//
// So o refresh token fica persistido (via secureStore, backend Keychain no
// macOS); o access token fica em memoria e e renovado sob demanda.
import { randomBytes, createHash } from "node:crypto";
import { createServer } from "node:http";
import { shell } from "electron";
import { secureDelete, secureGet, secureSet } from "../secureStore.js";
import { GOOGLE_DESKTOP_CLIENT_ID, GOOGLE_DESKTOP_CLIENT_SECRET } from "../googleConfig.js";

const TOKEN_KEY = "secpass_drive_refresh_token";
const SCOPE = "https://www.googleapis.com/auth/drive.appdata";
const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const SIGN_IN_TIMEOUT_MS = 3 * 60 * 1000;
const EXPIRY_SAFETY_MARGIN_MS = 60_000;

let cachedAccessToken = null; // { token, expiresAt }

const base64url = (buffer) =>
  buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const readRefreshToken = () => secureGet(TOKEN_KEY);
const writeRefreshToken = (token) => secureSet(TOKEN_KEY, token);

export const isDriveSignedIn = async () => Boolean(readRefreshToken());

const waitForAuthorizationCode = (authUrlBuilder, state) =>
  new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);
      fn(value);
    };

    const server = createServer((req, res) => {
      let url;
      try {
        url = new URL(req.url, "http://127.0.0.1");
      } catch {
        res.writeHead(400).end();
        return;
      }

      if (url.pathname !== "/oauth2callback") {
        res.writeHead(404).end();
        return;
      }

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        "<html><body style=\"font-family: -apple-system, sans-serif; padding: 48px; text-align: center;\">" +
          "<h2>Pronto. Pode fechar esta aba e voltar ao SecPass.</h2></body></html>",
      );

      const receivedState = url.searchParams.get("state");
      const receivedCode = url.searchParams.get("code");
      const receivedError = url.searchParams.get("error");

      server.close();

      if (receivedError === "access_denied") {
        finish(resolve, { cancelled: true });
        return;
      }

      if (receivedError || !receivedCode || receivedState !== state) {
        finish(reject, new Error("Falha ao autenticar com o Google."));
        return;
      }

      finish(resolve, { code: receivedCode });
    });

    server.on("error", (err) => finish(reject, err));

    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      const redirectUri = `http://127.0.0.1:${port}/oauth2callback`;
      shell.openExternal(authUrlBuilder(redirectUri).toString());
    });

    const timeoutHandle = setTimeout(() => {
      server.close();
      finish(resolve, { cancelled: true });
    }, SIGN_IN_TIMEOUT_MS);
  });

// Inicia o fluxo interativo (abre o navegador do sistema). So deve ser
// chamado a partir de uma acao explicita do usuario.
export const signInWithGoogleDrive = async () => {
  if (!GOOGLE_DESKTOP_CLIENT_ID || !GOOGLE_DESKTOP_CLIENT_SECRET) {
    throw new Error(
      "Sincronizacao com Google Drive nao configurada neste build (preencha src/main/googleConfig.js).",
    );
  }

  const state = base64url(randomBytes(16));
  const codeVerifier = base64url(randomBytes(32));
  const codeChallenge = base64url(createHash("sha256").update(codeVerifier).digest());

  let redirectUriUsed = "";
  const buildAuthUrl = (redirectUri) => {
    redirectUriUsed = redirectUri;
    const authUrl = new URL(AUTH_ENDPOINT);
    authUrl.searchParams.set("client_id", GOOGLE_DESKTOP_CLIENT_ID);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", SCOPE);
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("prompt", "consent");
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("code_challenge", codeChallenge);
    authUrl.searchParams.set("code_challenge_method", "S256");
    return authUrl;
  };

  const result = await waitForAuthorizationCode(buildAuthUrl, state);
  if (result.cancelled) {
    return { success: false, cancelled: true };
  }

  const tokenResponse = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_DESKTOP_CLIENT_ID,
      client_secret: GOOGLE_DESKTOP_CLIENT_SECRET,
      code: result.code,
      code_verifier: codeVerifier,
      redirect_uri: redirectUriUsed,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenResponse.ok) {
    throw new Error("Falha ao trocar o codigo de autorizacao por um token.");
  }

  const tokenData = await tokenResponse.json();
  if (tokenData.refresh_token) {
    writeRefreshToken(tokenData.refresh_token);
  }

  cachedAccessToken = {
    token: tokenData.access_token,
    expiresAt: Date.now() + (tokenData.expires_in || 0) * 1000,
  };

  return { success: true, cancelled: false };
};

const refreshAccessToken = async (refreshToken) => {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_DESKTOP_CLIENT_ID,
      client_secret: GOOGLE_DESKTOP_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    return null;
  }
  return response.json();
};

// Devolve um access token valido, renovando via refresh token se
// necessario. Retorna null se nunca autenticou ou se a renovacao falhou
// (ex: usuario revogou acesso na conta Google).
export const getValidAccessToken = async () => {
  const refreshToken = readRefreshToken();
  if (!refreshToken) {
    return null;
  }

  if (cachedAccessToken && Date.now() < cachedAccessToken.expiresAt - EXPIRY_SAFETY_MARGIN_MS) {
    return cachedAccessToken.token;
  }

  const refreshed = await refreshAccessToken(refreshToken);
  if (!refreshed?.access_token) {
    return null;
  }

  cachedAccessToken = {
    token: refreshed.access_token,
    expiresAt: Date.now() + (refreshed.expires_in || 0) * 1000,
  };
  return cachedAccessToken.token;
};

export const signOutDrive = async () => {
  secureDelete(TOKEN_KEY);
  cachedAccessToken = null;
};
