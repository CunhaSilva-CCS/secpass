import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Feather } from "@expo/vector-icons";
import {
  ActivityIndicator,
  AppState,
  FlatList,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
  StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ScreenCapture from "expo-screen-capture";

import PasswordForm from "../components/PasswordForm";
import PasswordCard from "../components/PasswordCard";
import SearchBar from "../components/SearchBar";
import BrandLogo from "../components/BrandLogo";
import CortexisCredit from "../components/CortexisCredit";
import { useColorScheme } from "../hooks/use-color-scheme";
import { authenticateVaultAccess } from "../utils/biometricAuth";

import {
  clearVault,
  loadPasswords,
  peekRemoteVault,
  savePasswords,
  VAULT_DELETE_ERROR,
} from "../services/storage";
import {
  createVaultTombstone,
  getVisibleVaultItems,
  mergeVaultItems,
} from "../services/vaultMerge";
import { createItemId } from "../utils/createItemId";
import { SENSITIVE_TEXT_INPUT_PROPS } from "../utils/sensitiveInput";
import {
  deleteLocalAccount,
  loadLocalAccount,
  saveLocalAccount,
  verifyLocalAccount,
} from "../services/account";
import {
  applyLockDecay,
  computeFailedLoginState,
  getLockRemainingSeconds,
  isLoginLocked,
} from "../utils/loginThrottle";
import {
  MAX_ACCESS_PASSWORD_LENGTH,
  MIN_ACCESS_PASSWORD_LENGTH,
  validateAccessPasswordPolicy,
} from "../utils/securityPolicy";

import {
  createVaultSecret,
  decryptVaultEnvelope,
  encryptVaultItems,
} from "../services/vaultCrypto";
import {
  clearLoginGuard,
  loadLoginGuard,
  saveLoginGuard,
} from "../services/loginGuard";
import {
  clearSecurityEvents,
  loadSecurityEvents,
  logSecurityEvent,
} from "../services/securityAudit";

import { generatePassword } from "../utils/passwordGenerator";
import { DEVICE_AUTH_NOT_CONFIGURED } from "../utils/secureStoreErrors";

const DEVICE_AUTH_NOT_CONFIGURED_MESSAGE =
  "Este aparelho nao tem senha, Face ID ou Touch ID configurado. Ative um metodo de bloqueio de tela nos Ajustes do sistema para usar o SecPass.";

const IDLE_LOCK_MS = 2 * 60 * 1000;

const SECURITY_EVENT_LABELS = {
  login_success: "Login bem-sucedido",
  login_failed: "Tentativa de login com senha incorreta",
  login_blocked: "Login bloqueado (bloqueio ativo)",
  login_lock_activated: "Bloqueio de login ativado",
  login_without_account: "Tentativa de login sem conta local",
  account_created: "Conta local criada",
  account_create_failed: "Falha ao criar conta local",
  logout: "Logout",
  vault_exported: "Backup do cofre exportado",
  vault_imported: "Backup do cofre importado",
  vault_load_failed: "Falha ao descriptografar o cofre salvo",
  screenshot_detected: "Captura de tela detectada",
};

const formatSecurityEventType = (type) => SECURITY_EVENT_LABELS[type] || type;

const formatSecurityEventDate = (isoString) => {
  try {
    return new Date(isoString).toLocaleString("pt-BR");
  } catch {
    return isoString;
  }
};

// Identidade "cofre": grafite/couro no lugar do azul de SaaS generico, latao
// (bronze) como cor de destaque no lugar de azul eletrico. Mono para dados
// sensiveis (senha revelada, timestamps do historico) reforça a leitura de
// "cifra"/"registro de cofre" em vez de decoracao.
const DARK_THEME = {
  bg: "#15110B",
  orbTop: "#2E2314",
  orbBottom: "#120D08",
  text: "#F4EEDF",
  textSoft: "#CBBFA0",
  textMuted: "#8F826A",
  accent: "#D4AF52",
  accentSoft: "#3A2C15",
  card: "#1E1810",
  cardSoft: "#181209",
  border: "#382C1B",
  borderStrong: "#4B3A22",
  primary: "#CDA43D",
  primaryText: "#1A1408",
  secondaryButton: "#2A2214",
  secondaryText: "#E4D6AE",
  dangerSoft: "#341B16",
  dangerText: "#E08165",
  successSoft: "#1B2E22",
  successText: "#7FC49B",
};

const LIGHT_THEME = {
  bg: "#F4EFE2",
  orbTop: "#ECE1C4",
  orbBottom: "#F0EADA",
  text: "#211A10",
  textSoft: "#584A34",
  textMuted: "#7A6C52",
  accent: "#8A6A1F",
  accentSoft: "#F1E6C6",
  card: "#FFFCF5",
  cardSoft: "#F6EFDF",
  border: "#E3D6B8",
  borderStrong: "#D8C89E",
  primary: "#8A6A1F",
  primaryText: "#FFFBF2",
  secondaryButton: "#EFE4C8",
  secondaryText: "#4A3C22",
  dangerSoft: "#FBEAE3",
  dangerText: "#B14226",
  successSoft: "#E8F3EA",
  successText: "#2F7A4C",
};

const MONO_FONT = Platform.select({
  ios: "Menlo",
  android: "monospace",
  default: "monospace",
});

export default function HomeScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const theme = isDark ? DARK_THEME : LIGHT_THEME;

  const [items, setItems] = useState([]);
  const [title, setTitle] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [search, setSearch] = useState("");
  const [hasLoadedData, setHasLoadedData] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [hasLocalAccount, setHasLocalAccount] = useState(false);
  const [hasRemoteVault, setHasRemoteVault] = useState(false);
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [email, setEmail] = useState("");
  const [accessPassword, setAccessPassword] = useState("");
  const [confirmAccessPassword, setConfirmAccessPassword] = useState("");
  const [loginMessage, setLoginMessage] = useState("");
  const [failedLoginAttempts, setFailedLoginAttempts] = useState(0);
  const [loginLockLevel, setLoginLockLevel] = useState(0);
  const [loginLockUntil, setLoginLockUntil] = useState(0);
  const [hasLoadedLoginGuard, setHasLoadedLoginGuard] = useState(false);
  const [vaultSecret, setVaultSecret] = useState("");
  const [isAppUnlocked, setIsAppUnlocked] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [isImportModalVisible, setIsImportModalVisible] = useState(false);
  const [importText, setImportText] = useState("");
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);
  const [isSecurityLogVisible, setIsSecurityLogVisible] = useState(false);
  const [securityEvents, setSecurityEvents] = useState([]);
  const [isLoadingSecurityLog, setIsLoadingSecurityLog] = useState(false);

  const idleTimerRef = useRef(null);
  const skipNextPersistRef = useRef(false);
  const wasBackgroundedRef = useRef(false);
  const needsVaultReloadRef = useRef(false);

  const lockVault = useCallback(
    (reason = "") => {
      skipNextPersistRef.current = true;
      needsVaultReloadRef.current = true;
      setItems([]);
      setHasLoadedData(false);
      setIsAppUnlocked(false);
      setAuthMessage(reason);

      if (vaultSecret && hasLoadedData) {
        Promise.resolve(
          savePasswords(items, { vaultSecret }),
        ).catch(() => {});
      }
    },
    [hasLoadedData, items, vaultSecret],
  );

  const registerUserActivity = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }

    if (isLoggedIn && isAppUnlocked) {
      idleTimerRef.current = setTimeout(() => {
        lockVault("Cofre bloqueado por inatividade.");
      }, IDLE_LOCK_MS);
    }
  }, [isLoggedIn, isAppUnlocked, lockVault]);

  // iCloud Keychain nao tem callback de "o cofre mudou agora" - o gatilho
  // pratico disponivel e reconsultar ao desbloquear o cofre (background ->
  // active, idle lock, etc.), com merge por item para nao sobrescrever
  // edicoes locais feitas offline. Ver src/services/vaultMerge.js.
  const reloadVaultFromStorage = useCallback(async () => {
    if (!vaultSecret) {
      return;
    }

    try {
      const loadedItems = await loadPasswords({ vaultSecret });
      setItems(loadedItems);
      setHasLoadedData(true);
    } catch {
      skipNextPersistRef.current = true;
      setItems([]);
      setHasLoadedData(true);
    }
  }, [vaultSecret]);

  const pullRemoteVaultUpdates = useCallback(async () => {
    if (!vaultSecret) {
      return;
    }

    try {
      const remoteItems = await loadPasswords({ vaultSecret });
      setItems((prevItems) => mergeVaultItems(prevItems, remoteItems));
    } catch {
      // Mantem os dados locais atuais; nova tentativa no proximo desbloqueio.
    }
  }, [vaultSecret]);

  const requestAppUnlock = useCallback(async () => {
    setIsAuthenticating(true);
    setAuthMessage("");

    try {
      const authResult = await authenticateVaultAccess();

      if (!authResult.success) {
        if (authResult.error === "user_cancel") {
          setAuthMessage("");
          return;
        }

        setAuthMessage("Biometria/senha do aparelho indisponivel.");
        setIsAppUnlocked(false);
        return;
      }

      setIsAppUnlocked(true);
      setAuthMessage("");

      if (needsVaultReloadRef.current) {
        needsVaultReloadRef.current = false;
        await reloadVaultFromStorage();
      } else if (hasLoadedData) {
        pullRemoteVaultUpdates();
      }
    } catch {
      setAuthMessage("Falha ao iniciar autenticacao.");
      setIsAppUnlocked(false);
    } finally {
      setIsAuthenticating(false);
    }
  }, [hasLoadedData, pullRemoteVaultUpdates, reloadVaultFromStorage]);

  useEffect(() => {
    async function initializeSession() {
      const account = await loadLocalAccount();
      const loginGuard = await loadLoginGuard();
      const remoteVault = await peekRemoteVault();
      const remoteMeta = remoteVault?.meta;

      if (loginGuard) {
        const decayedGuard = applyLockDecay(loginGuard);

        setFailedLoginAttempts(decayedGuard.failedAttempts);
        setLoginLockLevel(decayedGuard.lockLevel);
        setLoginLockUntil(decayedGuard.lockUntil);
      }

      setHasLocalAccount(Boolean(account));
      setHasRemoteVault(Boolean(remoteMeta?.verifier));
      if (!account && remoteMeta?.email) {
        setEmail(remoteMeta.email);
      }
      setIsRegisterMode(!account && !remoteMeta?.verifier);
      setIsLoggedIn(false);
      setVaultSecret("");
      setHasLoadedLoginGuard(true);
      setIsCheckingSession(false);
    }

    initializeSession();
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      // "inactive" e um estado transitorio (inclui prompts do sistema como
      // Face ID, share sheet, etc.) e nao significa que o app saiu de fato.
      // So tratamos "background" como saida real do app.
      if (nextState === "background") {
        wasBackgroundedRef.current = true;
        lockVault("Cofre bloqueado ao sair do app.");
        return;
      }

      // So reautentica automaticamente ao *voltar* de background real.
      // O proprio prompt de Face ID dispara "inactive" -> "active" no iOS;
      // sem essa guarda, uma tentativa cancelada/negada reabriria o prompt
      // em loop assim que o app voltasse a ficar ativo.
      if (
        nextState === "active" &&
        wasBackgroundedRef.current &&
        isLoggedIn &&
        !isAppUnlocked &&
        !isAuthenticating
      ) {
        wasBackgroundedRef.current = false;
        requestAppUnlock();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [isLoggedIn, isAppUnlocked, isAuthenticating, lockVault, requestAppUnlock]);

  useEffect(() => {
    if (isLoggedIn && isAppUnlocked) {
      registerUserActivity();
    } else if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }

    return () => {
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
    };
  }, [isLoggedIn, isAppUnlocked, registerUserActivity]);

  useEffect(() => {
    if (!isLoggedIn) {
      return undefined;
    }

    ScreenCapture.enableAppSwitcherProtectionAsync().catch(() => {});

    return () => {
      ScreenCapture.disableAppSwitcherProtectionAsync().catch(() => {});
    };
  }, [isLoggedIn]);

  useEffect(() => {
    if (!(isLoggedIn && isAppUnlocked)) {
      return undefined;
    }

    ScreenCapture.preventScreenCaptureAsync().catch(() => {});

    const subscription = ScreenCapture.addScreenshotListener(() => {
      logSecurityEvent({
        type: "screenshot_detected",
        status: "warning",
      }).catch(() => {});
    });

    return () => {
      ScreenCapture.allowScreenCaptureAsync().catch(() => {});
      subscription?.remove?.();
    };
  }, [isLoggedIn, isAppUnlocked]);

  useEffect(() => {
    if (!hasLoadedLoginGuard) {
      return;
    }

    const persistLoginGuard = async () => {
      try {
        if (!failedLoginAttempts && !loginLockLevel && !loginLockUntil) {
          await clearLoginGuard();
          return;
        }

        await saveLoginGuard({
          failedAttempts: failedLoginAttempts,
          lockLevel: loginLockLevel,
          lockUntil: loginLockUntil,
        });
      } catch {
        // Mantem execucao da UI mesmo se persistencia segura falhar.
      }
    };

    persistLoginGuard();
  }, [
    failedLoginAttempts,
    hasLoadedLoginGuard,
    loginLockLevel,
    loginLockUntil,
  ]);

  useEffect(() => {
    if (!isLoggedIn) {
      return;
    }

    async function init() {
      try {
        const localItems = await loadPasswords({ vaultSecret });
        setItems(localItems);
      } catch {
        Alert.alert(
          "Nao foi possivel abrir o cofre salvo",
          'Os dados salvos neste aparelho foram cifrados com uma senha diferente da atual (normalmente porque a conta foi recriada). Seu cofre comecou vazio para voce continuar usando; os dados antigos nao serao apagados a menos que voce adicione/edite uma credencial ou use "Excluir conta e todos os dados".',
        );
        logSecurityEvent({
          type: "vault_load_failed",
          status: "error",
        }).catch(() => {});
        // Evita que o proximo efeito de persistencia sobrescreva
        // automaticamente o cofre antigo (ainda cifrado com outra senha)
        // com um array vazio antes que o usuario tome uma acao real.
        skipNextPersistRef.current = true;
        setItems([]);
      } finally {
        setHasLoadedData(true);
      }
    }

    init();
  }, [isLoggedIn, vaultSecret]);

  useEffect(() => {
    if (!hasLoadedData) return;

    if (skipNextPersistRef.current) {
      skipNextPersistRef.current = false;
      return;
    }

    const persistPasswords = async () => {
      if (!vaultSecret) {
        return;
      }

      try {
        await savePasswords(items, { vaultSecret });
      } catch (err) {
        Alert.alert(
          "Falha de seguranca",
          err?.message === DEVICE_AUTH_NOT_CONFIGURED
            ? DEVICE_AUTH_NOT_CONFIGURED_MESSAGE
            : "Nao foi possivel salvar o cofre com seguranca neste dispositivo.",
        );
      }
    };

    persistPasswords();
  }, [hasLoadedData, items, vaultSecret]);

  const addPassword = () => {
    registerUserActivity();

    if (!title || !username || !password) {
      Alert.alert("Preencha todos os campos");
      return;
    }

    setItems((prevItems) => [
      {
        id: createItemId(),
        title,
        username,
        password,
        updatedAt: Date.now(),
      },
      ...prevItems,
    ]);

    setTitle("");
    setUsername("");
    setPassword("");
    setIsAddModalVisible(false);
  };

  const removePassword = useCallback(
    (id) => {
      registerUserActivity();
      setItems((prevItems) =>
        prevItems.map((item) =>
          item.id === id ? createVaultTombstone(id) : item,
        ),
      );
    },
    [registerUserActivity],
  );

  const updatePassword = useCallback(
    (id, payload) => {
      registerUserActivity();
      setItems((prevItems) =>
        prevItems.map((item) =>
          item.id === id
            ? {
                ...item,
                ...payload,
                updatedAt: Date.now(),
              }
            : item,
        ),
      );
    },
    [registerUserActivity],
  );

  const visibleItems = useMemo(() => getVisibleVaultItems(items), [items]);

  const filtered = useMemo(() => {
    const normalizedSearch = search.toLowerCase();
    return visibleItems.filter(
      (item) =>
        item.title.toLowerCase().includes(normalizedSearch) ||
        item.username.toLowerCase().includes(normalizedSearch),
    );
  }, [visibleItems, search]);

  const validateCredentials = () => {
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !accessPassword) {
      setLoginMessage("Informe email e senha para entrar.");
      return null;
    }

    if (!normalizedEmail.includes("@")) {
      setLoginMessage("Email invalido.");
      return null;
    }

    if (accessPassword.length < MIN_ACCESS_PASSWORD_LENGTH) {
      setLoginMessage(
        `Senha deve ter no minimo ${MIN_ACCESS_PASSWORD_LENGTH} caracteres.`,
      );
      return null;
    }

    return { normalizedEmail, accessPassword };
  };

  const resetAuthFields = () => {
    setEmail("");
    setAccessPassword("");
    setConfirmAccessPassword("");
  };

  const performLogin = async () => {
    const credentials = validateCredentials();
    if (!credentials) {
      return;
    }

    const decayedState = applyLockDecay({
      failedAttempts: failedLoginAttempts,
      lockLevel: loginLockLevel,
      lockUntil: loginLockUntil,
    });

    if (
      decayedState.failedAttempts !== failedLoginAttempts ||
      decayedState.lockLevel !== loginLockLevel ||
      decayedState.lockUntil !== loginLockUntil
    ) {
      setFailedLoginAttempts(decayedState.failedAttempts);
      setLoginLockLevel(decayedState.lockLevel);
      setLoginLockUntil(decayedState.lockUntil);
    }

    if (isLoginLocked(decayedState.lockUntil)) {
      const remainingSeconds = getLockRemainingSeconds(decayedState.lockUntil);
      setLoginMessage(
        `Muitas tentativas. Tente novamente em ${remainingSeconds}s.`,
      );
      logSecurityEvent({
        type: "login_blocked",
        status: "warning",
        details: { remainingSeconds },
      }).catch(() => {});
      return;
    }

    const registerFailedAttempt = () => {
      const throttleState = computeFailedLoginState({
        failedAttempts: decayedState.failedAttempts,
        lockLevel: decayedState.lockLevel,
      });

      setFailedLoginAttempts(throttleState.failedAttempts);
      setLoginLockLevel(throttleState.lockLevel);
      setLoginLockUntil(throttleState.lockUntil);

      if (throttleState.justLocked) {
        logSecurityEvent({
          type: "login_lock_activated",
          status: "warning",
          details: {
            lockDurationSeconds: throttleState.lockDurationSeconds,
            lockLevel: throttleState.lockLevel,
          },
        }).catch(() => {});

        setLoginMessage(
          `Muitas tentativas. Tente novamente em ${throttleState.lockDurationSeconds}s.`,
        );
        return;
      }

      logSecurityEvent({
        type: "login_failed",
        status: "warning",
        details: {
          remainingAttempts: throttleState.remainingAttempts,
        },
      }).catch(() => {});

      setLoginMessage(
        `Email ou senha incorretos. Restam ${throttleState.remainingAttempts} tentativa(s) antes do bloqueio.`,
      );
    };

    const account = await loadLocalAccount();
    if (!account) {
      if (!hasRemoteVault) {
        setLoginMessage("Nenhuma conta local. Crie sua conta para continuar.");
        setIsRegisterMode(true);
        logSecurityEvent({
          type: "login_without_account",
          status: "warning",
        }).catch(() => {});
        return;
      }

      const nextSecret = createVaultSecret({
        email: credentials.normalizedEmail,
        password: credentials.accessPassword,
      });

      try {
        await loadPasswords({ vaultSecret: nextSecret });
        await saveLocalAccount({
          email: credentials.normalizedEmail,
          password: credentials.accessPassword,
        });
      } catch {
        registerFailedAttempt();
        return;
      }

      setHasLocalAccount(true);
      setFailedLoginAttempts(0);
      setLoginLockLevel(0);
      setLoginLockUntil(0);
      setVaultSecret(nextSecret);
      logSecurityEvent({
        type: "login_success",
        status: "info",
      }).catch(() => {});
      setLoginMessage("");
      setIsLoggedIn(true);
      requestAppUnlock();
      resetAuthFields();
      return;
    }

    const isValidAccount = await verifyLocalAccount({
      email: credentials.normalizedEmail,
      password: credentials.accessPassword,
    });

    if (!isValidAccount) {
      registerFailedAttempt();
      return;
    }

    setFailedLoginAttempts(0);
    setLoginLockLevel(0);
    setLoginLockUntil(0);

    const nextSecret = createVaultSecret({
      email: credentials.normalizedEmail,
      password: credentials.accessPassword,
    });
    setVaultSecret(nextSecret);

    logSecurityEvent({
      type: "login_success",
      status: "info",
    }).catch(() => {});

    setLoginMessage("");
    setIsLoggedIn(true);
    requestAppUnlock();
    resetAuthFields();
  };

  const handleLogin = async () => {
    if (isAuthSubmitting) return;
    setIsAuthSubmitting(true);
    try {
      await performLogin();
    } finally {
      setIsAuthSubmitting(false);
    }
  };

  const performCreateAccount = async () => {
    const credentials = validateCredentials();
    if (!credentials) {
      return;
    }

    if (hasRemoteVault && !hasLocalAccount) {
      setLoginMessage(
        "Ja existe um cofre nesta conta iCloud. Entre com o email e a senha de acesso do outro aparelho.",
      );
      setIsRegisterMode(false);
      return;
    }

    if (accessPassword !== confirmAccessPassword) {
      setLoginMessage("As senhas nao conferem.");
      return;
    }

    const passwordPolicyError = validateAccessPasswordPolicy(
      credentials.accessPassword,
    );
    if (passwordPolicyError) {
      setLoginMessage(passwordPolicyError);
      return;
    }

    try {
      await saveLocalAccount({
        email: credentials.normalizedEmail,
        password: credentials.accessPassword,
      });
    } catch (err) {
      setLoginMessage(
        err?.message === DEVICE_AUTH_NOT_CONFIGURED
          ? DEVICE_AUTH_NOT_CONFIGURED_MESSAGE
          : "Nao foi possivel salvar a conta com seguranca neste dispositivo.",
      );
      logSecurityEvent({
        type: "account_create_failed",
        status: "error",
      }).catch(() => {});
      return;
    }

    logSecurityEvent({
      type: "account_created",
      status: "info",
    }).catch(() => {});

    setHasLocalAccount(true);
    setFailedLoginAttempts(0);
    setLoginLockLevel(0);
    setLoginLockUntil(0);
    setIsRegisterMode(false);
    setLoginMessage("Conta criada com sucesso. Faca login para continuar.");
    setAccessPassword("");
    setConfirmAccessPassword("");
  };

  const handleCreateAccount = async () => {
    if (isAuthSubmitting) return;
    setIsAuthSubmitting(true);
    try {
      await performCreateAccount();
    } finally {
      setIsAuthSubmitting(false);
    }
  };

  const handleForgotPassword = async () => {
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      setLoginMessage("Informe um email valido para recuperar o acesso.");
      return;
    }

    if (!hasLocalAccount) {
      setLoginMessage("Crie sua conta local para definir uma senha.");
      setIsRegisterMode(true);
      return;
    }

    Alert.alert(
      "Isso apaga o acesso ao cofre atual",
      "Este app roda sem backend: nao ha como recuperar a senha antiga. Se continuar, uma nova conta local sera criada e o cofre salvo com a senha atual ficara inacessivel para sempre, a menos que voce tenha exportado um backup. Deseja continuar mesmo assim?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Continuar mesmo assim",
          style: "destructive",
          onPress: () => {
            setIsRegisterMode(true);
            setAccessPassword("");
            setConfirmAccessPassword("");
            setLoginMessage(
              "Recriando conta local. O cofre anterior sera perdido sem um backup.",
            );
          },
        },
      ],
    );
  };

  const handleExportVault = async () => {
    registerUserActivity();

    if (!visibleItems.length) {
      Alert.alert("Cofre vazio", "Nao ha credenciais para exportar.");
      return;
    }

    try {
      const envelope = await encryptVaultItems(items, vaultSecret);
      await Share.share({
        title: "Backup SecPass",
        message: JSON.stringify(envelope),
      });
      logSecurityEvent({
        type: "vault_exported",
        status: "info",
      }).catch(() => {});
    } catch {
      Alert.alert(
        "Falha ao exportar",
        "Nao foi possivel gerar o backup criptografado do cofre.",
      );
    }
  };

  const handleImportVault = async () => {
    registerUserActivity();

    let envelope;
    try {
      envelope = JSON.parse(importText.trim());
    } catch {
      Alert.alert(
        "Backup invalido",
        "O conteudo colado nao e um backup valido.",
      );
      return;
    }

    try {
      const importedItems = await decryptVaultEnvelope(envelope, vaultSecret);

      Alert.alert(
        "Importar backup",
        `Foram encontradas ${getVisibleVaultItems(importedItems).length} credencial(is) no backup. Substituir o cofre atual (${visibleItems.length} credencial(is)) pelo conteudo importado? Essa acao nao pode ser desfeita.`,
        [
          { text: "Cancelar", style: "cancel" },
          {
            text: "Substituir",
            style: "destructive",
            onPress: () => {
              setItems(importedItems);
              setIsImportModalVisible(false);
              setImportText("");
              logSecurityEvent({
                type: "vault_imported",
                status: "info",
              }).catch(() => {});
            },
          },
        ],
      );
    } catch {
      Alert.alert(
        "Falha ao importar",
        "Backup invalido, corrompido ou criado com uma senha de acesso diferente da conta atual.",
      );
    }
  };

  const handleOpenSecurityLog = async () => {
    registerUserActivity();
    setIsSecurityLogVisible(true);
    setIsLoadingSecurityLog(true);
    try {
      const events = await loadSecurityEvents();
      setSecurityEvents(events);
    } catch {
      setSecurityEvents([]);
    } finally {
      setIsLoadingSecurityLog(false);
    }
  };

  const handleClearSecurityLog = () => {
    Alert.alert(
      "Limpar historico de seguranca",
      "Isso apaga permanentemente os eventos de seguranca registrados neste aparelho. Deseja continuar?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Limpar",
          style: "destructive",
          onPress: async () => {
            try {
              await clearSecurityEvents();
            } catch {
              // Segue mesmo se a limpeza falhar parcialmente.
            }
            setSecurityEvents([]);
          },
        },
      ],
    );
  };

  const handleLogout = async () => {
    needsVaultReloadRef.current = false;
    setVaultSecret("");
    logSecurityEvent({
      type: "logout",
      status: "info",
    }).catch(() => {});
    setIsLoggedIn(false);
    setItems([]);
    setSearch("");
    setHasLoadedData(false);
    setIsAppUnlocked(false);
  };

  const handleDeleteAccount = async () => {
    registerUserActivity();

    let isAuthorized = false;
    try {
      const authResult = await authenticateVaultAccess();
      isAuthorized = authResult.success;
    } catch {
      isAuthorized = false;
    }

    if (!isAuthorized) {
      Alert.alert(
        "Autenticacao necessaria",
        "Autentique-se com biometria para excluir a conta e os dados.",
      );
      return;
    }

    Alert.alert(
      "Excluir conta e todos os dados",
      "Isso apaga permanentemente sua conta local e todas as credenciais salvas neste aparelho. Essa acao nao pode ser desfeita. Se quiser manter uma copia, exporte um backup antes de continuar. Deseja excluir tudo agora?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Excluir tudo",
          style: "destructive",
          onPress: async () => {
            try {
              await clearVault();
              await deleteLocalAccount();
              await clearLoginGuard();
              await clearSecurityEvents();
            } catch (err) {
              Alert.alert(
                "Falha ao excluir",
                err?.message === VAULT_DELETE_ERROR
                  ? VAULT_DELETE_ERROR
                  : "Nao foi possivel apagar a conta e o cofre. Tente novamente.",
              );
              return;
            }

            needsVaultReloadRef.current = false;
            setItems([]);
            setSearch("");
            setHasLoadedData(false);
            setVaultSecret("");
            setIsLoggedIn(false);
            setIsAppUnlocked(false);
            setHasLocalAccount(false);
            setIsRegisterMode(true);
            setFailedLoginAttempts(0);
            setLoginLockLevel(0);
            setLoginLockUntil(0);
            resetAuthFields();
            setLoginMessage("Conta e dados excluidos deste aparelho.");
          },
        },
      ],
    );
  };

  if (isCheckingSession) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.bg }]}>
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
        <View style={styles.centeredState}>
          <ActivityIndicator color={theme.accent} />
        </View>
      </SafeAreaView>
    );
  }

  if (!isLoggedIn) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.bg }]}>
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
        <View style={[styles.bgOrbTop, { backgroundColor: theme.orbTop }]} />
        <View
          style={[styles.bgOrbBottom, { backgroundColor: theme.orbBottom }]}
        />

        <KeyboardAvoidingView
          style={styles.loginKeyboardAvoider}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.loginScrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <View
              style={[
                styles.loginContainer,
                { backgroundColor: theme.card, borderColor: theme.border },
              ]}
            >
              <BrandLogo theme={theme} size="compact" />
          <Text style={[styles.loginTitle, { color: theme.text }]}>
            {hasRemoteVault && !hasLocalAccount
              ? "Abrir cofre iCloud"
              : "Entrar no SecPass"}
          </Text>
          <Text style={[styles.loginText, { color: theme.textSoft }]}>
            {hasRemoteVault && !hasLocalAccount
              ? "Encontramos um cofre nesta conta Apple. Use o mesmo email e senha do outro aparelho."
              : isRegisterMode
                ? "Crie sua conta local para acessar o cofre."
                : "Acesse sua conta para abrir o cofre."}
          </Text>

          <TextInput
            placeholder="Email"
            placeholderTextColor={theme.textMuted}
            value={email}
            {...SENSITIVE_TEXT_INPUT_PROPS}
            keyboardType="email-address"
            onChangeText={setEmail}
            style={[
              styles.loginInput,
              {
                backgroundColor: theme.cardSoft,
                borderColor: theme.borderStrong,
                color: theme.text,
              },
            ]}
          />

          <TextInput
            placeholder={
              isRegisterMode ? "Crie sua senha de acesso" : "Senha de acesso"
            }
            placeholderTextColor={theme.textMuted}
            value={accessPassword}
            {...SENSITIVE_TEXT_INPUT_PROPS}
            secureTextEntry
            maxLength={MAX_ACCESS_PASSWORD_LENGTH}
            onChangeText={setAccessPassword}
            style={[
              styles.loginInput,
              {
                backgroundColor: theme.cardSoft,
                borderColor: theme.borderStrong,
                color: theme.text,
              },
            ]}
          />

          {isRegisterMode && (
            <Text style={[styles.passwordRuleText, { color: theme.textMuted }]}>
              {`Senha: minimo ${MIN_ACCESS_PASSWORD_LENGTH} caracteres com letra, numero e especial.`}
            </Text>
          )}

          {isRegisterMode && (
            <Text style={[styles.passwordTipText, { color: theme.textSoft }]}>
              Dica: quanto mais longa, mais segura. Como nao ha recuperacao de
              senha neste app, evite senhas curtas ou faceis de adivinhar.
            </Text>
          )}

          {isRegisterMode && (
            <TextInput
              placeholder="Confirme sua senha"
              placeholderTextColor={theme.textMuted}
              value={confirmAccessPassword}
              {...SENSITIVE_TEXT_INPUT_PROPS}
              secureTextEntry
              maxLength={MAX_ACCESS_PASSWORD_LENGTH}
              onChangeText={setConfirmAccessPassword}
              style={[
                styles.loginInput,
                {
                  backgroundColor: theme.cardSoft,
                  borderColor: theme.borderStrong,
                  color: theme.text,
                },
              ]}
            />
          )}

          <Pressable
            style={({ pressed }) => [
              styles.loginButton,
              { backgroundColor: theme.primary },
              isAuthSubmitting && styles.loginButtonDisabled,
              pressed && styles.pressed,
            ]}
            disabled={isAuthSubmitting}
            onPress={isRegisterMode ? handleCreateAccount : handleLogin}
          >
            {isAuthSubmitting ? (
              <ActivityIndicator color={theme.primaryText} />
            ) : (
              <Text
                style={[styles.loginButtonText, { color: theme.primaryText }]}
              >
                {isRegisterMode ? "Criar conta" : hasRemoteVault && !hasLocalAccount ? "Abrir cofre" : "Entrar"}
              </Text>
            )}
          </Pressable>

          <Pressable
            onPress={() => {
              setIsRegisterMode((prev) => !prev);
              setLoginMessage("");
              setAccessPassword("");
              setConfirmAccessPassword("");
            }}
          >
            <Text style={[styles.switchAuthText, { color: theme.accent }]}>
              {isRegisterMode
                ? "Ja tenho conta"
                : hasRemoteVault && !hasLocalAccount
                  ? "Este e o primeiro aparelho"
                  : "Criar conta local"}
            </Text>
          </Pressable>

          <View style={styles.loginMetaRow}>
            <Pressable onPress={handleForgotPassword}>
              <Text style={[styles.forgotText, { color: theme.accent }]}>
                Esqueci minha senha
              </Text>
            </Pressable>
          </View>

              {!!loginMessage && (
                <Text
                  style={[styles.loginMessage, { color: theme.dangerText }]}
                >
                  {loginMessage}
                </Text>
              )}
            </View>

            <CortexisCredit theme={theme} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

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

      <KeyboardAvoidingView
        style={styles.vaultKeyboardAvoider}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
      <FlatList
        contentContainerStyle={styles.listContent}
        data={filtered}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View>
            <View style={styles.header}>
              <View style={styles.headerTopRow}>
                <BrandLogo theme={theme} size="compact" />
                <Pressable
                  style={({ pressed }) => [
                    styles.headerButton,
                    { backgroundColor: theme.secondaryButton },
                    pressed && styles.pressed,
                  ]}
                  onPress={handleLogout}
                >
                  <Text
                    style={[
                      styles.headerButtonText,
                      { color: theme.secondaryText },
                    ]}
                  >
                    Sair
                  </Text>
                </Pressable>
              </View>

              <View style={styles.backupRow}>
                <Pressable
                  style={({ pressed }) => [
                    styles.backupButton,
                    { backgroundColor: theme.secondaryButton },
                    pressed && styles.pressed,
                  ]}
                  onPress={handleExportVault}
                >
                  <Text
                    style={[
                      styles.headerButtonText,
                      { color: theme.secondaryText },
                    ]}
                  >
                    Exportar backup
                  </Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.backupButton,
                    { backgroundColor: theme.secondaryButton },
                    pressed && styles.pressed,
                  ]}
                  onPress={() => setIsImportModalVisible(true)}
                >
                  <Text
                    style={[
                      styles.headerButtonText,
                      { color: theme.secondaryText },
                    ]}
                  >
                    Importar backup
                  </Text>
                </Pressable>
              </View>

              <Pressable
                style={styles.securityLogLinkWrap}
                onPress={handleOpenSecurityLog}
              >
                <Text
                  style={[styles.securityLogLinkText, { color: theme.accent }]}
                >
                  Ver historico de seguranca
                </Text>
              </Pressable>

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
                  {visibleItems.length}
                </Text>
              </View>
              {!!search.trim() && (
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
              )}
            </View>

            <SearchBar
              value={search}
              onChangeText={(value) => {
                registerUserActivity();
                setSearch(value);
              }}
              theme={theme}
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
              Toque no botao + para criar seu primeiro registro.
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
        onScrollBeginDrag={registerUserActivity}
        keyboardShouldPersistTaps="handled"
        ListFooterComponent={
          <View style={styles.dangerZone}>
            <Pressable
              style={({ pressed }) => [
                styles.dangerZoneButton,
                { borderColor: theme.border },
                pressed && styles.pressed,
              ]}
              onPress={handleDeleteAccount}
            >
              <Text
                style={[styles.dangerLinkText, { color: theme.dangerText }]}
              >
                Excluir conta e todos os dados
              </Text>
            </Pressable>
          </View>
        }
      />
      </KeyboardAvoidingView>

      <Pressable
        style={({ pressed }) => [
          styles.fab,
          { backgroundColor: theme.primary },
          pressed && styles.pressed,
        ]}
        onPress={() => {
          registerUserActivity();
          setIsAddModalVisible(true);
        }}
        accessibilityRole="button"
        accessibilityLabel="Nova credencial"
      >
        <Feather name="plus" size={26} color={theme.primaryText} />
      </Pressable>

      <Modal
        visible={isAddModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setIsAddModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalKeyboardAvoider}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Pressable
            style={styles.modalOverlay}
            onPress={() => setIsAddModalVisible(false)}
          >
            <Pressable
              style={[
                styles.modalCard,
                { backgroundColor: theme.card, borderColor: theme.border },
              ]}
              onPress={(event) => event.stopPropagation()}
            >
              <PasswordForm
                title={title}
                username={username}
                password={password}
                theme={theme}
                onTitleChange={(value) => {
                  registerUserActivity();
                  setTitle(value);
                }}
                onUsernameChange={(value) => {
                  registerUserActivity();
                  setUsername(value);
                }}
                onPasswordChange={(value) => {
                  registerUserActivity();
                  setPassword(value);
                }}
                onGenerate={() => {
                  registerUserActivity();
                  setPassword(generatePassword());
                }}
                onSave={addPassword}
              />
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={isImportModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setIsImportModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalKeyboardAvoider}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.modalOverlay}>
            <View
              style={[
                styles.modalCard,
                { backgroundColor: theme.card, borderColor: theme.border },
              ]}
            >
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                Importar backup
              </Text>
            <Text style={[styles.modalText, { color: theme.textSoft }]}>
              Cole abaixo o conteudo do backup exportado. Precisa ter sido
              gerado com a mesma conta (email e senha) em uso agora.
            </Text>
            <TextInput
              value={importText}
              onChangeText={setImportText}
              placeholder="Cole o backup aqui"
              placeholderTextColor={theme.textMuted}
              multiline
              autoCapitalize="none"
              autoCorrect={false}
              style={[
                styles.modalInput,
                {
                  backgroundColor: theme.cardSoft,
                  borderColor: theme.borderStrong,
                  color: theme.text,
                },
              ]}
            />
            <View style={styles.modalActions}>
              <Pressable
                style={({ pressed }) => [
                  styles.secondaryButton,
                  { backgroundColor: theme.secondaryButton },
                  pressed && styles.pressed,
                ]}
                onPress={() => {
                  setIsImportModalVisible(false);
                  setImportText("");
                }}
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
                  { backgroundColor: theme.primary },
                  pressed && styles.pressed,
                ]}
                onPress={handleImportVault}
              >
                <Text style={[styles.secondaryText, { color: theme.primaryText }]}>
                  Confirmar importacao
                </Text>
              </Pressable>
            </View>
          </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={isSecurityLogVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setIsSecurityLogVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalCard,
              styles.securityLogCard,
              { backgroundColor: theme.card, borderColor: theme.border },
            ]}
          >
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              Historico de seguranca
            </Text>
            <Text style={[styles.modalText, { color: theme.textSoft }]}>
              Ultimos eventos registrados neste aparelho (login, criacao de
              conta, backups, entre outros).
            </Text>

            {isLoadingSecurityLog ? (
              <ActivityIndicator color={theme.accent} style={styles.loader} />
            ) : securityEvents.length === 0 ? (
              <Text style={[styles.modalText, { color: theme.textMuted }]}>
                Nenhum evento registrado.
              </Text>
            ) : (
              <FlatList
                data={securityEvents}
                keyExtractor={(event) => event.id}
                style={styles.securityLogList}
                renderItem={({ item }) => (
                  <View
                    style={[
                      styles.securityLogItem,
                      { borderColor: theme.border },
                    ]}
                  >
                    <Text
                      style={[
                        styles.securityLogItemType,
                        { color: theme.text },
                      ]}
                    >
                      {formatSecurityEventType(item.type)}
                    </Text>
                    <Text
                      style={[
                        styles.securityLogItemDate,
                        { color: theme.textMuted },
                      ]}
                    >
                      {formatSecurityEventDate(item.createdAt)}
                    </Text>
                  </View>
                )}
              />
            )}

            <View style={styles.modalActions}>
              <Pressable
                style={({ pressed }) => [
                  styles.secondaryButton,
                  { backgroundColor: theme.secondaryButton },
                  pressed && styles.pressed,
                ]}
                onPress={() => setIsSecurityLogVisible(false)}
              >
                <Text
                  style={[styles.secondaryText, { color: theme.secondaryText }]}
                >
                  Fechar
                </Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.secondaryButton,
                  { backgroundColor: theme.dangerSoft },
                  pressed && styles.pressed,
                ]}
                onPress={handleClearSecurityLog}
              >
                <Text style={[styles.secondaryText, { color: theme.dangerText }]}>
                  Limpar historico
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    paddingHorizontal: 16,
  },
  vaultKeyboardAvoider: {
    flex: 1,
  },
  bgOrbTop: {
    position: "absolute",
    top: -140,
    right: -90,
    width: 340,
    height: 340,
    borderRadius: 999,
    opacity: 0.55,
  },
  bgOrbBottom: {
    position: "absolute",
    bottom: -160,
    left: -110,
    width: 300,
    height: 300,
    borderRadius: 999,
    opacity: 0.35,
  },
  listContent: {
    paddingTop: 16,
    paddingBottom: 32,
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
  },
  centeredState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loginKeyboardAvoider: {
    flex: 1,
  },
  loginScrollContent: {
    flexGrow: 1,
  },
  loginContainer: {
    marginTop: 80,
    borderWidth: 1,
    borderRadius: 20,
    padding: 22,
    gap: 10,
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
  },
  loginTitle: {
    marginTop: 4,
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  loginText: {
    fontSize: 14,
    marginBottom: 6,
  },
  loginInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 14,
  },
  loginButton: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 4,
  },
  loginButtonDisabled: {
    opacity: 0.7,
  },
  loginButtonText: {
    fontWeight: "700",
    fontSize: 14,
  },
  loginMetaRow: {
    marginTop: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 10,
  },
  forgotText: {
    fontSize: 12,
    fontWeight: "700",
  },
  switchAuthText: {
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
    marginTop: 2,
  },
  loginMessage: {
    marginTop: 2,
    fontSize: 13,
  },
  passwordRuleText: {
    fontSize: 12,
    marginTop: -2,
    marginBottom: 2,
  },
  passwordTipText: {
    fontSize: 12,
    fontStyle: "italic",
    marginBottom: 6,
  },
  header: {
    marginBottom: 16,
  },
  headerTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  headerButton: {
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  headerButtonText: {
    fontWeight: "700",
    fontSize: 12,
  },
  backupRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  backupButton: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  securityLogLinkWrap: {
    alignSelf: "center",
    marginTop: 12,
  },
  securityLogLinkText: {
    fontSize: 12,
    fontWeight: "700",
  },
  dangerZone: {
    marginTop: 24,
    alignItems: "center",
  },
  dangerZoneButton: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  dangerLinkText: {
    fontSize: 12,
    fontWeight: "700",
  },
  title: {
    marginTop: 8,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "800",
    letterSpacing: 0.2,
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
    fontSize: 11,
    marginBottom: 4,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  kpiValue: {
    fontWeight: "800",
    fontSize: 22,
    fontFamily: MONO_FONT,
  },
  listTitle: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
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
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
  },
  lockTitle: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: 0.3,
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
  fab: {
    position: "absolute",
    right: 8,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
  },
  modalKeyboardAvoider: {
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(8, 14, 26, 0.55)",
  },
  modalCard: {
    borderWidth: 1,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    gap: 10,
  },
  securityLogCard: {
    maxHeight: "80%",
  },
  securityLogList: {
    maxHeight: 360,
  },
  securityLogItem: {
    borderBottomWidth: 1,
    paddingVertical: 10,
  },
  securityLogItemType: {
    fontSize: 14,
    fontWeight: "700",
  },
  securityLogItemDate: {
    fontSize: 12,
    marginTop: 2,
    fontFamily: MONO_FONT,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
  },
  modalText: {
    fontSize: 13,
    lineHeight: 19,
  },
  modalInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 13,
    minHeight: 120,
    textAlignVertical: "top",
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  secondaryButton: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  secondaryText: {
    fontWeight: "700",
    fontSize: 14,
  },
});
