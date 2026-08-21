import CloudKit
import ExpoModulesCore

// Sync do cofre cifrado via CloudKit private DB da conta iCloud do usuario.
// A Apple ID identifica o dono; a senha do SecPass continua so no aparelho
// (PBKDF2 + AES + HMAC). Este modulo so move ciphertext e metadados de KDF.
public class SecureVaultCloudKitModule: Module {
  private static let containerId = "iCloud.com.cortexistech.secpass"
  private static let metaRecordName = "vault-meta"
  private static let metaRecordType = "VaultMeta"
  private static let credentialRecordType = "Credential"
  private static let batchSize = 200

  public func definition() -> ModuleDefinition {
    Name("SecureVaultCloudKit")

    AsyncFunction("getAccountStatusAsync") { () -> String in
      try await Self.accountStatus()
    }

    AsyncFunction("fetchVaultMetaAsync") { () -> [String: Any]? in
      try await Self.fetchVaultMeta()
    }

    AsyncFunction("saveVaultMetaAsync") { (payload: [String: Any]) in
      try await Self.saveVaultMeta(payload)
    }

    AsyncFunction("fetchCredentialsAsync") { () -> [[String: Any]] in
      try await Self.fetchCredentials()
    }

    AsyncFunction("upsertCredentialsAsync") { (records: [[String: Any]]) in
      try await Self.upsertCredentials(records)
    }

    AsyncFunction("deleteVaultAsync") { () in
      try await Self.deleteVault()
    }
  }

  private static var database: CKDatabase {
    CKContainer(identifier: containerId).privateCloudDatabase
  }

  private static func isCloudKitCapabilityMissing(_ error: Error) -> Bool {
    guard let ckError = error as? CKError else {
      return false
    }

    switch ckError.code {
    case .missingEntitlement, .badContainer:
      return true
    default:
      return false
    }
  }

  private static func accountStatus() async throws -> String {
    let status: CKAccountStatus

    do {
      status = try await CKContainer(identifier: containerId).accountStatus()
    } catch {
      if isCloudKitCapabilityMissing(error) {
        return "unsupported"
      }
      throw error
    }

    switch status {
    case .available:
      return "available"
    case .noAccount:
      return "noAccount"
    case .restricted:
      return "restricted"
    case .temporarilyUnavailable:
      return "temporarilyUnavailable"
    case .couldNotDetermine:
      return "couldNotDetermine"
    @unknown default:
      return "couldNotDetermine"
    }
  }

  private static func requireAvailableAccount() async throws {
    let status = try await accountStatus()
    guard status == "available" else {
      throw CloudKitUnavailableException()
    }
  }

  private static func fetchVaultMeta() async throws -> [String: Any]? {
    try await requireAvailableAccount()
    let recordID = CKRecord.ID(recordName: metaRecordName)

    do {
      let record = try await database.record(for: recordID)
      return metaPayload(from: record)
    } catch let error as CKError where error.code == .unknownItem {
      return nil
    }
  }

  private static func saveVaultMeta(_ payload: [String: Any]) async throws {
    try await requireAvailableAccount()
    let recordID = CKRecord.ID(recordName: metaRecordName)
    let record: CKRecord

    do {
      record = try await database.record(for: recordID)
    } catch let error as CKError where error.code == .unknownItem {
      record = CKRecord(recordType: metaRecordType, recordID: recordID)
    }

    record["email"] = payload["email"] as? String
    record["version"] = Self.intValue(payload["version"], fallback: 1)
    record["kdfName"] = payload["kdfName"] as? String
    record["iterations"] = Self.intValue(payload["iterations"], fallback: 310000)
    record["salt"] = payload["salt"] as? String
    record["verifier"] = payload["verifier"] as? String

    _ = try await database.modifyRecords(
      saving: [record],
      deleting: [],
      savePolicy: .allKeys,
      atomically: false
    )
  }

  private static func fetchCredentials() async throws -> [[String: Any]] {
    try await requireAvailableAccount()
    let records = try await fetchAll(recordType: credentialRecordType)
    return records.compactMap(credentialPayload(from:))
  }

