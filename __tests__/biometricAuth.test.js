import * as LocalAuthentication from "expo-local-authentication";

import { authenticateVaultAccess } from "../src/utils/biometricAuth";

jest.mock("expo-local-authentication", () => ({
  hasHardwareAsync: jest.fn(),
  isEnrolledAsync: jest.fn(),
  authenticateAsync: jest.fn(),
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

  it("solicita autenticacao (Face ID, Touch ID ou senha do sistema) quando disponivel", async () => {
    LocalAuthentication.hasHardwareAsync.mockResolvedValue(true);
    LocalAuthentication.isEnrolledAsync.mockResolvedValue(true);
    LocalAuthentication.authenticateAsync.mockResolvedValue({
      success: true,
    });

    const result = await authenticateVaultAccess();

    expect(LocalAuthentication.authenticateAsync).toHaveBeenCalledWith({
      promptMessage: "Desbloquear cofre de senhas",
      cancelLabel: "Cancelar",
    });
    expect(result).toEqual({ success: true });
  });

  it("repassa falha/cancelamento do authenticateAsync", async () => {
    LocalAuthentication.hasHardwareAsync.mockResolvedValue(true);
    LocalAuthentication.isEnrolledAsync.mockResolvedValue(true);
    LocalAuthentication.authenticateAsync.mockResolvedValue({
      success: false,
      error: "user_cancel",
    });

    const result = await authenticateVaultAccess();

    expect(result).toEqual({ success: false, error: "user_cancel" });
  });
});
