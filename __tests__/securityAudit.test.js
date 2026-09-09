import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

import {
  clearSecurityEvents,
  loadSecurityEvents,
  logSecurityEvent,
  sealSecurityLog,
  verifySecurityLogIntegrity,
} from "../src/services/securityAudit";

jest.mock("@react-native-async-storage/async-storage", () => ({
  setItem: jest.fn(),
  getItem: jest.fn(),
  removeItem: jest.fn(),
}));

jest.mock("expo-secure-store", () => ({
  setItemAsync: jest.fn(),
  getItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

describe("securityAudit service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("registra evento no SecureStore", async () => {
    SecureStore.getItemAsync.mockResolvedValueOnce(null);

    await logSecurityEvent({
      type: "login_success",
      status: "info",
    });

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      "secpass_security_audit",
      expect.any(String),
      expect.any(Object),
    );
  });

  it("carrega eventos do SecureStore", async () => {
    SecureStore.getItemAsync.mockResolvedValueOnce(
      JSON.stringify([{ id: "1", type: "x", status: "info" }]),
    );

    const events = await loadSecurityEvents();

    expect(events).toEqual([{ id: "1", type: "x", status: "info" }]);
  });

  it("retorna lista vazia quando os dados armazenados sao invalidos", async () => {
    SecureStore.getItemAsync.mockResolvedValueOnce("not-json");

    const events = await loadSecurityEvents();

    expect(events).toEqual([]);
  });

  it("migra eventos legados do AsyncStorage para o SecureStore", async () => {
    SecureStore.getItemAsync.mockResolvedValueOnce(null);
    AsyncStorage.getItem.mockResolvedValueOnce(
      JSON.stringify([{ id: "1", type: "login_success", status: "info" }]),
    );
    SecureStore.setItemAsync.mockResolvedValueOnce();

    const events = await loadSecurityEvents();

    expect(events).toEqual([
      { id: "1", type: "login_success", status: "info" },
    ]);
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      "secpass_security_audit",
      expect.any(String),
      expect.any(Object),
    );
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith(
      "secpass_security_audit",
    );
  });

  it("lanca erro quando nao consegue registrar evento com seguranca", async () => {
    SecureStore.getItemAsync.mockResolvedValueOnce(null);
    SecureStore.setItemAsync.mockRejectedValueOnce(new Error("secure-down"));

    await expect(
      logSecurityEvent({ type: "login_failed", status: "warning" }),
    ).rejects.toThrow(
      "Nao foi possivel registrar evento de seguranca em armazenamento protegido.",
    );
  });

  it("limpa eventos de auditoria e o selo de integridade", async () => {
    await clearSecurityEvents();

    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(
      "secpass_security_audit",
      expect.any(Object),
    );
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(
      "secpass_security_audit_seal",
      expect.any(Object),
    );
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith(
      "secpass_security_audit",
    );
  });
});

