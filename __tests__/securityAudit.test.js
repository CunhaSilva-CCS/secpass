import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

import {
  clearSecurityEvents,
  loadSecurityEvents,
  logSecurityEvent,
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

  it("limpa eventos de auditoria", async () => {
    await clearSecurityEvents();

    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(
      "secpass_security_audit",
      expect.any(Object),
    );
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith(
      "secpass_security_audit",
    );
  });
});
