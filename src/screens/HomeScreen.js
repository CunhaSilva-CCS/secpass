import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import PasswordForm from "../components/PasswordForm";
import PasswordCard from "../components/PasswordCard";
import SearchBar from "../components/SearchBar";
import BrandLogo from "../components/BrandLogo";
import { useColorScheme } from "../hooks/use-color-scheme";
import { authenticateVaultAccess } from "../utils/biometricAuth";

import { loadPasswords, savePasswords } from "../services/storage";

import { generatePassword } from "../utils/passwordGenerator";

export default function HomeScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const theme = isDark
    ? {
        bg: "#0B1220",
        orbTop: "#223A5E",
        orbBottom: "#163D36",
        text: "#E8EEF7",
        textSoft: "#B9C4D7",
        textMuted: "#93A4BF",
        accent: "#5CA1FF",
        card: "#121C2E",
        cardSoft: "#0E1728",
        border: "#20304A",
        borderStrong: "#2B3D58",
        primary: "#3B82F6",
        primaryText: "#F8FBFF",
        secondaryButton: "#1C2B45",
        secondaryText: "#BFD5FF",
        dangerSoft: "#3A1B20",
        dangerText: "#FF8A9A",
        successSoft: "#173425",
        successText: "#65D6A5",
      }
    : {
        bg: "#ECF2FB",
        orbTop: "#CFE1FF",
        orbBottom: "#D6F4EA",
        text: "#0D1B2A",
        textSoft: "#4B5D79",
        textMuted: "#6B7A90",
        accent: "#0C66E4",
        card: "#FFFFFF",
        cardSoft: "#F5F8FC",
        border: "#DCE5F3",
        borderStrong: "#D9E3F2",
        primary: "#0C66E4",
        primaryText: "#FFFFFF",
        secondaryButton: "#E8EFFA",
        secondaryText: "#123462",
        dangerSoft: "#FDECEC",
        dangerText: "#B42318",
        successSoft: "#E8F7ED",
        successText: "#1E7A3F",
      };

  const [items, setItems] = useState([]);
  const [title, setTitle] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [search, setSearch] = useState("");
  const [hasLoadedData, setHasLoadedData] = useState(false);
  const [isAppUnlocked, setIsAppUnlocked] = useState(Platform.OS === "web");
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authMessage, setAuthMessage] = useState("");

  const requestAppUnlock = async () => {
    if (Platform.OS === "web") {
      setIsAppUnlocked(true);
      return;
    }

    setIsAuthenticating(true);
    setAuthMessage("");

    try {
      const authResult = await authenticateVaultAccess();

      if (!authResult.success) {
        if (authResult.error === "user_cancel") {
          setAuthMessage("");
          return;
        }

        setAuthMessage("Face ID indisponivel neste dispositivo.");
        setIsAppUnlocked(false);
        return;
      }

      if (authResult.success) {
        setIsAppUnlocked(true);
        setAuthMessage("");
      } else {
        setAuthMessage("Autenticacao nao concluida.");
        setIsAppUnlocked(false);
      }
    } catch {
      setAuthMessage("Falha ao iniciar autenticacao.");
      setIsAppUnlocked(false);
    } finally {
      setIsAuthenticating(false);
    }
  };

  useEffect(() => {
    requestAppUnlock();
  }, []);

  useEffect(() => {
    async function init() {
      const data = await loadPasswords();
      setItems(data);
      setHasLoadedData(true);
    }

    init();
  }, []);

  useEffect(() => {
    if (!hasLoadedData) return;
    savePasswords(items);
  }, [hasLoadedData, items]);

  const addPassword = () => {
    if (!title || !username || !password) {
      Alert.alert("Preencha todos os campos");
      return;
    }

    setItems((prevItems) => [
      {
        id: Date.now().toString(),
        title,
        username,
        password,
      },
      ...prevItems,
    ]);

    setTitle("");
    setUsername("");
    setPassword("");
  };

  const removePassword = (id) => {
    setItems((prevItems) => prevItems.filter((item) => item.id !== id));
  };

  const updatePassword = (id, payload) => {
    setItems((prevItems) =>
      prevItems.map((item) =>
        item.id === id
          ? {
              ...item,
              ...payload,
            }
          : item,
      ),
    );
  };

  const filtered = items.filter(
    (item) =>
      item.title.toLowerCase().includes(search.toLowerCase()) ||
      item.username.toLowerCase().includes(search.toLowerCase()),
  );

  if (!isAppUnlocked) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.bg }]}>
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
        <View style={[styles.bgOrbTop, { backgroundColor: theme.orbTop }]} />
        <View
          style={[styles.bgOrbBottom, { backgroundColor: theme.orbBottom }]}
        />

        <View
          style={[
            styles.lockContainer,
            { backgroundColor: theme.card, borderColor: theme.border },
          ]}
        >
          <View style={styles.lockBrandWrap}>
            <BrandLogo theme={theme} size="compact" showWordmark={false} />
          </View>
          <Text style={[styles.lockTitle, { color: theme.text }]}>
            Cofre bloqueado
          </Text>
          <Text style={[styles.lockText, { color: theme.textSoft }]}>
            Use sua biometria para acessar as credenciais salvas.
          </Text>

          {isAuthenticating ? (
            <ActivityIndicator color={theme.accent} style={styles.loader} />
          ) : (
            <Pressable
              style={({ pressed }) => [
                styles.unlockButton,
                { backgroundColor: theme.primary },
                pressed && styles.pressed,
              ]}
              onPress={requestAppUnlock}
            >
              <Text style={[styles.unlockText, { color: theme.primaryText }]}>
                Desbloquear
              </Text>
            </Pressable>
          )}

          {!!authMessage && (
            <Text style={[styles.authMessage, { color: theme.dangerText }]}>
              {authMessage}
            </Text>
          )}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.bg }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
      <View style={[styles.bgOrbTop, { backgroundColor: theme.orbTop }]} />
      <View
        style={[styles.bgOrbBottom, { backgroundColor: theme.orbBottom }]}
      />

      <FlatList
        contentContainerStyle={styles.listContent}
        data={filtered}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View>
            <View style={styles.header}>
              <BrandLogo theme={theme} />
              <Text style={[styles.title, { color: theme.text }]}>
                Sua central de credenciais
              </Text>
              <Text style={[styles.subtitle, { color: theme.textSoft }]}>
                Organize logins com um visual limpo e acesso rapido.
              </Text>
            </View>

            <View style={styles.kpiRow}>
              <View
                style={[
                  styles.kpiCard,
                  { backgroundColor: theme.card, borderColor: theme.border },
                ]}
              >
                <Text style={[styles.kpiLabel, { color: theme.textMuted }]}>
                  Total
                </Text>
                <Text style={[styles.kpiValue, { color: theme.text }]}>
                  {items.length}
                </Text>
              </View>
              <View
                style={[
                  styles.kpiCard,
                  { backgroundColor: theme.card, borderColor: theme.border },
                ]}
              >
                <Text style={[styles.kpiLabel, { color: theme.textMuted }]}>
                  Filtrados
                </Text>
                <Text style={[styles.kpiValue, { color: theme.text }]}>
                  {filtered.length}
                </Text>
              </View>
            </View>

            <SearchBar value={search} onChangeText={setSearch} theme={theme} />

            <PasswordForm
              title={title}
              username={username}
              password={password}
              theme={theme}
              onTitleChange={setTitle}
              onUsernameChange={setUsername}
              onPasswordChange={setPassword}
              onGenerate={() => setPassword(generatePassword())}
              onSave={addPassword}
            />

            <Text style={[styles.listTitle, { color: theme.text }]}>
              Credenciais salvas
            </Text>
          </View>
        }
        ListEmptyComponent={
          <View
            style={[
              styles.emptyState,
              { backgroundColor: theme.card, borderColor: theme.border },
            ]}
          >
            <Text style={[styles.emptyTitle, { color: theme.text }]}>
              Nenhuma credencial ainda
            </Text>
            <Text style={[styles.emptyText, { color: theme.textSoft }]}>
              Preencha o formulario acima para criar seu primeiro registro.
            </Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <PasswordCard
            item={item}
            onDelete={removePassword}
            onUpdate={updatePassword}
            index={index}
            theme={theme}
          />
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    paddingHorizontal: 16,
  },
  bgOrbTop: {
    position: "absolute",
    top: -90,
    right: -40,
    width: 220,
    height: 220,
    borderRadius: 999,
    opacity: 0.8,
  },
  bgOrbBottom: {
    position: "absolute",
    bottom: -120,
    left: -70,
    width: 250,
    height: 250,
    borderRadius: 999,
    opacity: 0.7,
  },
  listContent: {
    paddingTop: 16,
    paddingBottom: 32,
  },
  header: {
    marginBottom: 16,
  },
  title: {
    marginTop: 8,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "800",
  },
  subtitle: {
    marginTop: 6,
    fontSize: 15,
    lineHeight: 21,
  },
  kpiRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 14,
  },
  kpiCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  kpiLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  kpiValue: {
    fontWeight: "800",
    fontSize: 22,
  },
  listTitle: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 10,
  },
  emptyState: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 18,
  },
  emptyTitle: {
    fontWeight: "700",
    fontSize: 16,
    marginBottom: 6,
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 20,
  },
  lockContainer: {
    marginTop: 90,
    borderWidth: 1,
    borderRadius: 20,
    padding: 22,
    alignItems: "center",
    gap: 12,
  },
  lockTitle: {
    fontSize: 22,
    fontWeight: "800",
  },
  lockBrandWrap: {
    marginBottom: 4,
  },
  lockText: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  loader: {
    marginVertical: 8,
  },
  unlockButton: {
    width: "100%",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 4,
  },
  unlockText: {
    fontSize: 14,
    fontWeight: "700",
  },
  authMessage: {
    marginTop: 2,
    fontSize: 13,
    textAlign: "center",
  },
  pressed: {
    opacity: 0.92,
    transform: [{ scale: 0.99 }],
  },
});
