# SecPass

![CI](https://github.com/CunhaSilva-CCS/secpass/actions/workflows/ci.yml/badge.svg)

Gerenciador de senhas multiplataforma com cofre criptografado de ponta a
ponta (E2E) client-side: **Android, iOS, macOS e Windows**. Os quatro
clientes compartilham o mesmo formato de cofre cifrado e a mesma lógica de
criptografia/sincronização — uma credencial criada em um aparelho aparece,
já decifrada, em qualquer outro.

Para a documentação técnica completa (arquitetura, criptografia, auditoria
de segurança, estado de prontidão para produção), ver
[`docs/SecPass-Documentacao-Tecnica.pdf`](docs/SecPass-Documentacao-Tecnica.pdf).

## Plataformas

| Cliente | Tecnologia | Pasta |
|---|---|---|
| Android | React Native + Expo (SDK 57) | raiz do repositório |
| iOS | React Native + Expo + módulo nativo Swift | raiz do repositório |
| macOS | Electron | [`desktop/`](desktop/) |
| Windows | Electron (mesmo código do macOS) | [`desktop/`](desktop/) |

## Sincronização entre dispositivos

O usuário escolhe, por aparelho, qual backend usar (armazenado localmente,
migrável a qualquer momento):

- **Google Drive** (pasta oculta `appDataFolder`) — funciona entre Android,
  iOS, macOS e Windows. Autenticação nativa (SDK GoogleSignIn) no iOS;
  OAuth 2.0 + PKCE via navegador do sistema no Android (ver nota abaixo) e
  no desktop.
- **iCloud (CloudKit)** — só entre iPhone e Mac, nativo via CloudKit no iOS
  e via CloudKit Web Services (janela oculta do Electron) no macOS.
  Atualmente **desativado no build padrão do iOS** por exigir um perfil de
  provisionamento com capacidade iCloud, indisponível sem conta paga do
  Apple Developer Program — ver seção 11.1 da documentação técnica.

> **Nota sobre o Android**: a autenticação com o Google Drive não usa mais
> o SDK nativo (`@react-native-google-signin/google-signin`), que falhava
> de forma consistente ao pedir o escopo `drive.appdata` em builds fora da
> Play Store (`AutoManageHelper: Unresolved error while connecting
> client`). A solução foi um fluxo OAuth via navegador, com o mesmo
> princípio já usado no desktop — ver seção 6.1.1 da documentação técnica
> para a investigação completa.

## Segurança

- Cofre cifrado com **AES-256-GCM** (AEAD), chave derivada via
  **PBKDF2-SHA256 com 600.000 iterações**. Formato de envelope v3 vincula
  `id`/`updatedAt`/`tombstone` como dados associados autenticados,
  impedindo que um backend comprometido force o "rollback" de um item para
  uma versão antiga porém genuína.
- Merge entre dispositivos por `last-write-wins` (sem servidor arbitrando
  conflitos — Google Drive/iCloud são armazenamento cego).
- Log de auditoria de segurança local, protegido por selo HMAC encadeado
  (detecta adulteração feita por quem tem acesso ao armazenamento mas não
  sabe a senha).
- Bloqueio automático do cofre ao sair do app/inatividade; desbloqueio por
  biometria (Face ID/Touch ID/impressão digital) é conveniência sobre uma
  chave já derivada — nunca substitui a senha mestra de verdade.
- Proteção contra captura de tela (mobile e desktop).
- Bloqueio progressivo de tentativas de login inválidas — **limitação
  conhecida e documentada**: por não haver servidor, esse contador
  depende do relógio do próprio aparelho, então não é a defesa real contra
  força bruta (essa é o custo computacional do PBKDF2). Ver seção 9.3/13.4
  da documentação técnica.
- Revisão de segurança adversarial completa realizada em duas fases (11 +
  3 achados identificados e corrigidos) — ver seção 9 da documentação
  técnica para o histórico completo.

## Rodar localmente

Instalar dependências (mobile):

```bash
npm install
```

```bash
npm run android          # Android (emulador/dispositivo padrão)
npm run android:device   # Android, escolhendo o dispositivo
npm run ios               # iOS (Simulador)
npm run ios:device        # iOS, escolhendo o dispositivo
```

Desktop (macOS/Windows):

```bash
cd desktop
npm install
npm run dev
```

Ver [`desktop/README.md`](desktop/README.md) para configuração de
sincronização (Google Drive/iCloud) e empacotamento (DMG universal, NSIS
Windows, assinatura/notarização).

## Testes e qualidade

```bash
npm run test    # mobile — 210 testes
npm run lint

cd desktop && npm run test   # desktop — 64 testes
```

Vulnerabilidades de dependências (`npm audit`) restantes estão em
toolchain de build (Expo CLI/Metro/electron-builder) ou exigem downgrade
major — avaliar upgrade como decisão deliberada, não correção automática
(ver seção 12.2 da documentação técnica).

## Build de produção

Builds locais são preferidos aos builds em nuvem do EAS por serem dezenas
de vezes mais rápidos:

```bash
# Android (release assinado)
SENTRY_DISABLE_AUTO_UPLOAD=true npx expo run:android --device "<nome>" --variant release

# iOS (Release, dispositivo físico)
SENTRY_DISABLE_AUTO_UPLOAD=true npx expo run:ios --device "<nome>" --configuration Release

# macOS (DMG universal) e Windows (instalador NSIS x64)
cd desktop
npm run dist:dmg
npm run dist:win
```

Artefatos finais organizados por plataforma em [`builds/`](builds/) (fora
do controle de versão — ver `.gitignore`).

## Estrutura relevante

```text
src/
  app/                    # Rotas do Expo Router
  screens/HomeScreen.js   # Tela principal (cofre, sync, config)
  services/               # Criptografia, storage, auth, sync, auditoria
  utils/                  # Throttle de login, gerador de senha, etc.
modules/
  secure-vault-sync/      # Módulo nativo Swift (Google Drive, iOS)
  secure-vault-cloudkit/  # Módulo nativo Swift (CloudKit, iOS)
plugins/                  # Config plugins do Expo (assinatura, OAuth Android, etc.)
desktop/
  src/main/core/          # Portas Node.js dos mesmos serviços do mobile
  src/main/cloudkit/      # Janela oculta rodando CloudKit JS (macOS)
  src/renderer/           # Interface React do app desktop
builds/                   # Artefatos finais de produção, por SO
docs/                     # Documentação técnica completa (PDF)
```

## Legal

- Licença: proprietária, todos os direitos reservados — ver [`LICENSE`](LICENSE).
- [Política de Privacidade](PRIVACY_POLICY.md)
- [Termos de Uso](TERMS_OF_SERVICE.md)

Ambos os documentos precisam de revisão jurídica antes da publicação nas
lojas (App Store/Play Store exigem uma URL pública para a política de
privacidade).
