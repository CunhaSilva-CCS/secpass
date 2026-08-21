// Impede que iOS/Android Autofill capture senha mestra ou credenciais do
// cofre e as copie para o gerenciador de senhas do sistema.
export const SENSITIVE_TEXT_INPUT_PROPS = {
  autoCapitalize: "none",
  autoCorrect: false,
  autoComplete: "off",
  importantForAutofill: "no",
  textContentType: "none",
  spellCheck: false,
};
