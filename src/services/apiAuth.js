import { Platform } from "react-native";

const AUTH_MODE = (process.env.EXPO_PUBLIC_AUTH_MODE || "hybrid").toLowerCase();

const createApiError = (message, extra = {}) => {
  const error = new Error(message);
  Object.assign(error, extra);
  return error;
};

const getDefaultApiBaseUrl = () => {
  if (Platform.OS === "android") {
    return "http://10.0.2.2:4000";
  }

  return "http://localhost:4000";
};

const getApiBaseUrl = () => {
  const rawBaseUrl =
    process.env.EXPO_PUBLIC_API_URL?.trim() || getDefaultApiBaseUrl();

  return rawBaseUrl.replace(/\/+$/, "");
};

const requestJson = async (path, { method = "GET", body } = {}) => {
  let response;

  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw createApiError("Falha de conexao com o backend de autenticacao.", {
      kind: "network",
    });
  }

  const rawText = await response.text();
  let parsedBody = null;

  try {
    parsedBody = rawText ? JSON.parse(rawText) : null;
  } catch {
    parsedBody = null;
  }

  if (!response.ok) {
    throw createApiError(parsedBody?.error || "Falha na autenticacao remota.", {
      kind: "http",
      status: response.status,
    });
  }

  return parsedBody;
};

export const isRemoteAuthPreferred = () => AUTH_MODE !== "local";

export const isRemoteAuthRequired = () => AUTH_MODE === "remote";

export const registerRemoteAccount = async ({ email, password }) => {
  return requestJson("/auth/register", {
    method: "POST",
    body: { email, password },
  });
};

export const loginRemoteAccount = async ({ email, password }) => {
  return requestJson("/auth/login", {
    method: "POST",
    body: { email, password },
  });
};

export const logoutRemoteSession = async ({ refreshToken }) => {
  await requestJson("/auth/logout", {
    method: "POST",
    body: { refreshToken },
  });
};

export const requestPasswordResetRemote = async ({ email }) => {
  return requestJson("/auth/forgot-password", {
    method: "POST",
    body: { email },
  });
};

export const resetPasswordRemote = async ({ token, password }) => {
  return requestJson("/auth/reset-password", {
    method: "POST",
    body: { token, password },
  });
};
