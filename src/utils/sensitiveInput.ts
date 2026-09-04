import type { TextInputProps } from "react-native";

export const SENSITIVE_TEXT_INPUT_PROPS: Pick<
  TextInputProps,
  | "autoCapitalize"
  | "autoCorrect"
  | "autoComplete"
  | "importantForAutofill"
  | "textContentType"
  | "spellCheck"
> = {
  autoCapitalize: "none",
  autoCorrect: false,
  autoComplete: "off",
  importantForAutofill: "no",
  textContentType: "none",
  spellCheck: false,
};