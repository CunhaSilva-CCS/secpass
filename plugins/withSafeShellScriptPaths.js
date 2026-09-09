// Varios pacotes (o template base do React Native/Expo, o plugin do
// @sentry/react-native) geram fases de build do Xcode que resolvem o
// caminho de um script via substituicao de comando com backtick SEM
// aspas, tipo:
//
//   /bin/sh `"$NODE_BINARY" --print "require(...)"` `"$NODE_BINARY" --print "require(...)"`
//
// Isso funciona em qualquer caminho sem espaco, mas quebra (o path vira
// varios argumentos separados) quando o projeto vive num caminho com
// espaco - como ".../Google Drive/O meu disco/...". Nao da pra corrigir
// isso so com patch-package: o problema esta no ARQUIVO GERADO
// (ios/SecPass.xcodeproj/project.pbxproj), nao em node_modules, e esse
// arquivo e recriado do zero em todo `expo prebuild --clean`.
//
// Este plugin precisa rodar DEPOIS que o @sentry/react-native ja adicionou
// a fase "Upload Debug Symbols to Sentry" e reescreveu "Bundle React
// Native code and images" - senao essas fases nem existem ainda quando
// este codigo roda. IMPORTANTE sobre ordem: nos mods do tipo
// withXcodeProject, quem e listado DEPOIS no array `plugins` do app.json
// executa PRIMEIRO (cada withXcodeProject() empacota o anterior como
// "nextMod" e so chama nextMod() depois de rodar a propria acao - ver
// node_modules/@expo/config-plugins/build/plugins/withMod.js). Por isso
// este plugin fica ANTES do @sentry/react-native no app.json, nao depois
// (confirmado rodando `expo prebuild -p ios` de verdade e inspecionando
// o .pbxproj gerado - com este plugin depois do Sentry no array, a fase
// "Upload Debug Symbols to Sentry" nao aparecia ainda quando o codigo
// abaixo rodava).
//
// A correcao em si (envolver em aspas qualquer substituicao de comando
// via backtick que ainda esteja sem aspas) e idempotente por construcao
// (so mexe em quem ainda nao tem aspas, via lookbehind), entao a mesma
// regra da conta tanto do caso "nada foi corrigido ainda" quanto do caso
// "o patch em patches/@sentry+react-native+*.patch ja corrigiu a PROPRIA
// parte dele, falta so a parte original do react-native-xcode.sh que ele
// encapsulou". Confirmado empiricamente que envolver o backtick inteiro
// em aspas duplas funciona mesmo quando o conteudo de dentro do backtick
// tem suas proprias aspas duplas (`` `"$NODE_BINARY" --print "..."` ``) -
// o shell resolve a substituicao de comando antes de reavaliar aspas.
//
// Ver a auditoria de seguranca desta sessao para o historico completo de
// como esses bugs foram encontrados (Bundle React Native code and images
// / Upload Debug Symbols to Sentry).
const { withXcodeProject } = require("@expo/config-plugins");

// So envolve em aspas um backtick que AINDA nao esta imediatamente
// precedido de `"` - roda de novo sobre um script ja corrigido e nao
// muda nada (idempotente), sem acumular aspas.
const UNQUOTED_BACKTICK_PATTERN = /(?<!")`([^`]+)`/g;

const applyFixes = (script) =>
  script.replace(UNQUOTED_BACKTICK_PATTERN, (_match, inner) => `"\`${inner}\`"`);

module.exports = function withSafeShellScriptPaths(config) {
  return withXcodeProject(config, (config) => {
    const project = config.modResults;
    const phases =
      project.hash?.project?.objects?.PBXShellScriptBuildPhase || {};

    for (const key of Object.keys(phases)) {
      const phase = phases[key];
      if (!phase || typeof phase.shellScript !== "string") {
        continue;
      }

      // Uma fase que ja existia no arquivo .pbxproj (ex: "Bundle React
      // Native code and images", que vem do template base) guarda
      // shellScript como uma string JSON-escapada (foi lida assim do
      // arquivo serializado). Uma fase criada em tempo de execucao por
      // outro plugin nesta MESMA passada (ex: "Upload Debug Symbols to
      // Sentry", via xcodeProject.addBuildPhase - so e serializada pro
      // formato .pbxproj no final de toda a cadeia de mods) guarda o
      // texto puro, sem escapar. Trata os dois casos.
      let script;
      let isJsonEncoded = true;
      try {
        script = JSON.parse(phase.shellScript);
      } catch {
        isJsonEncoded = false;
        script = phase.shellScript;
      }

      const patched = applyFixes(script);
      if (patched !== script) {
        phase.shellScript = isJsonEncoded ? JSON.stringify(patched) : patched;
      }
    }

    return config;
  });
};

module.exports.applyFixes = applyFixes;
