import * as LocalAuthentication from "expo-local-authentication";
import { Platform } from "react-native";

export async function authenticateVaultAccess() {
  if (Platform.OS === "web") {
    return { success: true };
  }

  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  const isEnrolled = await LocalAuthentication.isEnrolledAsync();

  if (!hasHardware || !isEnrolled) {
    return {
      success: false,
      error: "not_available",
    };
  }

  if (Platform.OS === "ios") {
    const supportedTypes =
      await LocalAuthentication.supportedAuthenticationTypesAsync();

    if (
      !supportedTypes.includes(
        LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION,
      )
    ) {
      return {
        success: false,
        error: "not_available",
      };
    }
  }

  return LocalAuthentication.authenticateAsync({
    promptMessage:
      Platform.OS === "ios"
        ? "Desbloquear com Face ID"
        : "Desbloquear cofre de senhas",
    cancelLabel: "Cancelar",
    fallbackLabel: "",
    disableDeviceFallback: true,
  });
}
