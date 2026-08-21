import ExpoModulesCore
import Security

// Shim mínimo em torno do Security.framework para permitir que UM item do
// Keychain (o cofre cifrado do SecPass) sincronize via iCloud Keychain entre
// os aparelhos do mesmo usuário (iPhone + Mac).
//
// O `expo-secure-store` não expõe `kSecAttrSynchronizable` (o atributo que de
// fato ativa o iCloud Keychain sync num item) — ver
// https://github.com/expo/expo/issues/30794 — então esse módulo local existe
// só para isso, escopado à chave do cofre. Toda a demais lógica de conta,
// bloqueio de login e auditoria continua em `expo-secure-store`, sem sync
// (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`), inalterada.
//
// Itens sincronizáveis não podem usar uma classe de acessibilidade
// "ThisDeviceOnly" — a Apple rejeita a combinação — por isso aqui é sempre
// `kSecAttrAccessibleWhenUnlocked`.
public class SecureVaultSyncModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SecureVaultSync")

    AsyncFunction("setItemAsync") { (key: String, value: String, service: String) in
      try Self.setItem(key: key, value: value, service: service)
    }

    AsyncFunction("getItemAsync") { (key: String, service: String) -> String? in
      try Self.getItem(key: key, service: service)
    }

    AsyncFunction("deleteItemAsync") { (key: String, service: String) in
      try Self.deleteItem(key: key, service: service)
    }
  }

  private static func validate(_ key: String) throws -> String {
    let trimmed = key.trimmingCharacters(in: .whitespaces)
    guard !trimmed.isEmpty else {
      throw InvalidKeyException()
    }
    return key
  }

  private static func baseQuery(key: String, service: String) -> [String: Any] {
    [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: key,
      kSecAttrSynchronizable as String: true,
    ]
  }

  private static func setItem(key: String, value: String, service: String) throws {
    let key = try validate(key)
    let data = Data(value.utf8)

    let updateStatus = SecItemUpdate(
      baseQuery(key: key, service: service) as CFDictionary,
      [kSecValueData as String: data] as CFDictionary
    )

    if updateStatus == errSecSuccess {
      return
    }

    guard updateStatus == errSecItemNotFound else {
      throw KeyChainException(updateStatus)
    }

    var addQuery = baseQuery(key: key, service: service)
    addQuery[kSecValueData as String] = data
    addQuery[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlocked

    let addStatus = SecItemAdd(addQuery as CFDictionary, nil)
    guard addStatus == errSecSuccess else {
      throw KeyChainException(addStatus)
    }
  }

  private static func getItem(key: String, service: String) throws -> String? {
    let key = try validate(key)

    var query = baseQuery(key: key, service: service)
    query[kSecReturnData as String] = true
    query[kSecMatchLimit as String] = kSecMatchLimitOne

    var result: AnyObject?
    let status = SecItemCopyMatching(query as CFDictionary, &result)

    if status == errSecItemNotFound {
      return nil
    }

    guard status == errSecSuccess, let data = result as? Data else {
      throw KeyChainException(status)
    }

    return String(data: data, encoding: .utf8)
  }

  private static func deleteItem(key: String, service: String) throws {
    let key = try validate(key)

    let status = SecItemDelete(baseQuery(key: key, service: service) as CFDictionary)
    guard status == errSecSuccess || status == errSecItemNotFound else {
      throw KeyChainException(status)
    }
  }
}
