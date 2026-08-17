import * as LocalAuthentication from "expo-local-authentication";
import { Platform } from "react-native";

import { authenticateVaultAccess } from "../src/utils/biometricAuth";

jest.mock("expo-local-authentication", () => ({
  hasHardwareAsync: jest.fn(),
  isEnrolledAsync: jest.fn(),
  supportedAuthenticationTypesAsync: jest.fn(),
  authenticateAsync: jest.fn(),
  AuthenticationType: {
    FINGERPRINT: 1,
    FACIAL_RECOGNITION: 2,
    IRIS: 3,
  },
}));

describe("biometricAuth", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("retorna not_available quando o dispositivo nao tem hardware biometrico", async () => {
    LocalAuthentication.hasHardwareAsync.mockResolvedValue(false);
    LocalAuthentication.isEnrolledAsync.mockResolvedValue(true);

    const result = await authenticateVaultAccess();

    expect(result).toEqual({ success: false, error: "not_available" });
    expect(LocalAuthentication.authenticateAsync).not.toHaveBeenCalled();
  });

  it("retorna not_available quando nao ha biometria cadastrada", async () => {
    LocalAuthentication.hasHardwareAsync.mockResolvedValue(true);
    LocalAuthentication.isEnrolledAsync.mockResolvedValue(false);

    const result = await authenticateVaultAccess();

    expect(result).toEqual({ success: false, error: "not_available" });
    expect(LocalAuthentication.authenticateAsync).not.toHaveBeenCalled();
  });

  describe("no iOS", () => {
    beforeEach(() => {
      Platform.OS = "ios";
      LocalAuthentication.hasHardwareAsync.mockResolvedValue(true);
      LocalAuthentication.isEnrolledAsync.mockResolvedValue(true);
    });

    it("recusa quando o aparelho nao suporta Face ID", async () => {
      LocalAuthentication.supportedAuthenticationTypesAsync.mockResolvedValue([
        LocalAuthentication.AuthenticationType.FINGERPRINT,
      ]);

      const result = await authenticateVaultAccess();

      expect(result).toEqual({ success: false, error: "not_available" });
      expect(LocalAuthentication.authenticateAsync).not.toHaveBeenCalled();
    });

    it("solicita Face ID quando suportado", async () => {
      LocalAuthentication.supportedAuthenticationTypesAsync.mockResolvedValue([
        LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION,
      ]);
      LocalAuthentication.authenticateAsync.mockResolvedValue({
        success: true,
      });

      const result = await authenticateVaultAccess();

      expect(LocalAuthentication.authenticateAsync).toHaveBeenCalledWith({
        promptMessage: "Desbloquear com Face ID",
        cancelLabel: "Cancelar",
        fallbackLabel: "",
        disableDeviceFallback: true,
      });
      expect(result).toEqual({ success: true });
    });
  });

  describe("no Android", () => {
    beforeEach(() => {
      Platform.OS = "android";
      LocalAuthentication.hasHardwareAsync.mockResolvedValue(true);
      LocalAuthentication.isEnrolledAsync.mockResolvedValue(true);
    });

    it("nao checa tipos suportados e solicita biometria generica", async () => {
      LocalAuthentication.authenticateAsync.mockResolvedValue({
        success: true,
      });

      const result = await authenticateVaultAccess();

      expect(
        LocalAuthentication.supportedAuthenticationTypesAsync,
      ).not.toHaveBeenCalled();
      expect(LocalAuthentication.authenticateAsync).toHaveBeenCalledWith({
        promptMessage: "Desbloquear cofre de senhas",
        cancelLabel: "Cancelar",
        fallbackLabel: "",
        disableDeviceFallback: true,
      });
      expect(result).toEqual({ success: true });
    });

    it("repassa falha/cancelamento do authenticateAsync", async () => {
      LocalAuthentication.authenticateAsync.mockResolvedValue({
        success: false,
        error: "user_cancel",
      });

      const result = await authenticateVaultAccess();

      expect(result).toEqual({ success: false, error: "user_cancel" });
    });
  });
});
