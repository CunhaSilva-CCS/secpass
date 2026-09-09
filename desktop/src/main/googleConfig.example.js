// Copie este arquivo para googleConfig.js (gitignored) e preencha com o
// Client ID/Secret de um OAuth Client tipo "Aplicativo para computador"
// criado no mesmo projeto Google Cloud usado pelo Android - ver README.md
// deste diretorio.
//
// O client secret de um cliente tipo Desktop nao e tratado como
// confidencial pelo proprio Google (fluxo "installed app" do RFC 8252 -
// e esperado que fique embutido no binario do app instalado). Mesmo assim
// so e usado aqui no processo principal do Electron, nunca exposto ao
// renderer, e o arquivo preenchido fica fora do controle de versao.
export const GOOGLE_DESKTOP_CLIENT_ID = "";
export const GOOGLE_DESKTOP_CLIENT_SECRET = "";
