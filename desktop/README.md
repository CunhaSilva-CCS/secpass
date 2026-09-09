# SecPass Desktop (macOS)

Cliente desktop do SecPass (Electron), reaproveitando a mesma lógica de
cofre/criptografia/sync do app mobile (`../src/services`). Cofre local
protegido por senha de acesso + Touch ID; sincronização opcional via Google
Drive (mesmo protocolo do Android).

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

## Empacotar (build local, sem assinatura/notarização)

```bash
npm run dist
```

Gera `release/mac/SecPass.app` — roda no seu Mac, mas o Gatekeeper vai
avisar "desenvolvedor não identificado" ao abrir da primeira vez (clique
direito → Abrir). Assinatura/notarização para distribuir fora do seu Mac
ficam para uma etapa futura.

## O que ainda falta (fora desta primeira entrega)

- Proteção contra captura de tela (sem equivalente direto no macOS).
- Exportar/importar backup e histórico de segurança na UI.
- Assinatura/notarização Apple.
