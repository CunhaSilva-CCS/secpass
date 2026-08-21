import ExpoModulesCore

internal final class CloudKitUnavailableException: Exception {
  override var reason: String {
    "iCloud / CloudKit indisponivel neste aparelho."
  }
}

internal final class CloudKitRecordException: Exception {
  override var reason: String {
    "Falha ao gravar ou ler o cofre no CloudKit."
  }
}
