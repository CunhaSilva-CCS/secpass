# Política de Privacidade do SecPass

Última atualização: 10 de setembro de 2026

Esta Política de Privacidade descreve como o aplicativo **SecPass** ("o
Aplicativo") trata dados ao ser usado em seu dispositivo Android, iOS,
macOS ou Windows.

> **Aviso**: este documento foi redigido para refletir com precisão o
> funcionamento atual do Aplicativo. Ele não substitui aconselhamento
> jurídico. Antes de publicar nas lojas, recomenda-se revisão por um
> advogado, especialmente quanto a LGPD (Brasil), GDPR (UE) ou outras leis
> aplicáveis aos países onde o app será distribuído — em especial as
> seções 2.1, 3, 7 e 10 abaixo, que dependem da sincronização opcional
> descrita a seguir e ainda não passaram por essa revisão.

## 1. Resumo

O SecPass é um cofre de senhas com **criptografia de ponta a ponta (E2E)
feita no seu próprio aparelho**. O Aplicativo não possui servidor próprio.
Por padrão, tudo o que você cadastra fica armazenado, de forma
criptografada, apenas no aparelho em que o Aplicativo está instalado. Você
pode, opcionalmente, ativar a sincronização entre seus próprios
aparelhos — nesse caso, uma cópia **já cifrada** do seu cofre passa a
ficar guardada também na sua própria conta Google (Google Drive) ou Apple
(iCloud), à sua escolha (ver Seção 2.6). Em nenhum momento o SecPass ou seu
desenvolvedor recebe, vê ou tem acesso ao conteúdo do seu cofre em texto
claro. A única exceção não relacionada ao cofre é o envio automático de
relatórios técnicos de erro (sem senhas ou dados do cofre) para
diagnóstico — ver Seção 2.5.

## 2. Quais dados o Aplicativo processa

### 2.1 Dados que você cadastra

- **Conta local de acesso**: e-mail (usado apenas como identificador local
  e, se a sincronização estiver ativa, para localizar seu cofre na nuvem)
  e senha mestra.
- **Itens do cofre**: título, usuário e senha de cada credencial que você
  adiciona.

Esses dados **nunca são transmitidos em texto claro** para o desenvolvedor
do SecPass, para servidores próprios do desenvolvedor ou para qualquer
terceiro. Não existe conta em nuvem operada pelo desenvolvedor, nem
backend próprio para o cofre. Se você ativar a sincronização (Seção 2.6),
uma versão já cifrada do cofre passa a existir também na sua própria conta
Google ou Apple — nunca em infraestrutura do desenvolvedor.

### 2.2 Como esses dados são armazenados

- A senha mestra nunca é salva em texto puro: é transformada com
  PBKDF2-SHA256 (600.000 iterações) antes de ser gravada.
- O cofre de credenciais é cifrado com AES-256-GCM (cifra autenticada, que
  garante sigilo e integridade numa única primitiva), usando uma chave
  derivada da sua senha mestra.
- Os dados cifrados ficam no armazenamento seguro do sistema operacional
  (Keychain no iOS/macOS, Keystore no Android, DPAPI no Windows),
  protegidos por autenticação obrigatória do aparelho.

### 2.3 Autenticação biométrica

O SecPass pode usar Face ID, Touch ID ou biometria do Android para
desbloquear o cofre. Essa autenticação é processada inteiramente pelo
sistema operacional do seu aparelho: **o Aplicativo nunca recebe, acessa ou
armazena seus dados biométricos brutos** (impressão digital, face). O
Aplicativo apenas recebe um resultado de "autenticado" ou "não autenticado"
do sistema operacional. A biometria é sempre uma conveniência sobre uma
chave já derivada da sua senha mestra — nunca substitui nem contorna essa
senha.

### 2.4 Registro de eventos de segurança

O Aplicativo mantém, localmente e de forma cifrada, um histórico dos
últimos eventos de segurança (tentativas de login, bloqueios, exportação e
importação de backup). Esse histórico não sai do dispositivo e pode ser
apagado a qualquer momento pelo usuário.

### 2.5 Relatórios de erro (Sentry)

O Aplicativo usa o serviço **Sentry** para receber, automaticamente,
relatórios técnicos quando ocorre um erro ou travamento. O que é enviado:
mensagem e pilha de chamadas (*stack trace*) do erro, modelo/versão do
sistema operacional, versão do Aplicativo e identificadores técnicos
genéricos (não vinculados à sua identidade — nenhum e-mail, nome ou dado de
conta é enviado).

O Aplicativo aplica um filtro antes de qualquer envio que remove
automaticamente campos com nomes associados a dados sensíveis (senha,
segredo do cofre, chaves de criptografia, valores cifrados) de qualquer
relatório. Nenhum item do cofre, senha mestra ou conteúdo de tela é
capturado ou enviado — o Aplicativo não usa gravação de tela nem captura
de tela para esse fim. O Sentry processa esses relatórios como
subcontratado (processador de dados) do desenvolvedor do SecPass, apenas
para fins de diagnóstico e correção de falhas.

### 2.6 Sincronização entre seus próprios dispositivos (opcional)

Por padrão o SecPass funciona 100% local. Você pode ativar, a qualquer
momento e por aparelho, a sincronização do cofre entre os aparelhos que
você mesmo possui, escolhendo um dos dois backends abaixo:

- **Google Drive**: o cofre cifrado é salvo numa pasta especial e oculta
  da sua própria conta Google (`appDataFolder`), invisível na interface
  normal do Google Drive e acessível apenas pelo próprio Aplicativo.
  Disponível em Android, iOS, macOS e Windows.
- **iCloud**: o cofre cifrado é salvo via CloudKit na sua própria conta
  Apple (iCloud), na base de dados privada do seu usuário. Disponível
  apenas entre iPhone e Mac.

Em ambos os casos, **o que sai do seu dispositivo é sempre o cofre já
cifrado (AES-256-GCM)** — a senha mestra e o conteúdo em texto claro do
cofre nunca são enviados à Google, à Apple ou a qualquer servidor. A
Google e a Apple, nessas condições, atuam apenas como um espaço de
armazenamento de um arquivo opaco que nem elas conseguem decifrar (nunca
recebem a sua senha mestra nem a chave derivada dela) — o SecPass e seu
desenvolvedor também não têm acesso a esse arquivo, já que ele fica na sua
própria conta Google/Apple, não em infraestrutura do desenvolvedor.

Ativar essa sincronização amplia, na prática, o que protege seus dados:
quem comprometer sua conta Google ou Apple passa a poder baixar esse
arquivo cifrado e tentar quebrar a senha mestra offline (sem limite de
tentativas imposto pelo SecPass, já que isso aconteceria fora do
Aplicativo). Por isso o Aplicativo recomenda ativar a verificação em duas
etapas nessas contas antes de ligar a sincronização. Desativar a
sincronização a qualquer momento não apaga a cópia já enviada
anteriormente para a nuvem — use as configurações da sua própria conta
Google/Apple, ou a função de exclusão de conta (Seção 5), para isso.

## 3. O que o Aplicativo NÃO faz

- Não coleta dados analíticos ou de uso (cliques, navegação, publicidade).
- Não usa SDKs de publicidade ou rastreamento de terceiros.
- Não possui backend ou banco de dados próprio na nuvem para o cofre do
  usuário — quando a sincronização está ativa (Seção 2.6), o
  armazenamento é sempre na conta Google/Apple do próprio usuário, nunca
  em infraestrutura do desenvolvedor.
- Não compartilha, vende ou transfere itens do cofre a terceiros — o
  conteúdo do cofre **em texto claro** nunca deixa o dispositivo, mesmo
  quando a sincronização opcional está ativa (só o cofre cifrado é
  transmitido, e só para a própria conta do usuário). O único outro dado
  que sai do aparelho é o relatório técnico de erro descrito na Seção 2.5.

## 4. Backup exportado pelo usuário

O Aplicativo oferece uma função opcional de "Exportar" que gera um arquivo
cifrado (mesmo algoritmo do cofre local) e o entrega ao **sistema de
compartilhamento nativo do seu aparelho** (para você salvar onde quiser:
Arquivos, e-mail, outro app, etc.). O SecPass não recebe, armazena nem tem
acesso a esse arquivo depois que ele é compartilhado — o controle sobre onde
ele fica salvo é inteiramente seu. Proteja esse arquivo como protegeria sua
senha mestra.

## 5. Exclusão de conta e de dados

Você pode excluir sua conta local e todos os dados do cofre a qualquer
momento, diretamente no Aplicativo, pelo botão **"Excluir conta e todos os
dados"** (requer confirmação com sua senha de acesso — e, quando
disponível, biometria/Touch ID adicional — por ser uma ação irreversível).
Essa ação apaga: a conta, o cofre de credenciais e o histórico de eventos
de segurança armazenados localmente neste aparelho, **e também a cópia
cifrada do cofre na sua conta Google/iCloud, se a sincronização estava
ativa** — todos os outros aparelhos ainda conectados a essa sincronização
perdem acesso ao cofre remoto a partir desse momento. Desinstalar o
Aplicativo remove os dados armazenados localmente por ele no dispositivo,
mas **não apaga** uma cópia sincronizada que já esteja na sua conta
Google/iCloud — para isso, use "Excluir conta e todos os dados" antes de
desinstalar, ou remova o arquivo diretamente pela sua conta Google/Apple.

