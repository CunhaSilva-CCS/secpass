# Política de Privacidade do SecPass

Última atualização: 4 de setembro de 2026

Esta Política de Privacidade descreve como o aplicativo **SecPass** ("o
Aplicativo") trata dados ao ser usado em seu dispositivo iOS ou Android.

> **Aviso**: este documento foi redigido para refletir com precisão o
> funcionamento atual do Aplicativo. Ele não substitui aconselhamento
> jurídico. Antes de publicar nas lojas, recomenda-se revisão por um
> advogado, especialmente quanto a LGPD (Brasil), GDPR (UE) ou outras leis
> aplicáveis aos países onde o app será distribuído.

## 1. Resumo

O SecPass é um cofre de senhas que funciona **inteiramente no seu
dispositivo**. O Aplicativo não possui servidor próprio e não compartilha
o conteúdo do seu cofre com terceiros. Tudo o que você cadastra fica
armazenado, de forma criptografada, apenas no aparelho em que o Aplicativo
está instalado. A única exceção é o envio automático de relatórios técnicos
de erro (sem senhas ou dados do cofre) para diagnóstico — ver Seção 2.5.

## 2. Quais dados o Aplicativo processa

### 2.1 Dados que você cadastra

- **Conta local de acesso**: e-mail (usado apenas como identificador local)
  e senha mestra.
- **Itens do cofre**: título, usuário e senha de cada credencial que você
  adiciona.

Esses dados **nunca são transmitidos** para o desenvolvedor do SecPass, para
servidores externos ou para qualquer terceiro. Não existe conta em nuvem,
sincronização remota ou backup automático fora do dispositivo.

### 2.2 Como esses dados são armazenados

- A senha mestra nunca é salva em texto puro: é transformada com PBKDF2-SHA256
  (310.000 iterações) antes de ser gravada.
- O cofre de credenciais é cifrado com AES-256-CBC e autenticado com
  HMAC-SHA256, usando uma chave derivada da sua senha mestra.
- Os dados cifrados ficam no armazenamento seguro do sistema operacional
  (Keychain no iOS, Keystore no Android, via `expo-secure-store`), protegidos
  por autenticação obrigatória do aparelho.

### 2.3 Autenticação biométrica

O SecPass pode usar Face ID, Touch ID ou biometria do Android para
desbloquear o cofre. Essa autenticação é processada inteiramente pelo
sistema operacional do seu aparelho: **o Aplicativo nunca recebe, acessa ou
armazena seus dados biométricos brutos** (impressão digital, face). O
Aplicativo apenas recebe um resultado de "autenticado" ou "não autenticado"
do sistema operacional.

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

## 3. O que o Aplicativo NÃO faz

- Não coleta dados analíticos ou de uso (cliques, navegação, publicidade).
- Não usa SDKs de publicidade ou rastreamento de terceiros.
- Não possui backend ou banco de dados na nuvem para o cofre do usuário.
- Não compartilha, vende ou transfere itens do cofre a terceiros — o
  conteúdo do cofre nunca deixa o dispositivo. O único dado que sai do
  aparelho é o relatório técnico de erro descrito na Seção 2.5.

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
dados"** (requer autenticação biométrica e confirmação, por ser uma ação
irreversível). Essa ação apaga localmente: a conta, o cofre de credenciais,
a sessão salva, o histórico de tentativas de login e o registro de eventos
de segurança. Desinstalar o Aplicativo também remove todos os dados
armazenados por ele no dispositivo.

Como nenhum dado do cofre é enviado a servidores, não existe cópia remota
do seu cofre a ser apagada além da local — a exclusão no Aplicativo (ou a
desinstalação) já é completa e definitiva para o conteúdo do cofre.
Relatórios de erro já enviados ao Sentry antes da exclusão (Seção 2.5) não
contêm dados do cofre e seguem a política de retenção do próprio Sentry.

## 6. Perda de dados e recuperação de senha

Como não existe backend, **o desenvolvedor do SecPass não tem como
recuperar sua senha mestra nem seu cofre**. Se você esquecer a senha e
recriar a conta local, o cofre salvo com a senha anterior se torna
permanentemente inacessível, a menos que você tenha um backup exportado
previamente.

