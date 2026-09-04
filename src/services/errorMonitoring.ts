import Constants from "expo-constants";
import * as Sentry from "@sentry/react-native";

// Nomes de campo que nunca podem sair do aparelho, mesmo em relatorio de
// erro: alem dos obvios (senha, segredo do cofre), cobre os campos internos
// dos envelopes cifrados (src/services/vaultCrypto.js) - ciphertext/iv/salt
// isolados nao expoem a senha, mas nao ha motivo pra um servico externo ver
// nem isso.
const SENSITIVE_KEY_PATTERN =
  /password|senha|secret|segredo|token|ciphertext|authtag|iv|salt|verifier|passwordhash/i;

const scrubValue = (value: unknown, seen: WeakSet<object>): unknown => {
  if (Array.isArray(value)) {
    return value.map((entry) => scrubValue(entry, seen));
  }

  if (value && typeof value === "object") {
    if (seen.has(value)) {
      return "[Circular]";
    }
    seen.add(value);

    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      result[key] = SENSITIVE_KEY_PATTERN.test(key)
        ? "[Redacted]"
        : scrubValue(entry, seen);
    }
    return result;
  }

  return value;
};

const scrubEvent = <T,>(event: T): T => scrubValue(event, new WeakSet()) as T;

let initialized = false;

export const initErrorMonitoring = () => {
  if (initialized) {
    return;
  }

  const dsn = Constants.expoConfig?.extra?.sentryDsn;
  if (!dsn || typeof dsn !== "string") {
    return;
  }

  Sentry.init({
    dsn,
    // Nenhum PII automatico (IP, usuario do sistema, etc.) e nenhuma
    // captura de tela/hierarquia de views - isso e um cofre de senhas,
    // a tela pode ter credenciais visiveis no momento do erro.
    sendDefaultPii: false,
    attachScreenshot: false,
    attachViewHierarchy: false,
    // Sem session replay: gravaria a tela, incluindo campos de senha.
    // Sem tracing de performance por enquanto para minimizar o volume de
    // dados enviado; da pra ligar depois se fizer falta.
    tracesSampleRate: 0,
    maxBreadcrumbs: 30,
    beforeBreadcrumb: (breadcrumb) => {
      if (breadcrumb.category === "console") {
        return null;
      }
      return scrubEvent(breadcrumb);
    },
    beforeSend: (event) => scrubEvent(event),
  });

  initialized = true;
};

export const captureError = (error: unknown, context?: Record<string, unknown>) => {
  Sentry.captureException(error, context ? { extra: scrubEvent(context) } : undefined);
};

export const wrapRootComponent = Sentry.wrap;
