# SecPass

![CI](https://github.com/CunhaSilva-CCS/secpass/actions/workflows/ci.yml/badge.svg)

Aplicativo mobile de gerenciamento de senhas (iOS/Android) com cofre local criptografado no dispositivo.

## Escopo Atual (Mobile-Only)

- Plataforma: iOS e Android (Expo/React Native).
- Armazenamento: local no celular, com `expo-secure-store` e autenticação do aparelho.
- Cofre: payload criptografado (`encrypted_vault`) com PBKDF2 + AES-256-GCM (AEAD).
- Bloqueio: sem seletor de segundos; o bloqueio ocorre pelo ciclo nativo do app (background/foreground) e desbloqueio biométrico.
- Sem dependência de backend para login/cofre no fluxo principal.

## Segurança Aplicada

- Dados protegidos em `SecureStore` (Keychain/Keystore), acessíveis apenas
  com o aparelho desbloqueado (`keychainAccessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY`).
  O acesso ao conteúdo sensível (abrir o cofre, revelar/copiar/editar uma
  senha, excluir a conta) é gated por um único ponto de autenticação
  explícito no app (Face ID, Touch ID ou senha do aparelho), em vez de pedir
  autenticação do sistema a cada leitura/escrita interna do Keychain.
- Criptografia consolidada em uma única lib nativa (`react-native-quick-crypto`):
  PBKDF2, AES-256-GCM, SHA-256 e geração de bytes aleatórios (CSPRNG) usam
  todos o mesmo módulo, substituindo `crypto-js` (JS puro, descontinuado) e
  `expo-crypto`. Menos dependências, uma única superfície de código
  criptográfico para auditar.
- Cofre cifrado com AES-256-GCM (AEAD): o authTag do GCM autentica
  ciphertext + IV + dados associados (versão, salt, iterações) em uma única
  primitiva, em vez de uma construção manual encrypt-then-MAC. Cofres e
  backups no formato antigo (AES-CBC + HMAC-SHA256) continuam abrindo
  normalmente — a leitura é retrocompatível por versão de envelope.
- Credenciais locais com hash PBKDF2-SHA256 (600000 iterações, baseline
  OWASP atual), calculado em código nativo via `react-native-quick-crypto`
  (a mesma quantidade de iterações em JavaScript puro levava dezenas de
  segundos por operação em dispositivos reais; nativo leva ~80ms). Contas
  criadas com uma contagem de iterações mais antiga continuam válidas — a
  verificação lê o valor gravado no próprio registro — e são promovidas
  para o valor atual de forma transparente no primeiro login bem-sucedido
  após a atualização.
- Bloqueio automático do cofre: ao sair do app (ida para background) e após
  2 minutos de inatividade com o app aberto.
- Proteção contra captura de tela: bloqueia screenshot/gravação (Android e
  iOS 13+) e borra o preview do app no app-switcher do iOS.
- Política de senha local forte:
  - mínimo 8 caracteres (sem limite artificial de tamanho, até 64)
  - ao menos 1 letra
  - ao menos 1 número
  - ao menos 1 caractere especial
- Bloqueio progressivo de tentativas de login inválidas.
- Gerador de senhas usa CSPRNG nativo (`react-native-quick-crypto`), não `Math.random`.
- Senha copiada para a área de transferência é apagada automaticamente após 30s
  (somente se o clipboard ainda contiver o valor copiado).
- Backup local: exportação/importação do cofre cifrado (mesmo formato
  `encrypted_vault`) via compartilhamento nativo, para mitigar a perda total
  de dados em caso de troca/perda do aparelho. Ver seção "Backup".
- Exclusão de conta pelo próprio app (`"Excluir conta e todos os dados"`,
  com biometria + confirmação), exigida pela Apple para apps com criação de
  conta (App Store Review Guideline 5.1.1(v)) e recomendada pelo Google Play.
- Histórico de segurança visível no app (`"Ver historico de seguranca"`, na
  tela principal): lista os últimos eventos registrados localmente (login,
  criação de conta, exportação/importação de backup, captura de tela
  detectada, etc.), com opção de limpar o histórico.

## Sync entre iPhone e Mac (CloudKit)

> **Status atual: desativado.** O modulo nativo existe e compila, mas
> `cloudKitEntitlementConfigured` em
> [`modules/secure-vault-cloudkit/ios/SecureVaultCloudKitModule.swift`](modules/secure-vault-cloudkit/ios/SecureVaultCloudKitModule.swift)
> esta fixo em `false` — o app nunca chama `CKContainer`, entao roda 100%
> local mesmo em iOS (mesmo comportamento do Android). Isso e proposital:
> `CKContainer(identifier:)` trava o processo (`EXC_BREAKPOINT`) se chamado
> sem o entitlement de iCloud assinado no binario, e times pessoais/gratuitos
> da Apple **nao tem permissao para essa capability** — so times inscritos no
> Apple Developer Program (pago). O `ios/SecPass/SecPass.entitlements` (fora
> do controle de versao, gerado no prebuild) tambem precisa declarar
> `com.apple.developer.icloud-services`/`icloud-container-identifiers` para
> isso funcionar.
>
> Para reativar: (1) confirmar que a assinatura do Apple Developer Program da
> conta `cortexistech@gmail.com` (team `U9U9M3H2AP`) esta ativa — nao so
> criada; (2) no Xcode, Signing & Capabilities do target SecPass, adicionar a
> capability iCloud com CloudKit marcado e o container
> `iCloud.com.cortexistech.secpass`; (3) voltar `cloudKitEntitlementConfigured`
> para `true`. Sem os tres passos, qualquer tentativa de usar CloudKit volta a
> travar o app.

Quando reativado, em iOS/macOS o cofre sincroniza pela **base privada do
CloudKit** da conta iCloud do usuario — sem servidor proprio. A Apple ID
identifica o dono; a senha do SecPass so destrava o ciphertext no aparelho.

- Um registro `VaultMeta` (salt, iteracoes, verifier) e um `Credential`
  cifrado por item.
- No segundo aparelho o app detecta o cofre existente e mostra
  "Abrir cofre iCloud" em vez de criar conta do zero.
- Android continua 100% local: nao ha CloudKit.
- Exclusao de uma credencial so acontece por tombstone explicito
  (`{id, tombstone: true, deletedAt}`, sincronizado como upsert normal) ou
  pelo wipe total de "Excluir conta e todos os dados" (gated por
  biometria). O sync nunca infere exclusao pela ausencia de um id no
  payload local — um fetch remoto que falhe por rede nao pode apagar
  credenciais que so existem no outro aparelho.

O item legado no iCloud Keychain ainda e lido uma vez para migrar para o
CloudKit; gravacoes novas vao so para o CloudKit + cache local no Keychain
deste aparelho.

## Backup

O cofre em si não depende de nenhum servidor — a sincronização entre
aparelhos Apple (quando disponível) é feita pelo CloudKit da conta iCloud,
não por uma infraestrutura própria do SecPass. Para reduzir o risco de perda
total de dados:

- **Exportar**: no topo da tela principal, toque em "Exportar". O app gera um
  backup cifrado (mesmo envelope `encrypted_vault` usado no armazenamento
  local) e abre o compartilhamento nativo do sistema para salvar/enviar o
  arquivo.
- **Importar**: toque em "Importar", cole o conteúdo do backup exportado e
  confirme. Só funciona com a mesma conta (email + senha) usada na
  exportação, pois a chave de descriptografia é derivada dessas credenciais.
- **Atenção**: recriar a conta local (fluxo "Esqueci minha senha") invalida o
  acesso ao cofre salvo com a senha anterior. Sem um backup exportado, esses
  dados são perdidos permanentemente — o app avisa isso antes de prosseguir.

## Execução

Instalar dependências:

```bash
npm install
```

Rodar app:

```bash
npm run dev
```

Atalhos:

```bash
npm run ios
npm run android
```

### Rodar no Mac (Apple Silicon)

O app roda nativamente em Macs com Apple Silicon via o destino "My Mac
(Designed for iPad)" do Xcode — o mesmo binário iOS, sem target nem
configuração de build separados. Validado: todos os módulos nativos
(`react-native-quick-crypto`, `react-native-nitro-modules`,
`react-native-quick-base64`, `react-native-worklets`,
`react-native-reanimated`, `expo-secure-store`) compilam sem erro nesse modo.

```bash
npm run mac
```

Na primeira execução, abra `ios/SecPass.xcworkspace` no Xcode e use a conta
Apple `cortexistech@gmail.com` (team `U9U9M3H2AP`) em Signing & Capabilities.

Limitações desse modo: só funciona em Mac com Apple Silicon (não Intel) e não
é o mesmo que um app "Mac Catalyst" completo — não há hoje um segundo target
otimizado para desktop nem distribuição fora do seu próprio Mac. Suficiente
para uso pessoal; uma versão Catalyst completa (multi-arquitetura, App Store)
ficaria para uma iteração futura, se necessário.

## Testes e Qualidade

```bash
npm run test
npm run lint
```

Vulnerabilidades de dependências (`npm audit`) restantes estão todas em
toolchain de build (Expo CLI / Metro / plugins de config), não em código que
roda no app final, e só têm correção disponível via downgrade major do Expo
(`--force`). Rode `npm audit` periodicamente e avalie upgrades do Expo SDK
como uma decisão deliberada, não uma correção automática.

## Release Mobile

- Workflow: [.github/workflows/deploy-app-eas.yml](.github/workflows/deploy-app-eas.yml)
- Disparo manual (`workflow_dispatch`): escolher `profile` e `platform`.
- Disparo por tag: ao criar tag `v*`, o workflow executa build com `production` e `all` automaticamente.
- Formato de versao aceito: `vMAJOR.MINOR.PATCH` (ex: `v1.2.0`, `v1.2.0-rc1`).

Comandos locais equivalentes:

```bash
npm run build:preview
npm run build:preview:android
npm run build:preview:ios-simulator
npm run build:prod
```

Observacao sobre iOS:

- Build iOS para dispositivo interno/App Store exige a conta Apple
  `cortexistech@gmail.com` (team `U9U9M3H2AP`) ativa no Apple Developer Program.
- Sem enrollment Apple, use `build:preview:ios-simulator` para validar o app no simulador iOS sem credenciais de distribuicao.

Checklist de release:

1. Atualizar `version` em [app.json](app.json).
2. Rodar `npm run lint` e `npm run test` localmente.
3. Criar tag semver (`vMAJOR.MINOR.PATCH`) ou disparar workflow manual com `release_version` valida.
4. Executar build EAS (preview/prod) e validar artefatos gerados.
5. Publicar nas lojas (App Store / Play Console) conforme ambiente de release.
6. Em caso de rollback: publicar nova versao corretiva com tag superior (ex: `v1.2.1`).

## Estrutura Relevante

```text
src/
  app/
    _layout.tsx
    index.tsx
  screens/
    HomeScreen.js
  services/
    account.js
    loginGuard.js
    securityAudit.js
    session.js
    storage.js
    vaultCrypto.js
  utils/
    biometricAuth.js
    loginThrottle.js
    passwordGenerator.js
    securityPolicy.js
```

## Observações

- O repositório foi consolidado para mobile-only; infraestrutura web/backend legada foi removida.

## Legal

- Licença: proprietária, todos os direitos reservados — ver [`LICENSE`](LICENSE).
- [Política de Privacidade](PRIVACY_POLICY.md)
- [Termos de Uso](TERMS_OF_SERVICE.md)

Ambos os documentos precisam de revisão jurídica antes da publicação nas
lojas (App Store / Play Store exigem uma URL pública para a política de
privacidade — publique este arquivo, por exemplo, via GitHub Pages ou um
link direto ao arquivo no repositório).
