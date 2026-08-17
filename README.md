# SecPass

![CI](https://github.com/CunhaSilva-CCS/secpass/actions/workflows/ci.yml/badge.svg)

Aplicativo mobile de gerenciamento de senhas (iOS/Android) com cofre local criptografado no dispositivo.

## Escopo Atual (Mobile-Only)

- Plataforma: iOS e Android (Expo/React Native).
- Armazenamento: local no celular, com `expo-secure-store` e autenticação do aparelho.
- Cofre: payload criptografado (`encrypted_vault`) com PBKDF2 + AES-CBC + HMAC.
- Bloqueio: sem seletor de segundos; o bloqueio ocorre pelo ciclo nativo do app (background/foreground) e desbloqueio biométrico.
- Sem dependência de backend para login/cofre no fluxo principal.

## Segurança Aplicada

- Proteção em `SecureStore` com autenticação obrigatória (`requireAuthentication: true`).
- Credenciais locais com hash PBKDF2-SHA256 (310000 iterações).
- Política de senha local forte:
  - mínimo 8 caracteres (sem limite artificial de tamanho, até 64)
  - ao menos 1 letra
  - ao menos 1 número
  - ao menos 1 caractere especial
- Bloqueio progressivo de tentativas de login inválidas.
- Gerador de senhas usa CSPRNG (`expo-crypto`), não `Math.random`.
- Senha copiada para a área de transferência é apagada automaticamente após 30s
  (somente se o clipboard ainda contiver o valor copiado).
- Backup local: exportação/importação do cofre cifrado (mesmo formato
  `encrypted_vault`) via compartilhamento nativo, para mitigar a perda total
  de dados em caso de troca/perda do aparelho. Ver seção "Backup".

## Backup

O cofre existe apenas no dispositivo — não há sincronização com servidor.
Para reduzir o risco de perda total de dados:

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

- Build iOS para dispositivo interno/App Store exige conta ativa no Apple Developer Program.
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

## Licença

Consulte `LICENSE`.