describe("securityAudit service - selo de integridade", () => {
  // Fake simples de SecureStore, indexado por chave, pra simular a
  // interacao real entre o log (secpass_security_audit) e o selo
  // (secpass_security_audit_seal) atraves de varias chamadas.
  let store;

  beforeEach(() => {
    jest.clearAllMocks();
    store = {};
    SecureStore.getItemAsync.mockImplementation((key) =>
      Promise.resolve(store[key] ?? null),
    );
    SecureStore.setItemAsync.mockImplementation((key, value) => {
      store[key] = value;
      return Promise.resolve();
    });
    AsyncStorage.getItem.mockResolvedValue(null);
  });

  const seedEvents = (events) => {
    store["secpass_security_audit"] = JSON.stringify(events);
  };

  it("verifySecurityLogIntegrity retorna ok quando nada foi selado ainda", async () => {
    seedEvents([{ id: "1", type: "login_success", status: "info" }]);

    await expect(verifySecurityLogIntegrity("user@a.com:Senha!123")).resolves.toBe(
      "ok",
    );
  });

  it("sela e depois confirma integridade quando nada mudou no prefixo selado", async () => {
    seedEvents([
      { id: "2", type: "login_success", status: "info", createdAt: "t2" },
      { id: "1", type: "account_created", status: "info", createdAt: "t1" },
    ]);

    await sealSecurityLog("user@a.com:Senha!123");

    await expect(
      verifySecurityLogIntegrity("user@a.com:Senha!123"),
    ).resolves.toBe("ok");
  });

  it("continua ok quando novos eventos legitimos sao adicionados depois do selo", async () => {
    seedEvents([
      { id: "1", type: "account_created", status: "info", createdAt: "t1" },
    ]);
    await sealSecurityLog("user@a.com:Senha!123");

    // Novo evento e adicionado NA FRENTE (mais-novo-primeiro), o prefixo
    // selado continua intacto no final da lista.
    seedEvents([
      { id: "2", type: "login_success", status: "info", createdAt: "t2" },
      { id: "1", type: "account_created", status: "info", createdAt: "t1" },
    ]);

    await expect(
      verifySecurityLogIntegrity("user@a.com:Senha!123"),
    ).resolves.toBe("ok");
  });

  it("detecta adulteracao de um evento dentro do prefixo ja selado", async () => {
    seedEvents([
      { id: "1", type: "login_failed", status: "warning", createdAt: "t1" },
    ]);
    await sealSecurityLog("user@a.com:Senha!123");

    // Alguem com acesso ao armazenamento reescreve o evento (ex: tenta
    // esconder uma tentativa de login) sem saber a senha mestra.
    seedEvents([
      { id: "1", type: "login_success", status: "info", createdAt: "t1" },
    ]);

    await expect(
      verifySecurityLogIntegrity("user@a.com:Senha!123"),
    ).resolves.toBe("tampered");
  });

  it("fica inconclusive (nao 'ok') quando um evento e apagado e o historico encolhe abaixo do que foi selado", async () => {
    seedEvents([
      { id: "2", type: "login_failed", status: "warning", createdAt: "t2" },
      { id: "1", type: "account_created", status: "info", createdAt: "t1" },
    ]);
    await sealSecurityLog("user@a.com:Senha!123");

    // O evento mais incriminador (login_failed) e apagado - o historico
    // encolhe abaixo da contagem selada, entao nao da pra localizar o
    // mesmo prefixo com seguranca. Critico: isso NUNCA deve virar "ok"
    // silencioso so porque o hash nao pode ser comparado.
    seedEvents([
      { id: "1", type: "account_created", status: "info", createdAt: "t1" },
    ]);

    await expect(
      verifySecurityLogIntegrity("user@a.com:Senha!123"),
    ).resolves.toBe("inconclusive");
  });

  it("fica inconclusive quando um evento do meio e apagado mas novos eventos legitimos mantem o tamanho da lista igual ou maior (desalinha a ancora)", async () => {
    seedEvents([
      { id: "2", type: "login_failed", status: "warning", createdAt: "t2" },
      { id: "1", type: "account_created", status: "info", createdAt: "t1" },
    ]);
    await sealSecurityLog("user@a.com:Senha!123");

    // "1" e apagado (esconde a criacao da conta original), mas dois
    // eventos novos legitimos entram na frente - o tamanho da lista fica
    // maior que a contagem selada, entao so o comprimento nao seria
    // suficiente pra perceber que o prefixo mudou de posicao.
    seedEvents([
      { id: "4", type: "login_success", status: "info", createdAt: "t4" },
      { id: "3", type: "login_success", status: "info", createdAt: "t3" },
      { id: "2", type: "login_failed", status: "warning", createdAt: "t2" },
    ]);

    await expect(
      verifySecurityLogIntegrity("user@a.com:Senha!123"),
    ).resolves.toBe("inconclusive");
  });

  it("nao acusa adulteracao quando o selo nao pode ser confirmado nem desmentido (historico truncado pelo limite)", async () => {
    seedEvents([
      { id: "1", type: "account_created", status: "info", createdAt: "t1" },
    ]);
    await sealSecurityLog("user@a.com:Senha!123");

    // O limite de eventos descartou o que estava selado (cenario raro,
    // mas nao deve soar falso alarme).
    seedEvents([]);

    await expect(
      verifySecurityLogIntegrity("user@a.com:Senha!123"),
    ).resolves.toBe("inconclusive");
  });

  it("um selo assinado com a senha errada nao valida o log de outra conta", async () => {
    seedEvents([
      { id: "1", type: "account_created", status: "info", createdAt: "t1" },
    ]);
    await sealSecurityLog("user@a.com:SenhaCorreta!123");

    await expect(
      verifySecurityLogIntegrity("user@a.com:SenhaErrada!999"),
    ).resolves.toBe("tampered");
  });
});
