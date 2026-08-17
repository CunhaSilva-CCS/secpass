# Política de Privacidade do SecPass

Última atualização: 17 de agosto de 2026

Esta Política de Privacidade descreve como o aplicativo **SecPass** ("o
Aplicativo") trata dados ao ser usado em seu dispositivo iOS ou Android.

> **Aviso**: este documento foi redigido para refletir com precisão o
> funcionamento atual do Aplicativo. Ele não substitui aconselhamento
> jurídico. Antes de publicar nas lojas, recomenda-se revisão por um
> advogado, especialmente quanto a LGPD (Brasil), GDPR (UE) ou outras leis
> aplicáveis aos países onde o app será distribuído.

## 1. Resumo

O SecPass é um cofre de senhas que funciona **inteiramente no seu
dispositivo**. O Aplicativo não possui servidor próprio, não envia dados
para a internet e não compartilha informações com terceiros. Tudo o que
você cadastra fica armazenado, de forma criptografada, apenas no aparelho
em que o Aplicativo está instalado.

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

## 3. O que o Aplicativo NÃO faz

- Não coleta dados analíticos, de uso ou de diagnóstico.
- Não usa SDKs de publicidade, rastreamento ou métricas de terceiros.
- Não possui backend, API remota ou banco de dados na nuvem.
- Não compartilha, vende ou transfere dados a terceiros — porque nenhum
  dado deixa o dispositivo.

## 4. Backup exportado pelo usuário

O Aplicativo oferece uma função opcional de "Exportar" que gera um arquivo
cifrado (mesmo algoritmo do cofre local) e o entrega ao **sistema de
compartilhamento nativo do seu aparelho** (para você salvar onde quiser:
Arquivos, e-mail, outro app, etc.). O SecPass não recebe, armazena nem tem
acesso a esse arquivo depois que ele é compartilhado — o controle sobre onde
ele fica salvo é inteiramente seu. Proteja esse arquivo como protegeria sua
senha mestra.

## 5. Perda de dados e recuperação de senha

Como não existe backend, **o desenvolvedor do SecPass não tem como
recuperar sua senha mestra nem seu cofre**. Se você esquecer a senha e
recriar a conta local, o cofre salvo com a senha anterior se torna
permanentemente inacessível, a menos que você tenha um backup exportado
previamente. Ao desinstalar o Aplicativo, todos os dados armazenados
localmente são apagados pelo sistema operacional.

## 6. Menores de idade

O SecPass não é direcionado a crianças e não coleta intencionalmente dados
de menores, já que não coleta dados de ninguém. Ainda assim, o uso do
Aplicativo por menores deve seguir a legislação local aplicável e, quando
exigido, supervisão de um responsável.

## 7. Segurança

Nenhum sistema é 100% invulnerável. O SecPass usa práticas reconhecidas de
mercado (PBKDF2, AES-256, HMAC-SHA256, armazenamento seguro do sistema
operacional, bloqueio progressivo contra tentativas de força bruta), mas
isso não constitui garantia absoluta contra qualquer forma de acesso não
autorizado ao seu dispositivo.

## 8. Alterações a esta política

Esta política pode ser atualizada para refletir mudanças no Aplicativo. A
data no topo deste documento indica a versão mais recente. Mudanças
relevantes serão comunicadas nas notas de versão do Aplicativo.

## 9. Contato

Dúvidas sobre esta política podem ser enviadas para:
**clemilton.cunha.silva@gmail.com**
