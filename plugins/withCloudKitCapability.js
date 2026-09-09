// Injeta o entitlement iCloud/CloudKit no ios/SecPass/SecPass.entitlements
// gerado pelo `expo prebuild` - editar esse arquivo na mao nao sobrevive a
// um `prebuild --clean` (ele e regenerado do zero), por isso um plugin.
//
// So injetar o entitlement NAO ativa o CloudKit sozinho: a flag
// cloudKitEntitlementConfigured em
// modules/secure-vault-cloudkit/ios/SecureVaultCloudKitModule.swift
// continua false ate alguem confirmar manualmente que a capability iCloud
// foi habilitada de verdade no Apple Developer Portal para este App ID e
// que o `prebuild` rodou com este plugin - instanciar CKContainer sem o
// entitlement assinado crasha o processo (ver comentario no Swift).
const { withEntitlementsPlist } = require("@expo/config-plugins");

const CLOUDKIT_CONTAINER_ID = "iCloud.com.cortexistech.secpass";

module.exports = function withCloudKitCapability(config) {
  return withEntitlementsPlist(config, (config) => {
    config.modResults["com.apple.developer.icloud-services"] = ["CloudKit"];
    config.modResults["com.apple.developer.icloud-container-identifiers"] = [
      CLOUDKIT_CONTAINER_ID,
    ];
    return config;
  });
};
