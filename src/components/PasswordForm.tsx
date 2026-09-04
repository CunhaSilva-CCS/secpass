import { useState } from "react";
import { Feather } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { SENSITIVE_TEXT_INPUT_PROPS } from "../utils/sensitiveInput";

type FormTheme = {
  card: string;
  cardSoft: string;
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  primary: string;
  primaryText: string;
  secondaryButton: string;
  secondaryText: string;
};

type PasswordFormProps = {
  title: string;
  username: string;
  password: string;
  onTitleChange: (value: string) => void;
  onUsernameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onGenerate: () => void;
  onSave: () => void;
  theme?: FormTheme;
};

const defaultTheme: FormTheme = {
  card: "#FFFFFF", cardSoft: "#F3F7FD", border: "#D7E2F3", borderStrong: "#C7D7EE",
  text: "#0E1B2E", textMuted: "#66798F", primary: "#215FCC", primaryText: "#FFFFFF",
  secondaryButton: "#E6EEFC", secondaryText: "#183C7A",
};

export default function PasswordForm({
  title, username, password, onTitleChange, onUsernameChange, onPasswordChange,
  onGenerate, onSave, theme = defaultTheme,
}: PasswordFormProps) {
  const [showPassword, setShowPassword] = useState(false);
  const inputStyle = [styles.input, { backgroundColor: theme.cardSoft, borderColor: theme.borderStrong, color: theme.text }];

  return (
    <View style={styles.container}>
      <Text style={[styles.sectionTitle, { color: theme.text }]}>Nova credencial</Text>
      <TextInput placeholder="Titulo" placeholderTextColor={theme.textMuted} value={title} {...SENSITIVE_TEXT_INPUT_PROPS} onChangeText={onTitleChange} style={inputStyle} />
      <TextInput placeholder="Usuario" placeholderTextColor={theme.textMuted} value={username} {...SENSITIVE_TEXT_INPUT_PROPS} onChangeText={onUsernameChange} style={inputStyle} />
      <View style={[styles.passwordInputWrap, { backgroundColor: theme.cardSoft, borderColor: theme.borderStrong }]}>
        <TextInput placeholder="Senha" placeholderTextColor={theme.textMuted} value={password} {...SENSITIVE_TEXT_INPUT_PROPS} secureTextEntry={!showPassword} onChangeText={onPasswordChange} style={[styles.passwordInput, { color: theme.text }]} />
        <Pressable onPress={() => setShowPassword((value) => !value)} accessibilityRole="button" accessibilityLabel={showPassword ? "Ocultar senha" : "Mostrar senha"} style={styles.visibilityButton}>
          <Feather name={showPassword ? "eye-off" : "eye"} size={18} color={theme.textMuted} />
        </Pressable>
      </View>
      <View style={styles.actions}>
        <Pressable style={({ pressed }) => [styles.generateButton, { backgroundColor: theme.secondaryButton }, pressed && styles.pressed]} onPress={onGenerate}>
          <Text style={[styles.generateText, { color: theme.secondaryText }]}>Gerar senha</Text>
        </Pressable>
        <Pressable style={({ pressed }) => [styles.saveButton, { backgroundColor: theme.primary }, pressed && styles.pressed]} onPress={onSave}>
          <Text style={[styles.saveText, { color: theme.primaryText }]}>Salvar</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 2 }, sectionTitle: { fontSize: 16, fontWeight: "700", marginBottom: 12 },
  input: { borderWidth: 1, paddingVertical: 13, paddingHorizontal: 14, borderRadius: 12, fontSize: 15, marginBottom: 10 },
  passwordInputWrap: { borderWidth: 1, borderRadius: 12, flexDirection: "row", alignItems: "center", minHeight: 50, marginBottom: 10 },
  passwordInput: { flex: 1, paddingVertical: 13, paddingHorizontal: 14, fontSize: 15 },
  visibilityButton: { minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center" },
  actions: { marginTop: 4, flexDirection: "row", gap: 10 },
  generateButton: { flex: 1, borderRadius: 12, alignItems: "center", justifyContent: "center", paddingVertical: 12 },
  saveButton: { flex: 1, borderRadius: 12, alignItems: "center", justifyContent: "center", paddingVertical: 12 },
  generateText: { fontWeight: "700", fontSize: 14 }, saveText: { fontWeight: "700", fontSize: 14 },
  pressed: { opacity: 0.9, transform: [{ scale: 0.98 }] },
});