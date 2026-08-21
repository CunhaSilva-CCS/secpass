import ExpoModulesCore

internal final class InvalidKeyException: Exception {
  override var reason: String {
    "Invalid key"
  }
}

internal final class KeyChainException: GenericException<OSStatus> {
  override var reason: String {
    if let errorMessage = SecCopyErrorMessageString(param, nil) as? String {
      return errorMessage
    }
    return "Keychain operation failed with status \(param)."
  }
}