  // Nunca deleta por ausencia: um fetch remoto que falhou por rede (mesmo
  // com accountStatus "available") nao pode ser confundido com uma exclusao
  // real. Toda exclusao e explicita, seja via tombstone (upsert normal com
  // "tombstone": 1, ver src/services/vaultMerge.js) ou via deleteVault()
  // (wipe total, gated por biometria em "Excluir conta e todos os dados").
  private static func upsertCredentials(_ payloads: [[String: Any]]) async throws {
    try await requireAvailableAccount()

    let recordsToSave: [CKRecord] = payloads.compactMap { payload in
      guard let id = payload["id"] as? String, !id.isEmpty else {
        return nil
      }

      let record = CKRecord(
        recordType: credentialRecordType,
        recordID: CKRecord.ID(recordName: id)
      )
      record["envelope"] = payload["envelope"] as? String
      record["updatedAt"] = Self.doubleValue(payload["updatedAt"])
      record["tombstone"] = Self.boolValue(payload["tombstone"]) ? 1 : 0
      return record
    }

    try await modifyInChunks(saving: recordsToSave, deleting: [])
  }

  private static func deleteVault() async throws {
    let status = try await accountStatus()
    guard status == "available" else {
      return
    }

    do {
      let credentials = try await fetchAll(recordType: credentialRecordType)
      let credentialIds = credentials.map(\.recordID)
      if !credentialIds.isEmpty {
        try await modifyInChunks(saving: [], deleting: credentialIds)
      }

      do {
        _ = try await database.deleteRecord(withID: CKRecord.ID(recordName: metaRecordName))
      } catch let error as CKError where error.code == .unknownItem {
        // Cofre remoto ja estava vazio.
      }
    } catch {
      if isCloudKitCapabilityMissing(error) {
        return
      }
      throw error
    }
  }

  private static func fetchAll(recordType: String) async throws -> [CKRecord] {
    var records: [CKRecord] = []
    let query = CKQuery(recordType: recordType, predicate: NSPredicate(value: true))
    var cursor: CKQueryOperation.Cursor?

    repeat {
      let page: (
        matchResults: [CKRecord.ID: Result<CKRecord, Error>],
        queryCursor: CKQueryOperation.Cursor?
      )

      if let cursor {
        page = try await database.records(continuingMatchFrom: cursor)
      } else {
        page = try await database.records(matching: query)
      }

      for (_, result) in page.matchResults {
        if let record = try? result.get() {
          records.append(record)
        }
      }

      cursor = page.queryCursor
    } while cursor != nil

    return records
  }

  private static func modifyInChunks(saving: [CKRecord], deleting: [CKRecord.ID]) async throws {
    var saveOffset = 0
    var deleteOffset = 0

    while saveOffset < saving.count || deleteOffset < deleting.count {
      let saveChunk = Array(saving.dropFirst(saveOffset).prefix(batchSize))
      let deleteChunk = Array(deleting.dropFirst(deleteOffset).prefix(batchSize))
      saveOffset += saveChunk.count
      deleteOffset += deleteChunk.count

      let result = try await database.modifyRecords(
        saving: saveChunk,
        deleting: deleteChunk,
        savePolicy: .allKeys,
        atomically: false
      )

      if result.saveResults.values.contains(where: { $0.isFailure })
        || result.deleteResults.values.contains(where: { $0.isFailure })
      {
        throw CloudKitRecordException()
      }
    }
  }

  private static func intValue(_ value: Any?, fallback: Int) -> Int {
    if let int = value as? Int {
      return int
    }
    if let number = value as? NSNumber {
      return number.intValue
    }
    if let double = value as? Double {
      return Int(double)
    }
    return fallback
  }

  private static func doubleValue(_ value: Any?) -> Double {
    if let double = value as? Double {
      return double
    }
    if let number = value as? NSNumber {
      return number.doubleValue
    }
    if let int = value as? Int {
      return Double(int)
    }
    return 0
  }

  private static func boolValue(_ value: Any?) -> Bool {
    if let bool = value as? Bool {
      return bool
    }
    if let number = value as? NSNumber {
      return number.boolValue
    }
    return false
  }

  private static func metaPayload(from record: CKRecord) -> [String: Any] {
    [
      "type": "vault_meta",
      "version": record["version"] as? Int ?? 1,
      "email": record["email"] as? String ?? "",
      "kdfName": record["kdfName"] as? String ?? "pbkdf2-sha256",
      "iterations": record["iterations"] as? Int ?? 310000,
      "salt": record["salt"] as? String ?? "",
      "verifier": record["verifier"] as? String ?? "",
    ]
  }

  private static func credentialPayload(from record: CKRecord) -> [String: Any]? {
    guard let envelope = record["envelope"] as? String else {
      return nil
    }

    return [
      "id": record.recordID.recordName,
      "envelope": envelope,
      "updatedAt": record["updatedAt"] as? Double ?? 0,
      "tombstone": (record["tombstone"] as? Int ?? 0) == 1,
    ]
  }
}

private extension Result {
  var isFailure: Bool {
    if case .failure = self {
      return true
    }
    return false
  }
}
