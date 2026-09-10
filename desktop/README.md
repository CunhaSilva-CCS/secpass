# SecPass Desktop (macOS e Windows)

Cliente desktop do SecPass (Electron), reaproveitando a mesma lógica de
cofre/criptografia/sync do app mobile (`../src/services`). Mesmo
código-fonte roda em macOS e Windows. Cofre local protegido por senha de
acesso (+ Touch ID no macOS); sincronização opcional via Google Drive
(todas as plataformas) ou iCloud/CloudKit (só macOS, ver abaixo).

## Configurar

```bash
cd desktop
npm install
```

Antes de usar a sincronização com Google Drive, crie um OAuth Client ID
tipo **"Aplicativo para computador"** no mesmo projeto Google Cloud usado
pelo Android (já tem Drive API habilitada e usuários de teste
configurados):

1. [Google Cloud Console](https://console.cloud.google.com) → **Clientes**
   → **Criar credenciais** → **ID do cliente OAuth** → tipo
   **"Aplicativo para computador"**.
2. Copie o **Client ID** e o **Client Secret** gerados.
3. Copie o arquivo de exemplo e preencha com os valores reais (esse
   arquivo fica fora do controle de versão, não é commitado):

```bash
cp src/main/googleConfig.example.js src/main/googleConfig.js
```

```js
export const GOOGLE_DESKTOP_CLIENT_ID = "SEU_CLIENT_ID_AQUI";
export const GOOGLE_DESKTOP_CLIENT_SECRET = "SEU_CLIENT_SECRET_AQUI";
```

Sem isso, o app funciona normalmente 100% local — só o botão de
sincronizar mostra um erro amigável.

### iCloud (CloudKit) - alternativa ao Google Drive para ecossistema Apple

O app deixa escolher, por aparelho, sincronizar via Google Drive (Android +
iPhone + Mac) ou via iCloud (só entre iPhone e Mac). O backend iCloud usa
CloudKit Web Services (a Apple não expõe o framework nativo CloudKit para
apps Electron) - configuração necessária antes de usar:

1. No [CloudKit Dashboard](https://icloud.developer.apple.com/dashboard/),
   confirme o container `iCloud.com.cortexistech.secpass` (mesmo usado pelo
   app iOS) e faça deploy do schema com os record types `VaultMeta` e
   `Credential` (ver `modules/secure-vault-cloudkit/ios/SecureVaultCloudKitModule.swift`
   para os campos exatos) em Development, depois Production.
2. Em **API Access → Tokens**, gere um Web Services API Token (token
   público de client-side, não a chave privada server-to-server).
3. Copie o arquivo de exemplo e preencha:

```bash
cp src/main/cloudkitConfig.example.js src/main/cloudkitConfig.js
```

```js
export const CLOUDKIT_CONTAINER_ID = "iCloud.com.cortexistech.secpass";
export const CLOUDKIT_API_TOKEN = "SEU_TOKEN_AQUI";
export const CLOUDKIT_ENVIRONMENT = "development"; // ou "production"
```

**Importante**: rodar CloudKit JS dentro de uma `BrowserWindow` do Electron
não é um cenário documentado oficialmente pela Apple (a lib foi feita para
páginas web reais). O fluxo de sign-in com Apple ID (botão "Entrar com
Apple ID" numa janela que aparece na primeira vez) precisa ser validado
num Mac real antes de confiar nele em produção - se travar ou o clique não
abrir a página de autenticação, ajuste
`src/main/cloudkit/worker-renderer.js` conforme o comportamento observado.

## Rodar

```bash
npm run dev
```

Abre o app em modo desenvolvimento (janela maximizada). Precisa rodar
direto no terminal do Mac (não funciona a partir de um ambiente sem acesso
à sessão gráfica).

## Empacotar para Windows

```bash
npm run dist:win
```

Gera `release/SecPass Setup x.x.x.exe` (instalador NSIS, arquitetura
**x64** fixada explicitamente em `package.json` — sem isso o
electron-builder assume a arquitetura do host, gerando um instalador
arm64 incompatível com a maioria dos PCs Windows quando compilado num Mac
Apple Silicon). Sem assinatura Authenticode — o Windows SmartScreen pode
avisar "editor desconhecido" na primeira execução.

## Empacotar para macOS (build local, sem assinatura/notarização)

```bash
npm run dist:dmg
```

Gera `release/SecPass-x.x.x-universal.dmg` — binário universal (Intel +
Apple Silicon), roda no seu Mac, mas o Gatekeeper vai avisar
"desenvolvedor não identificado" ao abrir da primeira vez (clique direito
→ Abrir).

O script usa `-c.mac.identity=null` de propósito, pra pular a assinatura
de código completamente (nem ad-hoc). Sem isso, o `electron-builder` tenta
assinar e depois rodar `codesign --verify --deep --strict` no `.app` — e
esse projeto vive numa pasta sincronizada pelo Google Drive, cujo File
Provider marca arquivos com atributos estendidos que o `codesign` rejeita
("resource fork, Finder information, or similar detritus not allowed").
Não remova essa flag do `dist` a menos que o projeto seja movido pra fora
de uma pasta sincronizada.

## Empacotar com assinatura e notarização (distribuição real)

A estrutura já está pronta em `package.json` (`hardenedRuntime`,
`entitlements`/`entitlementsInherit` apontando pra
`build/entitlements.mac.plist`) e em `dist:release` (gera `.dmg` e `.zip`,
não só o `.app` solto) - falta só você fornecer as credenciais reais, que
não podem ficar no repo:

1. **Certificado de assinatura**: um certificado "Developer ID Application"
   válido instalado no Keychain do Mac que for rodar o build (via Xcode ou
   baixado do Apple Developer Portal). O `electron-builder` detecta e usa
   automaticamente um certificado desse tipo já presente no Keychain - não
   precisa configurar nada a mais no `package.json` pra isso. Se preferir
   não depender do Keychain local (ex: rodar isso numa CI), exporte o
   certificado como `.p12` e defina `CSC_LINK` (caminho ou URL do `.p12`)
   e `CSC_KEY_PASSWORD` (senha do arquivo) como variáveis de ambiente.
2. **Notarização**: defina as variáveis de ambiente `APPLE_ID` (seu Apple
   ID), `APPLE_APP_SPECIFIC_PASSWORD` (gerada em
   [appleid.apple.com](https://appleid.apple.com) → Segurança → Senhas de
   app) e `APPLE_TEAM_ID` (`U9U9M3H2AP`, o mesmo do app iOS). O
   `electron-builder` notariza automaticamente quando essas três variáveis
   estão presentes e o build foi assinado com um certificado válido - não
   precisa de script `afterSign` customizado.
3. Rode:

```bash
CSC_LINK=... CSC_KEY_PASSWORD=... \
APPLE_ID=... APPLE_APP_SPECIFIC_PASSWORD=... APPLE_TEAM_ID=U9U9M3H2AP \
npm run dist:release
```

**Não testado nesta sessão** (não há certificado real disponível aqui) -
a primeira vez que isso rodar de verdade, esteja pronto pra ajustar
`entitlements.mac.plist` se a notarização reclamar de alguma permissão
faltando (é comum precisar de 1-2 iterações na primeira notarização de
um app Electron).

## O que ainda falta

- Testar a assinatura/notarização de verdade com um certificado real (ver
  secção acima - a estrutura existe, mas nunca rodou de ponta a ponta).
- Assinatura Authenticode do instalador Windows (`.exe` atual não é
  assinado).
- Exportar/importar backup e histórico de segurança na UI (existem no
  mobile, ainda não portados pro desktop).

Ver seção 12 da [documentação técnica](../docs/SecPass-Documentacao-Tecnica.pdf)
para o checklist completo de prontidão pra produção.
