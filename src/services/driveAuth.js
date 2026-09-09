// Autenticacao Google via SDK nativo (Play Services no Android,
// GoogleSignIn nativo no iOS), usada so para o escopo drive.appdata: o
// token nunca da acesso ao Drive visivel do usuario, so a pasta oculta do
// proprio app. Diferente de um fluxo OAuth generico via navegador, esse
// SDK valida o app pelo cliente OAuth ja registrado no Google Cloud
// Console (pacote+assinatura no Android, bundle id no iOS), sem precisar
// de redirect_uri - por isso funciona onde AuthSession genérico nao
// funciona no tipo de cliente "Android"/"iOS".
//
// A sessao (incluindo o refresh do access token) fica sob gestao do SDK
// nativo - nao guardamos tokens no SecureStore aqui, so consultamos
// hasPreviousSignIn()/getTokens() quando precisamos de um token valido.
import { Platform } from "react-native";
import Constants from "expo-constants";
import { GoogleSignin } from "@react-native-google-signin/google-signin";

const DRIVE_APPDATA_SCOPE = "https://www.googleapis.com/auth/drive.appdata";

// Fallback fixo: em builds fora do fluxo padrao do EAS (ex: `expo run:ios`
// direto, sem dev-launcher), o modulo nativo que expo-constants usa pra
// entregar o manifesto (EXDevLauncher) pode nao existir, deixando
// Constants.expoConfig vazio mesmo com o Metro servindo a config
// corretamente. O client ID do Google e um identificador publico (nao e
// segredo), entao usar um valor fixo como reserva aqui e seguro e evita
// depender de um mecanismo de manifesto fragil so pra entregar esse unico
// valor. Mantido sincronizado manualmente com app.json (expo.extra.googleIosClientId).
const GOOGLE_IOS_CLIENT_ID_FALLBACK =
  "114456559466-ko4p814or855id67eb000i5ipjojdtrr.apps.googleusercontent.com";

let isConfigured = false;
const ensureConfigured = () => {
  if (isConfigured) {
    return;
  }

  const iosClientId =
    Constants.expoConfig?.extra?.googleIosClientId || GOOGLE_IOS_CLIENT_ID_FALLBACK;
  try {
    GoogleSignin.configure({
      scopes: [DRIVE_APPDATA_SCOPE],
      ...(Platform.OS === "ios" ? { iosClientId } : {}),
    });
    isConfigured = true;
  } catch {
    // Configuracao ausente/invalida - trata
    // como "Drive indisponivel neste aparelho" em vez de derrubar o app;
    // quem chama (isDriveSignedIn/getValidAccessToken) ja trata ausencia de
    // sessao como sync indisponivel, nunca como erro fatal do cofre local.
  }
};

// Inicia o fluxo interativo (tela nativa de escolha de conta Google). So
// deve ser chamado a partir de uma acao explicita do usuario (botao
// "Ativar sincronizacao" / "Ja uso o SecPass em outro aparelho"), nunca
// automaticamente no boot do app.
export const signInWithGoogleDrive = async () => {
  ensureConfigured();

  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const result = await GoogleSignin.signIn();

    if (result.type !== "success") {
      return { success: false, cancelled: true };
    }

    return { success: true, cancelled: false };
  } catch {
    throw new Error("Falha ao autenticar com o Google.");
  }
};

// Devolve um access token valido para o escopo drive.appdata, ou null se
// nunca autenticou ou se a sessao nao pode ser renovada (ex: usuario
// revogou acesso na conta Google) - quem chama trata isso como "sync
// indisponivel", nunca como erro fatal do cofre local.
export const getValidAccessToken = async () => {
  ensureConfigured();

  if (!isConfigured || !GoogleSignin.hasPreviousSignIn()) {
    return null;
  }

  try {
    await GoogleSignin.signInSilently();
    const { accessToken } = await GoogleSignin.getTokens();
    return accessToken || null;
  } catch {
    return null;
  }
};

export const isDriveSignedIn = async () => {
  ensureConfigured();
  if (!isConfigured) {
    return false;
  }
  return GoogleSignin.hasPreviousSignIn();
};

export const signOutDrive = async () => {
  try {
    await GoogleSignin.signOut();
  } catch {
    // Best-effort: pior caso a sessao fica ativa ate a proxima tentativa.
  }
};
