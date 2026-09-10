// Registra o esquema de URL usado no redirecionamento OAuth do Google no
// Android (ver src/services/driveAuth.js) como um intent-filter na
// MainActivity, pra expo-web-browser (openAuthSessionAsync) conseguir
// capturar a volta do navegador.
//
// Reaproveita o mesmo client OAuth "iOS" ja usado pelo Google Sign-In
// nativo no iPhone (ver googleIosClientId em app.json/extra) - nao e um
// client "Android" novo de proposito: o fluxo nativo do Android
// (GoogleSignin.signIn + requestScopes) falha de forma consistente e
// reproduzida em 4 certificados diferentes ao pedir o escopo sensivel
// drive.appdata (ver discussao/investigacao no historico do projeto -
// bate com relatos de terceiros de que escopos sensiveis via SDK nativo
// Android exigem instalacao via Play Store, algo que nao temos como
// testar/depender agora). Um fluxo OAuth por navegador (o mesmo principio
// que o app desktop ja usa com sucesso) nao depende desse mecanismo.
const { withAndroidManifest } = require("@expo/config-plugins");

const REDIRECT_SCHEME =
  "com.googleusercontent.apps.114456559466-ko4p814or855id67eb000i5ipjojdtrr";

module.exports = function withAndroidGoogleOAuthRedirect(config) {
  return withAndroidManifest(config, (config) => {
    const application = config.modResults.manifest.application?.[0];
    const mainActivity = application?.activity?.find(
      (activity) => activity.$["android:name"] === ".MainActivity",
    );

    if (!mainActivity) {
      return config;
    }

    mainActivity["intent-filter"] = mainActivity["intent-filter"] || [];

    const alreadyRegistered = mainActivity["intent-filter"].some((filter) =>
      filter.data?.some((data) => data.$["android:scheme"] === REDIRECT_SCHEME),
    );
    if (alreadyRegistered) {
      return config;
    }

    mainActivity["intent-filter"].push({
      action: [{ $: { "android:name": "android.intent.action.VIEW" } }],
      category: [
        { $: { "android:name": "android.intent.category.DEFAULT" } },
        { $: { "android:name": "android.intent.category.BROWSABLE" } },
      ],
      data: [{ $: { "android:scheme": REDIRECT_SCHEME } }],
    });

    return config;
  });
};