Relatórios de erro já enviados ao Sentry antes da exclusão (Seção 2.5) não
contêm dados do cofre e seguem a política de retenção do próprio Sentry.

## 6. Perda de dados e recuperação de senha

Como não existe backend do desenvolvedor guardando sua senha, **o
desenvolvedor do SecPass não tem como recuperar sua senha mestra nem seu
cofre**. Se você esquecer a senha e recriar a conta local (fluxo "Esqueci
minha senha"), o cofre salvo com a senha anterior se torna inacessível
neste aparelho — a menos que você tenha um backup exportado previamente
(Seção 4), ou que outro aparelho seu ainda tenha a sessão aberta com a
senha antiga e a sincronização ativa (nesse caso, o cofre sincronizado
continua intacto e acessível a partir daquele outro aparelho).

## 7. Seus direitos sobre os dados

Todo o processamento e toda a decisão de compartilhar dados (ativar ou não
a sincronização, com qual conta) acontece localmente, sob seu controle
direto — sem depender de pedidos ao desenvolvedor, que nunca tem acesso ao
conteúdo do seu cofre em nenhum cenário. Ainda assim, para fins de
conformidade legal:

- **LGPD (Lei nº 13.709/2018, Brasil)**: os direitos do titular previstos no
  art. 18 (acesso, correção, exclusão, portabilidade) são exercidos
  diretamente no Aplicativo — visualizar/editar itens do cofre, usar
  "Exportar" para portabilidade e "Excluir conta e todos os dados" para
  eliminação (incluindo a cópia sincronizada, quando aplicável). O
  desenvolvedor não trata dados do titular fora do dispositivo do titular
  ou da própria conta Google/Apple do titular.
- **GDPR (Regulamento UE 2016/679)**: para usuários no Espaço Econômico
  Europeu, a base legal de tratamento é a execução do próprio Aplicativo a
  pedido do usuário (art. 6(1)(b)), com processamento restrito ao
  dispositivo do usuário e, quando a sincronização é ativada por escolha
  do usuário, à conta de nuvem do próprio usuário ("privacy by
  design/by default", art. 25) — nesse caso, Google/Apple processam
  apenas um blob cifrado, sem acesso ao conteúdo. Os direitos de acesso,
  retificação, apagamento e portabilidade (arts. 15–20) são exercidos
  localmente, pelas funções descritas acima.
- **CCPA/CPRA (Califórnia, EUA)**: o desenvolvedor não vende nem
  compartilha informações pessoais. Os relatórios técnicos de erro
  enviados ao Sentry (Seção 2.5) não constituem venda ou compartilhamento
  de informação pessoal, pois não identificam o usuário.

Caso deseje contato formal sobre esses direitos ainda assim, use o e-mail
na Seção 12 — mas note que, por não haver dados do cofre no lado do
desenvolvedor (inclusive quando sincronizados, já que ficam na conta do
próprio usuário), não há registro remoto do conteúdo do cofre a ser
consultado, corrigido ou apagado pelo desenvolvedor.

## 8. Menores de idade / COPPA

O SecPass não é direcionado a crianças, não possui conteúdo destinado a
menores de 13 anos e não coleta intencionalmente (nem de forma alguma)
dados de nenhum usuário, incluindo menores — em conformidade com o
espírito da COPPA (EUA) e legislações equivalentes. Ainda assim, o uso do
Aplicativo por menores deve seguir a legislação local aplicável e, quando
exigido, supervisão de um responsável.

## 9. Segurança

Nenhum sistema é 100% invulnerável. O SecPass usa práticas reconhecidas de
mercado (PBKDF2 com 600.000 iterações, AES-256-GCM, armazenamento seguro
do sistema operacional, bloqueio progressivo contra tentativas de força
bruta), mas isso não constitui garantia absoluta contra qualquer forma de
acesso não autorizado ao seu dispositivo ou à sua conta Google/Apple,
quando a sincronização estiver ativa.

## 10. Declarações para as lojas de aplicativos

Para preencher os formulários de privacidade exigidos na submissão, com
base no funcionamento atual do Aplicativo:

**Apple App Store — App Privacy ("Nutrition Label")**: declarar a categoria
"Diagnostics" → "Crash Data" e "Performance Data" como coletada, com
finalidade "App Functionality" e **"Data Not Linked to You"** (o Sentry
está configurado sem PII). Quando a sincronização iCloud/Google Drive
estiver habilitada no build submetido, também é necessário declarar
"User Content" (ex.: "Other User Content") com finalidade "App
Functionality", tipicamente como **"Data Linked to You"** mas **não usada
para rastreamento** — mesmo sendo apenas um blob cifrado, a Apple pede
essa declaração sempre que qualquer conteúdo do usuário é transmitido para
fora do dispositivo, ainda que para a própria conta do usuário. Revisar
esta seção com atenção antes de cada submissão, já que a categorização
exata depende de qual(is) backend(s) de sincronização estão ativos no
build.

**Google Play — Data safety**: declarar em "App activity" → "Crash logs" e
"Diagnostics" como coletados, com finalidade "App functionality", **não
compartilhados com terceiros para publicidade**. Quando a sincronização
com Google Drive estiver habilitada, declarar também os dados do "cofre"
(credenciais) como coletados/processados com finalidade "App
functionality", marcando que os dados **não são compartilhados com
terceiros** (o armazenamento é na própria conta Google do usuário, não em
servidor do desenvolvedor) e como **criptografados em trânsito e em
repouso**.

> Reavalie estas declarações sempre que adicionar qualquer outro SDK de
> terceiros, analytics, novo backend de sincronização ou qualquer outra
> comunicação de rede ao Aplicativo — elas deixam de ser válidas nesse
> momento. Esta seção reflete o entendimento do desenvolvedor, não
> orientação jurídica ou da Apple/Google — confirme a categorização exata
> diretamente nas ferramentas de submissão de cada loja.

## 11. Alterações a esta política

Esta política pode ser atualizada para refletir mudanças no Aplicativo. A
data no topo deste documento indica a versão mais recente. Mudanças
relevantes serão comunicadas nas notas de versão do Aplicativo.

## 12. Contato

Dúvidas sobre esta política podem ser enviadas para:
**cortexistech@gmail.com**
