// Injeta a assinatura de release real no android/app/build.gradle gerado
// pelo `expo prebuild` - esse arquivo nao e versionado (android/ esta no
// .gitignore, e regenerado do zero), entao editar ele na mao nao sobrevive
// a uma regeneracao. Sem este plugin, o template padrao do Expo assina o
// build de release com o keystore de debug (publico, o mesmo em todo
// projeto Android do mundo) - inaceitavel pra distribuicao real.
//
// Le as credenciais de credentials/keystore.properties (fora de
// versionamento, ver .gitignore) - se o arquivo nao existir (clone novo sem
// o keystore real, CI sem os segredos), o plugin nao mexe em nada e o build
// de release continua caindo no keystore de debug do template, sem quebrar
// quem so quer rodar localmente.
const fs = require("fs");
const path = require("path");
const { withAppBuildGradle } = require("@expo/config-plugins");

function readKeystoreProperties(projectRoot) {
  const propsPath = path.join(
    projectRoot,
    "credentials",
    "keystore.properties",
  );
  if (!fs.existsSync(propsPath)) {
    return null;
  }

  const raw = fs.readFileSync(propsPath, "utf8");
  const props = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }
    props[trimmed.slice(0, separatorIndex).trim()] = trimmed
      .slice(separatorIndex + 1)
      .trim();
  }
  return props;
}

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (config) => {
    const props = readKeystoreProperties(config.modRequest.projectRoot);
    if (!props || !props.storeFile) {
      return config;
    }

    const keystoreAbsolutePath = path
      .join(config.modRequest.projectRoot, "credentials", props.storeFile)
      .replace(/\\/g, "\\\\");

    let contents = config.modResults.contents;

    const signingConfigsRegex =
      /(signingConfigs\s*\{\s*debug\s*\{[^}]*\}\s*)\}/;
    if (!signingConfigsRegex.test(contents)) {
      throw new Error(
        "withReleaseSigning: nao encontrou o bloco signingConfigs.debug esperado em android/app/build.gradle - o template do Expo pode ter mudado, revise o plugin.",
      );
    }
    contents = contents.replace(
      signingConfigsRegex,
      `$1
        release {
            storeFile file('${keystoreAbsolutePath}')
            storePassword '${props.storePassword}'
            keyAlias '${props.keyAlias}'
            keyPassword '${props.keyPassword}'
        }
    }`,
    );

    const releaseSigningLineRegex =
      /(\/\/ see https:\/\/reactnative\.dev\/docs\/signed-apk-android\.\s*\n\s*signingConfig )signingConfigs\.debug/;
    if (!releaseSigningLineRegex.test(contents)) {
      throw new Error(
        "withReleaseSigning: nao encontrou a linha 'signingConfig signingConfigs.debug' do buildType release - o template do Expo pode ter mudado, revise o plugin.",
      );
    }
    contents = contents.replace(
      releaseSigningLineRegex,
      "$1signingConfigs.release",
    );

    config.modResults.contents = contents;
    return config;
  });
};
