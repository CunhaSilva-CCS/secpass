import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { SENSITIVE_TEXT_INPUT_PROPS } from "../utils/sensitiveInput";

const defaultTheme = {
  card: "#FFFFFF",
  cardSoft: "#F5F8FC",
  border: "#DCE5F3",
  borderStrong: "#D9E3F2",
  text: "#0D1B2A",
  textMuted: "#74849C",
  primary: "#0C66E4",
  primaryText: "#FFFFFF",
  secondaryButton: "#E8EFFA",
  secondaryText: "#123462",
};

export default function PasswordForm({
  title,
  username,
  password,
  onTitleChange,
  onUsernameChange,
  onPasswordChange,
  onGenerate,
  onSave,
  theme = defaultTheme,
}) {
  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.card, borderColor: theme.border },
      ]}
    >
      <Text style={[styles.sectionTitle, { color: theme.text }]}>
        Nova credencial
      </Text>

      <TextInput
        placeholder="Titulo"
        placeholderTextColor={theme.textMuted}
        value={title}
        {...SENSITIVE_TEXT_INPUT_PROPS}
        onChangeText={onTitleChange}
        style={[
          styles.input,
          {
            backgroundColor: theme.cardSoft,
            borderColor: theme.borderStrong,
            color: theme.text,
          },
        ]}
      />

      <TextInput
        placeholder="Usuario"
        placeholderTextColor={theme.textMuted}
        value={username}
        {...SENSITIVE_TEXT_INPUT_PROPS}
        onChangeText={onUsernameChange}
        style={[
          styles.input,
          {
            backgroundColor: theme.cardSoft,
            borderColor: theme.borderStrong,
            color: theme.text,
          },
        ]}
      />

      <TextInput
        placeholder="Senha"
        placeholderTextColor={theme.textMuted}
        value={password}
        {...SENSITIVE_TEXT_INPUT_PROPS}
        secureTextEntry
        onChangeText={onPasswordChange}
        style={[
          styles.input,
          {
            backgroundColor: theme.cardSoft,
            borderColor: theme.borderStrong,
            color: theme.text,
          },
        ]}
      />

      <View style={styles.actions}>
        <Pressable
          style={({ pressed }) => [
            styles.generateButton,
            { backgroundColor: theme.secondaryButton },
            pressed && styles.pressed,
          ]}
          onPress={onGenerate}
        >
          <Text style={[styles.generateText, { color: theme.secondaryText }]}>
            Gerar senha
          </Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.saveButton,
            { backgroundColor: theme.primary },
            pressed && styles.pressed,
          ]}
          onPress={onSave}
        >
          <Text style={[styles.saveText, { color: theme.primaryText }]}>
            Salvar
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    elevation: 3,
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 12,
  },
  input: {
    borderWidth: 1,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 12,
    fontSize: 15,
    marginBottom: 10,
  },
  actions: {
    marginTop: 4,
    flexDirection: "row",
    gap: 10,
  },
  generateButton: {
    flex: 1,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },
  saveButton: {
    flex: 1,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },
  generateText: {
    fontWeight: "700",
    fontSize: 14,
  },
  saveText: {
    fontWeight: "700",
    fontSize: 14,
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
});
