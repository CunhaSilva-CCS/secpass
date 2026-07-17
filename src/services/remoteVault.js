import { Platform } from "react-native";
import { decryptVaultEnvelope, encryptVaultItems } from "./vaultCrypto";

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

const requestVault = async (path, { method = "GET", body, accessToken }) => {
  let response;

  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${accessToken}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error("Falha de conexao com o backend de cofre.");
  }

  const rawText = await response.text();
  let parsedBody = null;

  try {
    parsedBody = rawText ? JSON.parse(rawText) : null;
  } catch {
    parsedBody = null;
  }

  if (!response.ok) {
    throw new Error(parsedBody?.error || "Falha no cofre remoto.");
  }

  return parsedBody;
};

export const loadRemoteVaultItems = async ({ accessToken, vaultSecret }) => {
  const result = await requestVault("/vault/items", {
    method: "GET",
    accessToken,
  });

  if (result?.encryptedVault) {
    if (!vaultSecret) {
      throw new Error("Cofre remoto criptografado. Faca login novamente.");
    }

    return decryptVaultEnvelope(result.encryptedVault, vaultSecret);
  }

  return Array.isArray(result?.items) ? result.items : [];
};

export const saveRemoteVaultItems = async ({
  accessToken,
  items,
  vaultSecret,
}) => {
  const body = vaultSecret
    ? {
        encryptedVault: await encryptVaultItems(items, vaultSecret),
      }
    : { items };

  await requestVault("/vault/items", {
    method: "PUT",
    accessToken,
    body,
  });
};