## 7. Seus direitos sobre os dados

Como todo o processamento acontece localmente, no seu próprio dispositivo,
você já detém controle direto e imediato sobre seus dados — sem depender
de pedidos ao desenvolvedor. Ainda assim, para fins de conformidade legal:

- **LGPD (Lei nº 13.709/2018, Brasil)**: os direitos do titular previstos no
  art. 18 (acesso, correção, exclusão, portabilidade) são exercidos
  diretamente no Aplicativo — visualizar/editar itens do cofre, usar
  "Exportar" para portabilidade e "Excluir conta e todos os dados" para
  eliminação. Não há dado tratado por este desenvolvedor fora do
  dispositivo do titular.
- **GDPR (Regulamento UE 2016/679)**: para usuários no Espaço Econômico
  Europeu, a base legal de tratamento é a execução do próprio Aplicativo a
  pedido do usuário (art. 6(1)(b)), com processamento restrito ao
  dispositivo do usuário ("privacy by design/by default", art. 25). Os
  direitos de acesso, retificação, apagamento e portabilidade (arts.
  15–20) são exercidos localmente, pelas funções descritas acima.
- **CCPA/CPRA (Califórnia, EUA)**: o desenvolvedor não vende nem
  compartilha informações pessoais. Os relatórios técnicos de erro
  enviados ao Sentry (Seção 2.5) não constituem venda ou compartilhamento
  de informação pessoal, pois não identificam o usuário.

Caso deseje contato formal sobre esses direitos ainda assim, use o e-mail
na Seção 12 — mas note que, por não haver dados no lado do desenvolvedor,
não há registro remoto para consultar, corrigir ou apagar.

## 8. Menores de idade / COPPA

O SecPass não é direcionado a crianças, não possui conteúdo destinado a
menores de 13 anos e não coleta intencionalmente (nem de forma alguma)
dados de nenhum usuário, incluindo menores — em conformidade com o
espírito da COPPA (EUA) e legislações equivalentes. Ainda assim, o uso do
Aplicativo por menores deve seguir a legislação local aplicável e, quando
exigido, supervisão de um responsável.

## 9. Segurança

Nenhum sistema é 100% invulnerável. O SecPass usa práticas reconhecidas de
mercado (PBKDF2, AES-256, HMAC-SHA256, armazenamento seguro do sistema
operacional, bloqueio progressivo contra tentativas de força bruta), mas
isso não constitui garantia absoluta contra qualquer forma de acesso não
autorizado ao seu dispositivo.

## 10. Declarações para as lojas de aplicativos

Para preencher os formulários de privacidade exigidos na submissão, com
base no funcionamento atual do Aplicativo:

**Apple App Store — App Privacy ("Nutrition Label")**: declarar a categoria
"Diagnostics" → "Crash Data" e "Performance Data" como coletada, com
finalidade "App Functionality" e **"Data Not Linked to You"** (o Sentry
está configurado sem PII — sem e-mail, nome ou identificador de usuário).
Todas as demais categorias (informações de contato, financeiras,
localização, conteúdo do usuário, etc.) continuam como não coletadas,
pois o cofre nunca deixa o dispositivo.

**Google Play — Data safety**: declarar em "App activity" → "Crash logs" e
"Diagnostics" como coletados, com finalidade "App functionality", **não
compartilhados com terceiros para publicidade** (o Sentry recebe os dados
como processador, não como parceiro de anúncio) e marcar "Data is
encrypted in transit" como aplicável para esse tráfego (o Sentry usa
HTTPS). Todas as demais categorias (senhas, informações pessoais,
financeiras, localização etc.) continuam como não coletadas.

> Reavalie estas declarações sempre que adicionar qualquer outro SDK de
> terceiros, analytics ou comunicação de rede ao Aplicativo além do
> Sentry — elas deixam de ser válidas nesse momento.

## 11. Alterações a esta política

Esta política pode ser atualizada para refletir mudanças no Aplicativo. A
data no topo deste documento indica a versão mais recente. Mudanças
relevantes serão comunicadas nas notas de versão do Aplicativo.

## 12. Contato

Dúvidas sobre esta política podem ser enviadas para:
**cortexistech@gmail.com**
