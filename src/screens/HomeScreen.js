import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  FlatList,
  Alert,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
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
import {
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
import { validateAccessPasswordPolicy } from "../utils/securityPolicy";

import {
  clearSessionToken,
  loadSessionToken,
  saveSessionToken,
} from "../services/session";
import {
  clearRefreshToken,
  loadRefreshToken,
  saveRefreshToken,
} from "../services/remoteSession";
import {
  isRemoteAuthPreferred,
  isRemoteAuthRequired,
  loginRemoteAccount,
  logoutRemoteSession,
  resetPasswordRemote,
  requestPasswordResetRemote,
  registerRemoteAccount,
} from "../services/apiAuth";
import {
  loadRemoteVaultItems,
  saveRemoteVaultItems,
} from "../services/remoteVault";
import { createVaultSecret } from "../services/vaultCrypto";
import {
  clearLoginGuard,
  loadLoginGuard,
  saveLoginGuard,
} from "../services/loginGuard";
import { logSecurityEvent } from "../services/securityAudit";

import { generatePassword } from "../utils/passwordGenerator";

const AUTO_LOCK_OPTIONS = [30, 60, 120];

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
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [hasLocalAccount, setHasLocalAccount] = useState(false);
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [isResetMode, setIsResetMode] = useState(false);
  const [email, setEmail] = useState("");
  const [accessPassword, setAccessPassword] = useState("");
  const [confirmAccessPassword, setConfirmAccessPassword] = useState("");
  const [resetTokenInput, setResetTokenInput] = useState("");
  const [newAccessPassword, setNewAccessPassword] = useState("");
  const [confirmNewAccessPassword, setConfirmNewAccessPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [loginMessage, setLoginMessage] = useState("");
  const [failedLoginAttempts, setFailedLoginAttempts] = useState(0);
  const [loginLockLevel, setLoginLockLevel] = useState(0);
  const [loginLockUntil, setLoginLockUntil] = useState(0);
  const [hasLoadedLoginGuard, setHasLoadedLoginGuard] = useState(false);
  const [remoteRefreshToken, setRemoteRefreshToken] = useState("");
  const [remoteAccessToken, setRemoteAccessToken] = useState("");
  const [isRemoteVaultEnabled, setIsRemoteVaultEnabled] = useState(false);
  const [vaultSecret, setVaultSecret] = useState("");
  const [isAppUnlocked, setIsAppUnlocked] = useState(Platform.OS === "web");
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [autoLockSeconds, setAutoLockSeconds] = useState(60);
  const inactivityTimerRef = useRef(null);
  const shouldTryRemoteAuth = isRemoteAuthPreferred();
  const requireRemoteAuth = isRemoteAuthRequired();

  const clearInactivityTimer = useCallback(() => {
    if (!inactivityTimerRef.current) {
      return;
    }

    clearTimeout(inactivityTimerRef.current);
    inactivityTimerRef.current = null;
  }, []);

  const lockVault = useCallback(
    (reason = "") => {
      if (Platform.OS === "web") {
        return;
      }

      clearInactivityTimer();
      setIsAppUnlocked(false);
      setAuthMessage(reason);
    },
    [clearInactivityTimer],
  );

  const scheduleInactivityTimer = useCallback(() => {
    if (Platform.OS === "web" || !isAppUnlocked) {
      return;
    }

    clearInactivityTimer();
    inactivityTimerRef.current = setTimeout(() => {
      lockVault("Cofre bloqueado por inatividade.");
    }, autoLockSeconds * 1000);
  }, [autoLockSeconds, clearInactivityTimer, isAppUnlocked, lockVault]);

  const registerUserActivity = useCallback(() => {
    if (!isAppUnlocked || isAuthenticating) {
      return;
    }

    scheduleInactivityTimer();
  }, [isAppUnlocked, isAuthenticating, scheduleInactivityTimer]);

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
    async function initializeSession() {
      const account = await loadLocalAccount();
      const sessionToken = await loadSessionToken();
      const persistedRefreshToken = await loadRefreshToken();
      const loginGuard = await loadLoginGuard();

      if (sessionToken || persistedRefreshToken) {
        await clearSessionToken();
        await clearRefreshToken();
      }

      if (loginGuard) {
        const decayedGuard = applyLockDecay(loginGuard);

        setFailedLoginAttempts(decayedGuard.failedAttempts);
        setLoginLockLevel(decayedGuard.lockLevel);
        setLoginLockUntil(decayedGuard.lockUntil);
      }

      setHasLocalAccount(Boolean(account));
      setIsRegisterMode(!account);
      setIsLoggedIn(false);
      setRemoteRefreshToken("");
      setRemoteAccessToken("");
      setIsRemoteVaultEnabled(false);
      setVaultSecret("");
      setHasLoadedLoginGuard(true);
      setIsCheckingSession(false);
    }

    initializeSession();
  }, [shouldTryRemoteAuth]);

  useEffect(() => {
    if (!isLoggedIn) {
      setIsAppUnlocked(Platform.OS === "web");
      clearInactivityTimer();
      return;
    }

    requestAppUnlock();
  }, [clearInactivityTimer, isLoggedIn]);

  const applyRecoveryDeepLink = useCallback(
    (url) => {
      if (!url || !shouldTryRemoteAuth) {
        return;
      }

      let token = "";
      let emailFromLink = "";

      try {
        const parsedUrl = new URL(url);
        const rawPath = `${parsedUrl.hostname}${parsedUrl.pathname}`
          .replace(/^\/+/, "")
          .toLowerCase();

        if (!rawPath.includes("reset-password")) {
          return;
        }

        token = parsedUrl.searchParams.get("token")?.trim() || "";
        emailFromLink =
          parsedUrl.searchParams.get("email")?.trim().toLowerCase() || "";
      } catch {
        const tokenMatch = url.match(/[?&]token=([^&]+)/i);
        const emailMatch = url.match(/[?&]email=([^&]+)/i);

        token = tokenMatch ? decodeURIComponent(tokenMatch[1]).trim() : "";
        emailFromLink = emailMatch
          ? decodeURIComponent(emailMatch[1]).trim().toLowerCase()
          : "";
      }

      if (!token) {
        return;
      }

      setIsResetMode(true);
      setIsRegisterMode(false);
      setResetTokenInput(token);
      if (emailFromLink) {
        setEmail(emailFromLink);
      }
      setLoginMessage(
        "Token de recuperacao detectado. Defina a nova senha para continuar.",
      );

      logSecurityEvent({
        type: "password_reset_link_opened",
        status: "info",
      }).catch(() => {});
    },
    [shouldTryRemoteAuth],
  );

  useEffect(() => {
    let isMounted = true;

    if (Platform.OS === "web") {
      applyRecoveryDeepLink(window.location.href);

      const handlePopState = () => {
        applyRecoveryDeepLink(window.location.href);
      };

      window.addEventListener("popstate", handlePopState);

      return () => {
        isMounted = false;
        window.removeEventListener("popstate", handlePopState);
      };
    }

    const processInitialLink = async () => {
      try {
        const initialUrl = await Linking.getInitialURL();
        if (isMounted) {
          applyRecoveryDeepLink(initialUrl);
        }
      } catch {
        // Ignora erro de leitura de deep link inicial.
      }
    };

    processInitialLink();

    const subscription = Linking.addEventListener("url", ({ url }) => {
      applyRecoveryDeepLink(url);
    });

    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, [applyRecoveryDeepLink]);

  useEffect(() => {
    if (Platform.OS === "web") {
      return;
    }

    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active") {
        lockVault("Cofre bloqueado ao sair do app.");
        return;
      }

      registerUserActivity();
    });

    return () => {
      subscription.remove();
    };
  }, [lockVault, registerUserActivity]);

  useEffect(() => {
    if (!hasLoadedLoginGuard) {
      return;
    }

    const persistLoginGuard = async () => {
      if (!failedLoginAttempts && !loginLockLevel && !loginLockUntil) {
        await clearLoginGuard();
        return;
      }

      await saveLoginGuard({
        failedAttempts: failedLoginAttempts,
        lockLevel: loginLockLevel,
        lockUntil: loginLockUntil,
      });
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
      if (isRemoteVaultEnabled && remoteAccessToken) {
        try {
          const remoteItems = await loadRemoteVaultItems({
            accessToken: remoteAccessToken,
            vaultSecret,
          });
          setItems(remoteItems);
          setHasLoadedData(true);
          return;
        } catch {
          if (requireRemoteAuth) {
            Alert.alert(
              "Falha de sincronizacao",
              "Nao foi possivel carregar seu cofre remoto no momento.",
            );
            setItems([]);
            setHasLoadedData(true);
            return;
          }
        }
      }

      const localItems = await loadPasswords({ vaultSecret });
      setItems(localItems);
      setHasLoadedData(true);
    }

    init();
  }, [
    isLoggedIn,
    isRemoteVaultEnabled,
    remoteAccessToken,
    requireRemoteAuth,
    vaultSecret,
  ]);

  useEffect(() => {
    if (!hasLoadedData) return;

    const persistPasswords = async () => {
      if (isRemoteVaultEnabled && remoteAccessToken) {
        try {
          await saveRemoteVaultItems({
            accessToken: remoteAccessToken,
            items,
            vaultSecret,
          });
          return;
        } catch {
          if (requireRemoteAuth) {
            Alert.alert(
              "Falha de sincronizacao",
              "Nao foi possivel salvar seu cofre remoto no momento.",
            );
            return;
          }
        }
      }

      try {
        await savePasswords(items, { vaultSecret });
      } catch {
        Alert.alert(
          "Falha de seguranca",
          "Nao foi possivel salvar o cofre com seguranca neste dispositivo.",
        );
      }
    };

    persistPasswords();
  }, [
    hasLoadedData,
    isRemoteVaultEnabled,
    items,
    remoteAccessToken,
    requireRemoteAuth,
    vaultSecret,
  ]);

  useEffect(() => {
    if (!isAppUnlocked) {
      clearInactivityTimer();
      return;
    }

    scheduleInactivityTimer();

    return () => {
      clearInactivityTimer();
    };
  }, [
    autoLockSeconds,
    clearInactivityTimer,
    isAppUnlocked,
    scheduleInactivityTimer,
  ]);

  const addPassword = () => {
    registerUserActivity();

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
    registerUserActivity();
    setItems((prevItems) => prevItems.filter((item) => item.id !== id));
  };

  const updatePassword = (id, payload) => {
    registerUserActivity();
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

    if (accessPassword.length < 4) {
      setLoginMessage("Senha deve ter pelo menos 4 caracteres.");
      return null;
    }

    return { normalizedEmail, accessPassword };
  };

  const resetAuthFields = () => {
    setEmail("");
    setAccessPassword("");
    setConfirmAccessPassword("");
    setResetTokenInput("");
    setNewAccessPassword("");
    setConfirmNewAccessPassword("");
  };

  const handleResetPassword = async () => {
    if (!shouldTryRemoteAuth) {
      setLoginMessage("Recuperacao por token exige backend de autenticacao.");
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      setLoginMessage("Informe um email valido para redefinir a senha.");
      return;
    }

    if (!resetTokenInput.trim()) {
      setLoginMessage("Informe o token de recuperacao.");
      return;
    }

    if (!newAccessPassword || !confirmNewAccessPassword) {
      setLoginMessage("Preencha a nova senha e a confirmacao.");
      return;
    }

    if (newAccessPassword !== confirmNewAccessPassword) {
      setLoginMessage("As senhas nao conferem.");
      return;
    }

    const passwordPolicyError = validateAccessPasswordPolicy(newAccessPassword);
    if (passwordPolicyError) {
      setLoginMessage(passwordPolicyError);
      return;
    }

    try {
      await resetPasswordRemote({
        token: resetTokenInput.trim(),
        password: newAccessPassword,
      });

      try {
        await saveLocalAccount({
          email: normalizedEmail,
          password: newAccessPassword,
        });
      } catch {
        // Fluxo remoto segue valido mesmo sem atualizar fallback local.
      }

      setIsResetMode(false);
      setIsRegisterMode(false);
      setResetTokenInput("");
      setNewAccessPassword("");
      setConfirmNewAccessPassword("");
      setAccessPassword("");
      setConfirmAccessPassword("");
      setLoginMessage(
        "Senha redefinida com sucesso. Faca login para continuar.",
      );
      logSecurityEvent({
        type: "password_reset_success_remote",
        status: "info",
      }).catch(() => {});
    } catch {
      setLoginMessage("Token invalido/expirado ou falha ao redefinir a senha.");
      logSecurityEvent({
        type: "password_reset_failed_remote",
        status: "warning",
      }).catch(() => {});
    }
  };

  const handleLogin = async () => {
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

    if (shouldTryRemoteAuth) {
      try {
        const remoteAuth = await loginRemoteAccount({
          email: credentials.normalizedEmail,
          password: credentials.accessPassword,
        });

        setFailedLoginAttempts(0);
        setLoginLockLevel(0);
        setLoginLockUntil(0);

        if (rememberMe) {
          try {
            await saveSessionToken(remoteAuth?.accessToken);
            await saveRefreshToken(remoteAuth?.refreshToken);
          } catch {
            setLoginMessage(
              "Nao foi possivel manter sua sessao com seguranca neste dispositivo.",
            );
            logSecurityEvent({
              type: "session_persist_failed",
              status: "error",
            }).catch(() => {});
            return;
          }
        } else {
          await clearSessionToken();
          await clearRefreshToken();
        }

        setRemoteRefreshToken(remoteAuth?.refreshToken || "");
        setRemoteAccessToken(remoteAuth?.accessToken || "");
        setIsRemoteVaultEnabled(true);
        setVaultSecret(
          createVaultSecret({
            email: credentials.normalizedEmail,
            password: credentials.accessPassword,
          }),
        );

        logSecurityEvent({
          type: "login_success_remote",
          status: "info",
        }).catch(() => {});

        setLoginMessage("");
        setIsLoggedIn(true);
        resetAuthFields();
        return;
      } catch (error) {
        if (requireRemoteAuth) {
          if (error?.status === 401) {
            registerFailedAttempt();
            return;
          }

          setLoginMessage(
            "Backend de autenticacao indisponivel no momento. Tente novamente.",
          );
          logSecurityEvent({
            type: "login_remote_unavailable",
            status: "warning",
          }).catch(() => {});
          return;
        }
      }
    }

    const account = await loadLocalAccount();
    if (!account) {
      setLoginMessage("Nenhuma conta local. Crie sua conta para continuar.");
      setIsRegisterMode(true);
      logSecurityEvent({
        type: "login_without_account",
        status: "warning",
      }).catch(() => {});
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

    if (rememberMe) {
      try {
        await saveSessionToken();
        await clearRefreshToken();
      } catch {
        setLoginMessage(
          "Nao foi possivel manter sua sessao com seguranca neste dispositivo.",
        );
        logSecurityEvent({
          type: "session_persist_failed",
          status: "error",
        }).catch(() => {});
        return;
      }
    } else {
      await clearSessionToken();
      await clearRefreshToken();
    }

    setRemoteRefreshToken("");
    setRemoteAccessToken("");
    setIsRemoteVaultEnabled(false);
    setVaultSecret(
      createVaultSecret({
        email: credentials.normalizedEmail,
        password: credentials.accessPassword,
      }),
    );

    logSecurityEvent({
      type: "login_success",
      status: "info",
    }).catch(() => {});

    setLoginMessage("");
    setIsLoggedIn(true);
    resetAuthFields();
  };

  const handleCreateAccount = async () => {
    const credentials = validateCredentials();
    if (!credentials) {
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

    let remoteAccountAlreadyExists = false;

    if (shouldTryRemoteAuth) {
      try {
        await registerRemoteAccount({
          email: credentials.normalizedEmail,
          password: credentials.accessPassword,
        });
      } catch (error) {
        if (error?.status === 409) {
          remoteAccountAlreadyExists = true;

          if (requireRemoteAuth) {
            setIsRegisterMode(false);
            setLoginMessage("Conta ja existe para este email. Faca login.");
            return;
          }
        }

        if (requireRemoteAuth) {
          setLoginMessage(
            "Nao foi possivel criar conta no backend agora. Tente novamente.",
          );
          logSecurityEvent({
            type: "account_create_remote_failed",
            status: "warning",
          }).catch(() => {});
          return;
        }
      }
    }

    try {
      await saveLocalAccount({
        email: credentials.normalizedEmail,
        password: credentials.accessPassword,
      });
    } catch {
      setLoginMessage(
        "Nao foi possivel salvar a conta com seguranca neste dispositivo.",
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
    if (remoteAccountAlreadyExists) {
      setLoginMessage(
        "Conta local preparada neste dispositivo. Sua conta remota ja existia; faca login para continuar.",
      );
    } else {
      setLoginMessage("Conta criada com sucesso. Faca login para continuar.");
    }
    setAccessPassword("");
    setConfirmAccessPassword("");
  };

  const handleForgotPassword = async () => {
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      setLoginMessage("Informe um email valido para recuperar o acesso.");
      return;
    }

    if (shouldTryRemoteAuth) {
      try {
        const result = await requestPasswordResetRemote({
          email: normalizedEmail,
        });

        const hasDevToken = Boolean(result?.devResetToken);
        const message = hasDevToken
          ? `Recuperacao solicitada. Token dev: ${result.devResetToken}`
          : "Recuperacao solicitada. Verifique seu email.";

        setIsResetMode(true);
        setIsRegisterMode(false);
        setResetTokenInput(result?.devResetToken || "");
        setNewAccessPassword("");
        setConfirmNewAccessPassword("");
        setLoginMessage(message);
        logSecurityEvent({
          type: "password_reset_requested_remote",
          status: "info",
        }).catch(() => {});

        Alert.alert(
          "Recuperacao de conta",
          hasDevToken
            ? "No ambiente de desenvolvimento, use o token exibido na mensagem para redefinir via endpoint /auth/reset-password."
            : "Se o email existir, as instrucoes de recuperacao serao enviadas.",
        );

        return;
      } catch {
        if (requireRemoteAuth) {
          setLoginMessage(
            "Nao foi possivel iniciar recuperacao no backend agora. Tente novamente.",
          );
          return;
        }
      }
    }

    if (!hasLocalAccount) {
      setLoginMessage("Crie sua conta local para definir uma senha.");
      setIsRegisterMode(true);
      return;
    }

    Alert.alert(
      "Recuperacao local",
      "Este app roda sem backend. Para recuperar, recrie a conta local agora com a nova senha.",
    );
    setIsRegisterMode(true);
    setAccessPassword("");
    setConfirmAccessPassword("");
    setLoginMessage("Recuperacao iniciada. Recrie sua conta local.");
  };

  const handleLogout = async () => {
    if (remoteRefreshToken) {
      try {
        await logoutRemoteSession({
          refreshToken: remoteRefreshToken,
        });
      } catch {
        logSecurityEvent({
          type: "logout_remote_failed",
          status: "warning",
        }).catch(() => {});
      }
    }

    await clearSessionToken();
    await clearRefreshToken();
    setRemoteRefreshToken("");
    setRemoteAccessToken("");
    setIsRemoteVaultEnabled(false);
    setVaultSecret("");
    logSecurityEvent({
      type: "logout",
      status: "info",
    }).catch(() => {});
    setIsLoggedIn(false);
    setItems([]);
    setSearch("");
    setHasLoadedData(false);
    setIsAppUnlocked(Platform.OS === "web");
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

        <View
          style={[
            styles.loginContainer,
            { backgroundColor: theme.card, borderColor: theme.border },
          ]}
        >
          <BrandLogo theme={theme} size="compact" />
          <Text style={[styles.loginTitle, { color: theme.text }]}>
            Entrar no SecPass
          </Text>
          <Text style={[styles.loginText, { color: theme.textSoft }]}>
            {isResetMode
              ? "Informe token e nova senha para recuperar seu acesso."
              : isRegisterMode
                ? "Crie sua conta local para acessar o cofre."
                : "Acesse sua conta para abrir o cofre."}
          </Text>

          <TextInput
            placeholder="Email"
            placeholderTextColor={theme.textMuted}
            value={email}
            autoCapitalize="none"
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

          {!isResetMode && (
            <TextInput
              placeholder={
                isRegisterMode ? "Crie sua senha de acesso" : "Senha de acesso"
              }
              placeholderTextColor={theme.textMuted}
              value={accessPassword}
              secureTextEntry
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
          )}

          {isRegisterMode && !isResetMode && (
            <TextInput
              placeholder="Confirme sua senha"
              placeholderTextColor={theme.textMuted}
              value={confirmAccessPassword}
              secureTextEntry
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

          {isResetMode && (
            <>
              <TextInput
                placeholder="Token de recuperacao"
                placeholderTextColor={theme.textMuted}
                value={resetTokenInput}
                autoCapitalize="none"
                onChangeText={setResetTokenInput}
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
                placeholder="Nova senha"
                placeholderTextColor={theme.textMuted}
                value={newAccessPassword}
                secureTextEntry
                onChangeText={setNewAccessPassword}
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
                placeholder="Confirme a nova senha"
                placeholderTextColor={theme.textMuted}
                value={confirmNewAccessPassword}
                secureTextEntry
                onChangeText={setConfirmNewAccessPassword}
                style={[
                  styles.loginInput,
                  {
                    backgroundColor: theme.cardSoft,
                    borderColor: theme.borderStrong,
                    color: theme.text,
                  },
                ]}
              />
            </>
          )}

          <Pressable
            style={({ pressed }) => [
              styles.loginButton,
              { backgroundColor: theme.primary },
              pressed && styles.pressed,
            ]}
            onPress={
              isResetMode
                ? handleResetPassword
                : isRegisterMode
                  ? handleCreateAccount
                  : handleLogin
            }
          >
            <Text
              style={[styles.loginButtonText, { color: theme.primaryText }]}
            >
              {isResetMode
                ? "Redefinir senha"
                : isRegisterMode
                  ? "Criar conta"
                  : "Entrar"}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              if (isResetMode) {
                setIsResetMode(false);
                setIsRegisterMode(false);
              } else {
                setIsRegisterMode((prev) => !prev);
              }
              setLoginMessage("");
              setAccessPassword("");
              setConfirmAccessPassword("");
              setResetTokenInput("");
              setNewAccessPassword("");
              setConfirmNewAccessPassword("");
            }}
          >
            <Text style={[styles.switchAuthText, { color: theme.accent }]}>
              {isResetMode
                ? "Voltar para login"
                : isRegisterMode
                  ? "Ja tenho conta"
                  : "Criar conta local"}
            </Text>
          </Pressable>

          {!isResetMode && (
            <View style={styles.loginMetaRow}>
              <Pressable
                style={styles.rememberToggle}
                onPress={() => setRememberMe((prev) => !prev)}
              >
                <View
                  style={[
                    styles.checkbox,
                    {
                      borderColor: theme.borderStrong,
                      backgroundColor: rememberMe
                        ? theme.primary
                        : theme.cardSoft,
                    },
                  ]}
                >
                  {rememberMe && (
                    <Text
                      style={[
                        styles.checkboxText,
                        { color: theme.primaryText },
                      ]}
                    >
                      ✓
                    </Text>
                  )}
                </View>
                <Text style={[styles.rememberText, { color: theme.textSoft }]}>
                  Lembrar de mim
                </Text>
              </Pressable>

              <Pressable onPress={handleForgotPassword}>
                <Text style={[styles.forgotText, { color: theme.accent }]}>
                  Esqueci minha senha
                </Text>
              </Pressable>
            </View>
          )}

          {!isResetMode && shouldTryRemoteAuth && (
            <Pressable
              onPress={() => {
                setIsResetMode(true);
                setIsRegisterMode(false);
                setLoginMessage("");
              }}
            >
              <Text style={[styles.switchAuthText, { color: theme.accent }]}>
                Ja tenho token de recuperacao
              </Text>
            </Pressable>
          )}

          {!!loginMessage && (
            <Text style={[styles.loginMessage, { color: theme.dangerText }]}>
              {loginMessage}
            </Text>
          )}
        </View>
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
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: theme.bg }]}
      onTouchStart={registerUserActivity}
    >
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
              <Pressable
                style={({ pressed }) => [
                  styles.logoutButton,
                  { backgroundColor: theme.secondaryButton },
                  pressed && styles.pressed,
                ]}
                onPress={handleLogout}
              >
                <Text
                  style={[styles.logoutText, { color: theme.secondaryText }]}
                >
                  Sair
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

            <View
              style={[
                styles.autoLockCard,
                { backgroundColor: theme.card, borderColor: theme.border },
              ]}
            >
              <Text style={[styles.autoLockTitle, { color: theme.text }]}>
                Auto-lock
              </Text>
              <Text
                style={[styles.autoLockSubtitle, { color: theme.textSoft }]}
              >
                Bloqueie automaticamente apos inatividade.
              </Text>
              <View style={styles.autoLockActions}>
                {AUTO_LOCK_OPTIONS.map((seconds) => {
                  const isActive = autoLockSeconds === seconds;

                  return (
                    <Pressable
                      key={seconds}
                      style={({ pressed }) => [
                        styles.autoLockOption,
                        {
                          backgroundColor: isActive
                            ? theme.primary
                            : theme.secondaryButton,
                        },
                        pressed && styles.pressed,
                      ]}
                      onPress={() => {
                        setAutoLockSeconds(seconds);
                        registerUserActivity();
                      }}
                    >
                      <Text
                        style={[
                          styles.autoLockOptionText,
                          {
                            color: isActive
                              ? theme.primaryText
                              : theme.secondaryText,
                          },
                        ]}
                      >
                        {seconds}s
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <SearchBar
              value={search}
              onChangeText={(value) => {
                registerUserActivity();
                setSearch(value);
              }}
              theme={theme}
            />

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
        onScrollBeginDrag={registerUserActivity}
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
  centeredState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loginContainer: {
    marginTop: 80,
    borderWidth: 1,
    borderRadius: 20,
    padding: 22,
    gap: 10,
  },
  loginTitle: {
    marginTop: 4,
    fontSize: 22,
    fontWeight: "800",
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
  loginButtonText: {
    fontWeight: "700",
    fontSize: 14,
  },
  loginMetaRow: {
    marginTop: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  rememberToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderWidth: 1,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxText: {
    fontWeight: "800",
    fontSize: 12,
  },
  rememberText: {
    fontSize: 12,
    fontWeight: "600",
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
  header: {
    marginBottom: 16,
  },
  logoutButton: {
    alignSelf: "flex-end",
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  logoutText: {
    fontWeight: "700",
    fontSize: 12,
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
  autoLockCard: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  autoLockTitle: {
    fontSize: 13,
    fontWeight: "700",
  },
  autoLockSubtitle: {
    marginTop: 3,
    fontSize: 12,
  },
  autoLockActions: {
    marginTop: 10,
    flexDirection: "row",
    gap: 8,
  },
  autoLockOption: {
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  autoLockOptionText: {
    fontSize: 12,
    fontWeight: "700",
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
