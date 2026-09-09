// Copie este arquivo para cloudkitConfig.js (gitignored) e preencha com os
// valores do seu container no CloudKit Dashboard (icloud.developer.apple.com/dashboard):
// - CLOUDKIT_CONTAINER_ID: mesmo container usado pelo modulo nativo iOS
//   (ver modules/secure-vault-cloudkit/ios/SecureVaultCloudKitModule.swift).
// - CLOUDKIT_API_TOKEN: token PUBLICO de client-side do CloudKit JS
//   (Dashboard -> API Access -> Tokens). Nao e a chave privada
//   server-to-server - esse token e enviado ao browser por design da Apple,
//   mas ainda assim fica fora do controle de versao para facilitar rotacao.
export const CLOUDKIT_CONTAINER_ID = "iCloud.com.cortexistech.secpass";
export const CLOUDKIT_API_TOKEN = "";
export const CLOUDKIT_ENVIRONMENT = "development"; // "development" | "production"
