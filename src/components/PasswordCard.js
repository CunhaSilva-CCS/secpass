import * as Clipboard from "expo-clipboard";
import { useEffect, useState } from "react";
import {
  Alert,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { authenticateVaultAccess } from "../utils/biometricAuth";

const CLIPBOARD_CLEAR_MS = 30000;

const defaultTheme = {
  card: "#FFFFFF",
  border: "#DCE5F3",
  text: "#0D1B2A",
  textMuted: "#6B7A90",
  accent: "#0C66E4",
  accentSoft: "#E6F0FF",
  secondaryButton: "#E8EFFA",
  secondaryText: "#123462",
  dangerSoft: "#FDECEC",
  dangerText: "#B42318",
  successSoft: "#E8F7ED",
  successText: "#1E7A3F",
};

export default function PasswordCard({
  item,
  onDelete,
  onUpdate,
  index = 0,
  theme = defaultTheme,
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(item.title);
  const [editUsername, setEditUsername] = useState(item.username);
  const [editPassword, setEditPassword] = useState(item.password);
  const [appear] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(appear, {
      toValue: 1,
      duration: 380,
      delay: Math.min(index * 70, 420),
      useNativeDriver: false,
    }).start();
  }, [appear, index]);

  const authenticateSensitiveAction = async () => {
    try {
      const authResult = await authenticateVaultAccess();

      if (!authResult.success) {
        if (authResult.error === "user_cancel") {
          return false;
        }

        Alert.alert(
          "Autenticacao indisponivel",
          "Ative Face ID, Touch ID ou uma senha de bloqueio no aparelho para acessar o cofre.",
        );
        return false;
      }

      return true;
    } catch {
      Alert.alert(
        "Falha na autenticacao",
        "Nao foi possivel validar sua identidade.",
      );
      return false;
    }
  };

  const handleCopy = async () => {
    const isAuthorized = await authenticateSensitiveAction();
    if (!isAuthorized) return;

    try {
      await Clipboard.setStringAsync(item.password);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);

      setTimeout(async () => {
        try {
          const currentClipboard = await Clipboard.getStringAsync();
          if (currentClipboard === item.password) {
            await Clipboard.setStringAsync("");
          }
        } catch {
          // Nao interrompe o fluxo se a limpeza automatica falhar.
        }
      }, CLIPBOARD_CLEAR_MS);
    } catch (_error) {
      Alert.alert(
        "Falha ao copiar",
        "Nao foi possivel copiar a senha no momento.",
      );
    }
  };

  const handleSaveEdit = () => {
    if (!editTitle.trim() || !editUsername.trim() || !editPassword.trim()) {
      Alert.alert("Campos obrigatorios", "Preencha titulo, usuario e senha.");
      return;
    }

    onUpdate(item.id, {
      title: editTitle.trim(),
      username: editUsername.trim(),
      password: editPassword,
    });
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditTitle(item.title);
    setEditUsername(item.username);
    setEditPassword(item.password);
    setIsEditing(false);
  };

  const handleTogglePassword = async () => {
    const isAuthorized = await authenticateSensitiveAction();
    if (!isAuthorized) return;

    setShowPassword((prev) => !prev);
  };

  const handleStartEdit = async () => {
    const isAuthorized = await authenticateSensitiveAction();
    if (!isAuthorized) return;

    setEditTitle(item.title);
    setEditUsername(item.username);
    setEditPassword(item.password);
    setIsEditing(true);
  };

  return (
    <Animated.View
      style={[
        styles.card,
        {
          backgroundColor: theme.card,
          borderColor: theme.border,
          opacity: appear,
          transform: [
            {
              translateY: appear.interpolate({
                inputRange: [0, 1],
                outputRange: [18, 0],
              }),
            },
          ],
        },
      ]}
    >
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: theme.text }]}>{item.title}</Text>
        <Text
          style={[
            styles.badge,
            { color: theme.accent, backgroundColor: theme.accentSoft },
          ]}
        >
          Salvo
        </Text>
      </View>

      {isEditing ? (
        <View style={styles.editWrapper}>
          <TextInput
            value={editTitle}
            onChangeText={setEditTitle}
            placeholder="Titulo"
            placeholderTextColor={theme.textMuted}
            style={[
              styles.editInput,
              {
                backgroundColor: theme.card,
                borderColor: theme.border,
                color: theme.text,
              },
            ]}
          />
          <TextInput
            value={editUsername}
            onChangeText={setEditUsername}
            placeholder="Usuario"
            placeholderTextColor={theme.textMuted}
            style={[
              styles.editInput,
              {
                backgroundColor: theme.card,
                borderColor: theme.border,
                color: theme.text,
              },
            ]}
          />
          <TextInput
            value={editPassword}
            onChangeText={setEditPassword}
            placeholder="Senha"
            placeholderTextColor={theme.textMuted}
            style={[
              styles.editInput,
              {
                backgroundColor: theme.card,
                borderColor: theme.border,
                color: theme.text,
              },
            ]}
          />
        </View>
      ) : (
        <>
          <View style={styles.infoBlock}>
            <Text style={[styles.label, { color: theme.textMuted }]}>
              Usuario
            </Text>
            <Text style={[styles.value, { color: theme.text }]}>
              {item.username}
            </Text>
          </View>

          <View style={styles.infoBlock}>
            <Text style={[styles.label, { color: theme.textMuted }]}>
              Senha
            </Text>
            <Text style={[styles.value, { color: theme.text }]}>
              {showPassword ? item.password : "••••••••••"}
            </Text>
          </View>
        </>
      )}

      <View style={styles.actions}>
        {isEditing ? (
          <>
            <Pressable
              style={({ pressed }) => [
                styles.secondaryButton,
                { backgroundColor: theme.secondaryButton },
                pressed && styles.pressed,
              ]}
              onPress={handleCancelEdit}
            >
              <Text
                style={[styles.secondaryText, { color: theme.secondaryText }]}
              >
                Cancelar
              </Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.secondaryButton,
                { backgroundColor: theme.successSoft },
                pressed && styles.pressed,
              ]}
              onPress={handleSaveEdit}
            >
              <Text
                style={[styles.secondaryText, { color: theme.successText }]}
              >
                Salvar edicao
              </Text>
            </Pressable>
          </>
        ) : (
          <>
            <Pressable
              style={({ pressed }) => [
                styles.secondaryButton,
                { backgroundColor: theme.secondaryButton },
                pressed && styles.pressed,
              ]}
              onPress={handleTogglePassword}
            >
              <Text
                style={[styles.secondaryText, { color: theme.secondaryText }]}
              >
                {showPassword ? "Ocultar senha" : "Mostrar senha"}
              </Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.secondaryButton,
                copied
                  ? { backgroundColor: theme.successSoft }
                  : { backgroundColor: theme.secondaryButton },
                pressed && styles.pressed,
              ]}
              onPress={handleCopy}
            >
              <Text
                style={[
                  styles.secondaryText,
                  copied
                    ? { color: theme.successText }
                    : { color: theme.secondaryText },
                ]}
              >
                {copied ? "Copiada" : "Copiar senha"}
              </Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.secondaryButton,
                { backgroundColor: theme.accentSoft },
                pressed && styles.pressed,
              ]}
              onPress={handleStartEdit}
            >
              <Text style={[styles.secondaryText, { color: theme.accent }]}>
                Editar
              </Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.deleteButton,
                { backgroundColor: theme.dangerSoft },
                pressed && styles.pressed,
              ]}
              onPress={() => onDelete(item.id)}
            >
              <Text style={[styles.deleteText, { color: theme.dangerText }]}>
                Excluir
              </Text>
            </Pressable>
          </>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: 18,
    marginBottom: 12,
    borderWidth: 1,
    elevation: 3,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  title: {
    fontWeight: "700",
    fontSize: 18,
  },
  badge: {
    fontSize: 12,
    fontWeight: "700",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  infoBlock: {
    marginBottom: 10,
  },
  editWrapper: {
    gap: 8,
    marginBottom: 10,
  },
  editInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  label: {
    fontSize: 12,
    marginBottom: 3,
  },
  value: {
    fontSize: 15,
    fontWeight: "600",
  },
  actions: {
    marginTop: 6,
    flexDirection: "row",
    gap: 10,
  },
  secondaryButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
  },
  secondaryText: {
    fontWeight: "700",
    fontSize: 13,
  },
  deleteButton: {
    minWidth: 86,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  deleteText: {
    fontWeight: "700",
    fontSize: 13,
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
});
