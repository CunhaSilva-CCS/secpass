# SecPass

![CI](https://github.com/CunhaSilva-CCS/secpass/actions/workflows/ci.yml/badge.svg)

Gerenciador de senhas mobile e web construído com Expo + React Native, com foco em simplicidade, visual moderno e proteção de acesso por biometria.

## Visao Geral

O SecPass permite salvar, consultar e organizar credenciais de forma local no dispositivo. A aplicacao usa autenticacao biometrica para desbloquear o cofre (quando disponivel) e armazenamento seguro para proteger os dados salvos.

## Status de Producao (2026-07-17)

- Frontend e backend publicados no mesmo dominio: https://password-manager-gules-one.vercel.app
- Backend em `nodeEnv=production` com persistencia em PostgreSQL (`storageBackend=postgres`).
- Banco conectado via variaveis de ambiente do projeto no Vercel (incluindo `POSTGRES_URL`).
- Fluxo multiusuario validado ponta a ponta em producao:
	- cadastro de duas contas distintas;
	- escrita de cofre independente por conta;
	- leitura isolada por usuario (sem mistura de dados).

## Runbook de Incidente (Producao)

Use esta sequencia quando a API estiver retornando 500 no ambiente de producao.

1. Confirmar estado do health:
	- `curl -s https://password-manager-gules-one.vercel.app/api/health`
2. Listar variaveis de producao no Vercel:
	- `vercel env ls production --project password-manager --scope paginaum`
3. Se houver `DATABASE_URL` incorreta (ex.: erro `ENOTFOUND base`), remover:
	- `vercel env rm DATABASE_URL production --yes --project password-manager --scope paginaum`
4. Recriar `DATABASE_URL` com valor valido do banco:
	- `vercel env add DATABASE_URL production --project password-manager --scope paginaum`
5. Fazer deploy para aplicar variaveis:
	- `vercel deploy --prod --yes --project password-manager --scope paginaum`
6. Revalidar health e garantir `storageBackend=postgres`:
	- `curl -s https://password-manager-gules-one.vercel.app/api/health`
7. Se houver `SELF_SIGNED_CERT_IN_CHAIN`, confirmar se o backend em producao inclui:
	- fallback para `POSTGRES_URL` quando `DATABASE_URL` estiver ausente;
	- sanitizacao de parametros SSL da URL de conexao;
	- inicializacao do pool com SSL controlado no runtime.
8. Validacao funcional final (smoke test):
	- cadastro de 2 usuarios;
	- gravação de cofre para cada usuario;
	- leitura isolada por usuario.

### Comandos de 1 Linha (Operacao Rapida)

1. Ver health atual:
	- `curl -s https://password-manager-gules-one.vercel.app/api/health`
2. Ver variaveis de producao:
	- `vercel env ls production --project password-manager --scope paginaum`
3. Corrigir `DATABASE_URL` (remover + recriar):
	- `vercel env rm DATABASE_URL production --yes --project password-manager --scope paginaum && vercel env add DATABASE_URL production --project password-manager --scope paginaum`
4. Aplicar mudancas em producao:
	- `vercel deploy --prod --yes --project password-manager --scope paginaum`
5. Smoke test rapido (health + cadastro + isolamento):
	- `npm run smoke:prod`

## Principais Funcionalidades

- Cadastro local de conta (email + senha + confirmacao de senha).
- Login local com validacao contra conta salva no dispositivo.
- Sessao exigindo novo login apos reinicio do app para derivar chave de cofre em memoria.
- Acao "Esqueci minha senha" com tentativa remota (backend) e fallback local no modo hibrido.
- Cadastro de credenciais com titulo, usuario e senha.
- Geracao automatica de senha forte com 16 caracteres.
- Busca em tempo real por titulo ou usuario.
- Visualizacao de senha sob demanda.
- Copia de senha para area de transferencia.
- Edicao e exclusao de credenciais.
- Bloqueio do cofre com biometria.
- Persistencia local com migracao para armazenamento seguro.
- Cofre com criptografia cliente (AES-256-CBC + HMAC-SHA256) antes de salvar local/remoto.

## Tecnologias Utilizadas

- Expo SDK 54
- React 19
- React Native 0.81
- Expo Router
- Expo Local Authentication
- Expo Crypto
- Expo Secure Store
- AsyncStorage (somente leitura de legado e migracao)
- Expo Clipboard
- TypeScript (configuracao no projeto)
- EAS Build

## Estrutura do Projeto

```text
.
|- app.json
|- eas.json
|- package.json
|- backend/
|  |- package.json
|  |- .env.example
|  |- src/
|  |  |- index.js
|- src/
|  |- app/
|  |  |- _layout.tsx
|  |  |- index.tsx
|  |- screens/
|  |  |- HomeScreen.js
|  |- components/
|  |  |- BrandLogo.js
|  |  |- PasswordForm.js
|  |  |- PasswordCard.js
|  |  |- SearchBar.js
|  |- services/
|  |  |- storage.js
|  |  |- session.js
|  |  |- account.js
|  |- utils/
|  |  |- biometricAuth.js
|  |  |- passwordGenerator.js
|  |- hooks/
|  |- global.css
|- assets/
```

## Fluxo de Uso

1. A aplicacao verifica se existe sessao ativa local.
2. Se ainda nao existir conta local, o usuario cria a conta no proprio app.
3. Sem sessao ativa, o usuario entra com email e senha da conta local.
4. Com sessao ativa, o app tenta desbloquear o cofre (biometria em dispositivos nativos).
5. O app carrega as credenciais locais.
6. O usuario pode criar, filtrar, editar, copiar, exibir/ocultar e remover senhas.
7. Alteracoes sao persistidas automaticamente no armazenamento local.

## Login e Sessao

- Login em modo hibrido: backend de autenticacao quando disponivel, com fallback local.
- Modos de auth via `EXPO_PUBLIC_AUTH_MODE`: `hybrid` (padrao), `local` ou `remote`.
- Campos de cadastro: email, senha de acesso e confirmacao de senha.
- Campos de login: email e senha de acesso.
- Validacoes de formato e politica forte de senha no cadastro (minimo 10 caracteres, maiuscula, minuscula, numero e especial).
- Bloqueio progressivo local apos tentativas consecutivas de login incorreto (anti brute-force).
- Estado de bloqueio de login persistido localmente entre reinicializacoes do app.
- Decaimento gradual do nivel de bloqueio com o passar do tempo sem novas falhas.
- Alternancia na tela entre "Criar conta" e "Entrar".
- Opcao "Lembrar de mim":
	- Ativada: mantem sessao durante a execucao atual.
	- Reinicio do app exige novo login para rederivar a chave do cofre.
- Botao "Sair" encerra a sessao ativa.
- "Esqueci minha senha" tenta backend remoto (`/auth/forgot-password`) e usa fluxo local como fallback no modo hibrido.
- O app permite informar token de recuperacao e nova senha para consumir `/auth/reset-password`.
- Deep link de recuperacao suportado no app: `secpass://reset-password?token=<TOKEN>&email=<EMAIL_OPCIONAL>`.

## Seguranca do Login Local

- O login atual e local e nao usa servidor de identidade.
- A senha da conta local nao e armazenada em texto puro; o app deriva hash com PBKDF2 + SHA-256 e sal unico por conta.
- A validacao de login compara o hash calculado no momento da entrada com o hash persistido no dispositivo.
- A conta local e a sessao sao armazenadas com preferencia por `expo-secure-store`.
- AsyncStorage e usado apenas para leitura de formato legado e migracao para o Secure Store.

Recomendacoes para producao:

### Plano de Endurecimento (Seguranca)

Status baseado no estado atual do codigo (2026-07-16).

#### MVP (prioridade alta)

| Item | Status |
| --- | --- |
| Integrar backend de autenticacao (OIDC/OAuth2 ou provedor de identidade). | Parcial (backend proprio com persistencia em disco/PostgreSQL iniciado em 2026-07-16; OIDC/OAuth2 pendente) |
| Nao armazenar senha em texto puro; usar hash com sal no backend. | Concluido no backend MVP (bcrypt em 2026-07-16) |
| Implementar recuperacao de conta por email real com token de expiracao. | Parcial (endpoints de forgot/reset + envio SMTP no backend em 2026-07-16; configuracao de provedor e monitoria de entrega pendentes) |
| Aplicar bloqueio por tentativas de login (anti brute-force local). | Concluido (2026-07-16) |
| Aplicar politica forte de senha no cadastro local. | Concluido (2026-07-16) |

#### v1 (prioridade media)

| Item | Status |
| --- | --- |
| Adicionar politicas de bloqueio por tentativas e rate limiting no backend. | Parcial (rate limiting basico implementado no backend MVP em 2026-07-16; distribuido por IP/infra pendente) |
| Adotar refresh token curto e revogacao de sessao no logout. | Parcial (refresh com rotacao e revogacao no logout implementados no backend MVP em 2026-07-16; ajuste de TTL curto para producao pendente) |

#### v2 (prioridade media)

| Item | Status |
| --- | --- |
| Registrar auditoria de login (dispositivo, horario, IP aproximado). | Parcial (backend registra eventos e horario com persistencia em arquivo/PostgreSQL em 2026-07-16; dispositivo/IP e observabilidade central pendentes) |
| Incluir alertas de atividade suspeita e trilha de seguranca para o usuario. | Parcial (trilha local de eventos em 2026-07-16; backend/alerta remoto pendente) |

## Seguranca e Persistencia

- Chave de armazenamento: `passwords`.
- Chave de armazenamento da conta local: `secpass_account`.
- Chave de armazenamento da sessao: `secpass_session`.
- Chave de armazenamento do guard de login: `secpass_login_guard`.
- Chave de armazenamento da trilha local de seguranca: `secpass_security_audit`.
- Persistencia principal: `expo-secure-store`.
- Fallback/migracao legado: `@react-native-async-storage/async-storage`.
- Ao carregar dados, o app tenta ler primeiro do Secure Store e apenas migra dados legados do AsyncStorage quando necessario.
- Itens do cofre sao cifrados no cliente antes de persistir (local e backend remoto), em formato `encrypted_vault`.
- Para conta local, a senha e derivada com PBKDF2 (SHA-256) + sal (nao em texto puro), e nao e regravada em AsyncStorage apos migracao.
- Se o SecureStore estiver indisponivel, o app ainda tenta leitura legada para manter acesso a contas antigas; criacao/atualizacao de conta e sessao continuam exigindo armazenamento seguro (fail-closed).
- O token de sessao persistido e aleatorio criptograficamente (32 bytes) e nao usa timestamp previsivel.
- Eventos de seguranca (login com sucesso/falha, lock e logout) sao registrados em trilha local para auditoria basica.
- Acoes sensiveis (mostrar senha, copiar senha e iniciar edicao) solicitam autenticacao biometrica em dispositivos nativos.

## Biometria

- Web: acesso liberado sem biometria.
- iOS: validacao explicita de suporte a reconhecimento facial (Face ID).
- Android: usa a autenticacao biometrica do dispositivo (quando disponivel).
- Se nao houver hardware biometrico ou biometria cadastrada, o cofre permanece bloqueado no fluxo nativo.

## Troubleshooting (Biometria)

Checklist rapido (30s):

1. Confirme se a biometria esta cadastrada no aparelho.
2. Verifique se o app tem permissao de biometria no sistema.
3. Toque em "Desbloquear" novamente apos qualquer cancelamento.
4. Se mudou configuracoes de biometria, feche e reabra o app.

1. "Face ID indisponivel neste dispositivo"
- Verifique se o aparelho possui Face ID e se ele esta configurado no sistema.
- Confirme permissoes de biometria para o app.

2. Cofre permanece bloqueado no iOS
- Abra Ajustes > Face ID e Codigo e confirme se o Face ID esta ativo.
- Refaça o cadastro de Face ID e tente novamente no app.

3. Android nao autentica
- Confirme se biometria/fingerprint esta cadastrada no aparelho.
- Atualize o sistema e teste novamente apos reiniciar o app.

4. Usuario cancelou a autenticacao
- Toque em "Desbloquear" novamente para iniciar novo desafio biometrico.

5. Web nao pede biometria
- Comportamento esperado: no Web o acesso e liberado sem biometria.

6. Erro de autenticacao apos mudar configuracoes do aparelho
- Feche e reabra o app para revalidar o estado da biometria.

## Requisitos

- Node.js 18+
- npm 9+
- Expo CLI via npx
- iOS Simulator / Android Emulator (opcional)
- Conta Expo (para build com EAS)

## Como Rodar Localmente

```bash
npm install
npm run start
```

Para rodar backend local em paralelo:

```bash
cd backend
npm install
npm run dev
```

Variaveis recomendadas no `backend/.env` para recuperacao por email:

```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=seu_email@gmail.com
SMTP_PASS=sua-senha-de-app-do-google
EMAIL_FROM="SecPass <seu_email@gmail.com>"
PASSWORD_RESET_URL_BASE=https://secpass.app/reset-password
EXPOSE_RESET_TOKEN=false
AUTH_STORE_PATH=./data/auth-store.json
DATABASE_URL=postgres://user:pass@host:5432/secpass
AUTH_STORE_TABLE=auth_state
```

Observacao:

- Em producao, `EXPOSE_RESET_TOKEN=false` (padrao) oculta o token de reset na resposta da API.
- Para ambiente de homologacao/suporte sem SMTP, use `EXPOSE_RESET_TOKEN=true` para retornar `devResetToken` no endpoint `/auth/forgot-password`.
- Para Gmail SMTP, use senha de app do Google em `SMTP_PASS`; a senha normal da conta nao funciona.

Health checks do backend:

- `GET /health`: liveness + modo de storage (`file` ou `postgres`).
- `GET /health/ready`: readiness para orquestrador/deploy.

Checklist minimo para producao real:

1. Defina `NODE_ENV=production` no backend.
2. Use segredos fortes em `ACCESS_TOKEN_SECRET` e `REFRESH_TOKEN_SECRET`.
3. Configure `CORS_ORIGIN` com dominio real (sem localhost).
4. Monte volume persistente para `AUTH_STORE_PATH` (ou migre para banco gerenciado).
5. Se usar banco gerenciado, defina `DATABASE_URL` e proteja conexao (SSL/politicas de rede).
6. Configure monitoria de entrega SMTP e alertas de falha.
7. Use `AUTH_STORE_TABLE` com nome seguro (apenas letras, numeros e underscore).

Para abrir reset direto no app mobile, prefira:

```bash
PASSWORD_RESET_URL_BASE=secpass://reset-password
```

No app Expo, defina opcionalmente:

```bash
EXPO_PUBLIC_API_URL=http://localhost:4000
EXPO_PUBLIC_AUTH_MODE=hybrid
```

Notas de URL local:

- iOS Simulator e Web: `http://localhost:4000`
- Android Emulator: `http://10.0.2.2:4000`

## Demo do Fluxo de Conta (30s)

1. Abra o app e escolha "Criar conta".
2. Informe um email valido.
3. Defina senha e confirme a senha.
4. Toque em "Criar conta".
5. Entre com o mesmo email e senha na tela de login.
6. (Opcional) Ative "Lembrar de mim" para manter sessao local.
7. Apos login, desbloqueie o cofre e cadastre a primeira credencial.

## Troubleshooting (Login Local)

1. "Email invalido"
- Verifique se o email contem `@`.

2. "Senha deve ter pelo menos 4 caracteres"
- Use senha com 4 ou mais caracteres no cadastro/login.

3. "As senhas nao conferem"
- No cadastro, confirme exatamente a mesma senha digitada no campo anterior.

4. "Email ou senha incorretos"
- Entre com as credenciais da conta local criada no dispositivo.
- Se necessario, use "Esqueci minha senha" e recrie a conta local.

5. Sessao nao permaneceu ativa
- Ative "Lembrar de mim" antes de tocar em "Entrar".

6. App abre direto no login mesmo apos usar "Lembrar de mim"
- Verifique se o armazenamento seguro do dispositivo esta disponivel.
- Em alguns cenarios, limpar dados do app remove sessao e conta local.

Comandos por plataforma:

```bash
npm run android
npm run ios
npm run web
```

Lint:

```bash
npm run lint
```

## Scripts Disponiveis

- `start`: inicia o Expo.
- `android`: abre no Android.
- `ios`: abre no iOS.
- `web`: abre no navegador.
- `lint`: executa verificacoes de lint.
- `build:dev:ios`: build de desenvolvimento iOS via EAS.
- `build:dev:android`: build de desenvolvimento Android via EAS.

## Build e Distribuicao (EAS)

Perfis definidos em `eas.json`:

- `development`: development client e distribuicao interna.
- `preview`: distribuicao interna para validacao.
- `production`: build de producao.

Exemplos:

```bash
npm run build:dev:ios
npm run build:dev:android
```

Para producao:

```bash
eas build --profile production --platform ios
eas build --profile production --platform android
```

## Release Coordenada (App + Backend)

- O app e o backend fazem parte do mesmo produto, mas sao implantados como artefatos separados.
- O repositorio possui workflow de release coordenada em `.github/workflows/release-coordenada.yml`.
- O workflow roda gates de qualidade do app e, se existir `backend/package.json`, tambem valida o backend.
- O deploy e real: app via EAS e backend via Docker + Cloud Run, com preflight de segredos obrigatorios.

Escopo atual do backend criado no projeto:

- Endpoints de autenticacao: registro, login, refresh e logout.
- Endpoints de recuperacao: forgot password e reset password com token expiravel.
- Entrega de email via SMTP no endpoint de forgot password (com token dev no ambiente de desenvolvimento).
- Hash de senha com bcrypt no servidor.
- Rate limit basico nos endpoints de autenticacao.
- Persistencia de estado de autenticacao (usuarios, sessoes, tokens e auditoria) em arquivo JSON ou PostgreSQL.
- Trilha de eventos de seguranca com persistencia para auditoria inicial.

Como executar:

1. Abra GitHub Actions e selecione `Release Coordenada`.
2. Informe `release_version` (ex: `v1.2.0`).
3. Escolha se deseja deploy de app, backend, ou ambos.
4. Execute e acompanhe o resumo final no job `release-summary`.

Deploy backend para producao (Cloud Run):

1. Configure os segredos do GitHub Actions no repositorio:
	- `GCP_SA_KEY`
	- `GCP_PROJECT_ID`
	- `GCP_REGION_DOCKER_HOST` (ex: `us-central1-docker.pkg.dev`)
	- `CORS_ORIGIN`
	- `ACCESS_TOKEN_SECRET`
	- `REFRESH_TOKEN_SECRET`
	- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`
	- `EMAIL_FROM`
	- `PASSWORD_RESET_URL_BASE`
	- `DATABASE_URL` (recomendado para persistencia em producao)
2. Execute o workflow `Deploy Backend Cloud Run` em `.github/workflows/deploy-backend-cloudrun.yml`.
3. Informe `environment` e `image_tag`.
4. O workflow faz build/push da imagem Docker e publica no Cloud Run.

Deploy app para producao (EAS):

1. Configure `EXPO_TOKEN` nos secrets do GitHub.
2. Execute o workflow `Deploy App EAS` em `.github/workflows/deploy-app-eas.yml`.
3. Selecione `profile` e `platform`.
4. O workflow executa qualidade (lint/testes) e dispara o build via EAS CLI.

Release coordenada real (app + backend):

- O workflow `.github/workflows/release-coordenada.yml` agora faz preflight de segredos.
- Se `deploy_app=true`, executa `eas build` de producao.
- Se `deploy_backend=true`, faz build/push Docker e deploy no Cloud Run.

Observacao: no Cloud Run atual o `AUTH_STORE_PATH` usa `/tmp/auth-store.json`, que e efemero. Para producao robusta, migre para banco gerenciado.

## Configuracoes do App

Definidas em `app.json`:

- Nome: SecPass
- Scheme: `secpass`
- Plugin de biometria: `expo-local-authentication`
- Plugin de armazenamento seguro: `expo-secure-store`
- Splash screen customizada
- Permissoes Android para biometria/fingerprint
- Bundle identifier iOS configurado

## UX e Interface

- Tema claro/escuro automatico conforme sistema.
- Layout com cards, resumo de itens e estado vazio amigavel.
- Tela de bloqueio com CTA de desbloqueio.
- Componentes reutilizaveis para formulario, busca e cartoes de senha.

## Limitacoes Atuais

- Dados locais no dispositivo (nao ha sincronizacao em nuvem).
- Backend ainda sem provedor de identidade completo (OIDC/OAuth2), MFA remota e garantia operacional de entrega de email.
- Persistencia de credenciais ainda local (sem hardening de servidor, telemetria de risco e politicas centralizadas).
- Sem importacao/exportacao de credenciais.
- Sem categorias, tags ou pastas para organizacao.
- Sem gerador de senha configuravel (tamanho/regras fixos).
- Cobertura de testes ainda inicial (sem E2E mobile nativo).

## Roadmap Sugerido

### MVP (prioridade alta)

| Item | Prioridade | Criterio de conclusao | Status |
| --- | --- | --- | --- |
| Auto-lock por inatividade | Alta | Apos 30s/60s/120s sem interacao, o cofre volta ao estado bloqueado e exige biometria para reabrir. | Concluido (2026-07-16) |
| Cobertura de testes (unitarios e integracao) | Alta | Testes para gerador de senha, armazenamento (save/load/migracao) e fluxos criticos de UI, com pipeline executando em pull requests. | Concluido (2026-07-16) |

### v1 (prioridade media)

| Item | Prioridade | Criterio de conclusao |
| --- | --- | --- |
| Gerador de senha com politicas configuraveis | Media | Usuario escolhe tamanho e regras (maiusculas, minusculas, numeros, simbolos) e visualiza indicador de forca antes de salvar. |
| Categorias e favoritos | Media | Cada credencial pode receber categoria e marcador de favorito, com filtros dedicados na listagem. |

### v2 (prioridade media/baixa)

| Item | Prioridade | Criterio de conclusao |
| --- | --- | --- |
| Backup criptografado opcional | Media | Exportacao manual de backup cifrado com senha mestra e restauracao validada no app. |
| Sincronizacao entre dispositivos | Baixa | Usuario autenticado consegue manter credenciais sincronizadas entre dois dispositivos, com estrategia de resolucao de conflitos documentada. |

## Licenca

Projeto licenciado sob os termos definidos em `LICENSE`.
