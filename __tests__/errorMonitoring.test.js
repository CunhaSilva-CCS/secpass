const mockSentryInit = jest.fn();
const mockCaptureException = jest.fn();
const mockWrap = jest.fn((component) => component);

jest.mock("@sentry/react-native", () => ({
  init: (...args) => mockSentryInit(...args),
  captureException: (...args) => mockCaptureException(...args),
  wrap: (...args) => mockWrap(...args),
}));

let mockExtra = {};
jest.mock("expo-constants", () => ({
  get expoConfig() {
    return { extra: mockExtra };
  },
}));

describe("errorMonitoring", () => {
  beforeEach(() => {
    jest.resetModules();
    mockSentryInit.mockClear();
    mockCaptureException.mockClear();
    mockExtra = {};
  });

  it("nao inicializa o Sentry quando nao ha DSN configurado", () => {
    mockExtra = {};
    const { initErrorMonitoring } = require("../src/services/errorMonitoring");

    initErrorMonitoring();

    expect(mockSentryInit).not.toHaveBeenCalled();
  });

  it("inicializa o Sentry com opcoes conservadoras de privacidade quando ha DSN", () => {
    mockExtra = { sentryDsn: "https://key@o1.ingest.sentry.io/1" };
    const { initErrorMonitoring } = require("../src/services/errorMonitoring");

    initErrorMonitoring();

    expect(mockSentryInit).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: "https://key@o1.ingest.sentry.io/1",
        sendDefaultPii: false,
        attachScreenshot: false,
        attachViewHierarchy: false,
        tracesSampleRate: 0,
      }),
    );
  });

  it("nao inicializa o Sentry mais de uma vez", () => {
    mockExtra = { sentryDsn: "https://key@o1.ingest.sentry.io/1" };
    const { initErrorMonitoring } = require("../src/services/errorMonitoring");

    initErrorMonitoring();
    initErrorMonitoring();

    expect(mockSentryInit).toHaveBeenCalledTimes(1);
  });

  it("descarta breadcrumbs de console", () => {
    mockExtra = { sentryDsn: "https://key@o1.ingest.sentry.io/1" };
    const { initErrorMonitoring } = require("../src/services/errorMonitoring");

    initErrorMonitoring();
    const { beforeBreadcrumb } = mockSentryInit.mock.calls[0][0];

    expect(beforeBreadcrumb({ category: "console", message: "oi" })).toBeNull();
    expect(beforeBreadcrumb({ category: "navigation", data: { to: "Home" } })).toEqual({
      category: "navigation",
      data: { to: "Home" },
    });
  });

  it("redige campos sensiveis em breadcrumbs e eventos antes de enviar", () => {
    mockExtra = { sentryDsn: "https://key@o1.ingest.sentry.io/1" };
    const { initErrorMonitoring } = require("../src/services/errorMonitoring");

    initErrorMonitoring();
    const { beforeSend } = mockSentryInit.mock.calls[0][0];

    const scrubbed = beforeSend({
      message: "Falha ao descriptografar",
      extra: {
        vaultSecret: "user@email.com:S3nha!",
        envelope: {
          ciphertext: "abc123",
          authTag: "def456",
          iv: "aa11",
          salt: "bb22",
        },
        itemCount: 3,
      },
    });

    expect(scrubbed.extra.vaultSecret).toBe("[Redacted]");
    expect(scrubbed.extra.envelope.ciphertext).toBe("[Redacted]");
    expect(scrubbed.extra.envelope.authTag).toBe("[Redacted]");
    expect(scrubbed.extra.envelope.salt).toBe("[Redacted]");
    expect(scrubbed.extra.itemCount).toBe(3);
    expect(scrubbed.message).toBe("Falha ao descriptografar");
  });

  it("captureError redige o contexto extra antes de repassar ao Sentry", () => {
    mockExtra = { sentryDsn: "https://key@o1.ingest.sentry.io/1" };
    const { captureError } = require("../src/services/errorMonitoring");
    const error = new Error("falhou");

    captureError(error, { password: "abc", screen: "Home" });

    expect(mockCaptureException).toHaveBeenCalledWith(error, {
      extra: { password: "[Redacted]", screen: "Home" },
    });
  });
});
