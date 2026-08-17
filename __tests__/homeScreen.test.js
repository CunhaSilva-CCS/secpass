import React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { Alert, AppState, Platform, Share } from "react-native";

import HomeScreen from "../src/screens/HomeScreen";
import { createVaultSecret, encryptVaultItems } from "../src/services/vaultCrypto";

jest.mock("../src/hooks/use-color-scheme", () => ({
  useColorScheme: () => "light",
}));

jest.mock("../src/components/BrandLogo", () => {
  const ReactModule = require("react");
  const { Text } = require("react-native");

  return function MockBrandLogo() {
    return ReactModule.createElement(Text, null, "BrandLogo");
  };
});

jest.mock("../src/components/SearchBar", () => {
  const ReactModule = require("react");
  const { TextInput } = require("react-native");

  return function MockSearchBar({ value, onChangeText }) {
    return ReactModule.createElement(TextInput, {
      placeholder: "Pesquisar por titulo ou usuario",
      value,
      onChangeText,
    });
  };
});

jest.mock("../src/components/PasswordForm", () => {
  const ReactModule = require("react");
  const { Pressable, Text, TextInput, View } = require("react-native");

  return function MockPasswordForm({
    title,
    username,
    password,
    onTitleChange,
    onUsernameChange,
    onPasswordChange,
    onSave,
  }) {
    return ReactModule.createElement(
      View,
      null,
      ReactModule.createElement(TextInput, {
        placeholder: "Titulo",
        value: title,
        onChangeText: onTitleChange,
      }),
      ReactModule.createElement(TextInput, {
        placeholder: "Usuario",
        value: username,
        onChangeText: onUsernameChange,
      }),
      ReactModule.createElement(TextInput, {
        placeholder: "Senha",
        value: password,
        onChangeText: onPasswordChange,
      }),
      ReactModule.createElement(
        Pressable,
        { onPress: onSave },
        ReactModule.createElement(Text, null, "Salvar"),
      ),
    );
  };
});

jest.mock("../src/components/PasswordCard", () => {
  const ReactModule = require("react");
  const { Text, View } = require("react-native");

  return function MockPasswordCard({ item }) {
    return ReactModule.createElement(
      View,
      null,
      ReactModule.createElement(Text, null, item.title),
      ReactModule.createElement(Text, null, item.username),
    );
  };
});

jest.mock("../src/utils/biometricAuth", () => ({
  authenticateVaultAccess: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock("../src/services/storage", () => ({
  loadPasswords: jest.fn(),
  savePasswords: jest.fn(),
  clearVault: jest.fn().mockResolvedValue(),
}));

jest.mock("../src/services/session", () => ({
  loadSessionToken: jest.fn(),
  saveSessionToken: jest.fn(),
  clearSessionToken: jest.fn(),
}));

jest.mock("../src/services/account", () => ({
  loadLocalAccount: jest.fn(),
  saveLocalAccount: jest.fn(),
  verifyLocalAccount: jest.fn(),
  deleteLocalAccount: jest.fn().mockResolvedValue(),
}));

jest.mock("../src/services/loginGuard", () => ({
  loadLoginGuard: jest.fn().mockResolvedValue(null),
  saveLoginGuard: jest.fn().mockResolvedValue(),
  clearLoginGuard: jest.fn().mockResolvedValue(),
}));

jest.mock("../src/services/securityAudit", () => ({
  logSecurityEvent: jest.fn().mockResolvedValue(),
  clearSecurityEvents: jest.fn().mockResolvedValue(),
  loadSecurityEvents: jest.fn().mockResolvedValue([]),
}));

jest.mock("expo-screen-capture", () => ({
  preventScreenCaptureAsync: jest.fn().mockResolvedValue(),
  allowScreenCaptureAsync: jest.fn().mockResolvedValue(),
  enableAppSwitcherProtectionAsync: jest.fn().mockResolvedValue(),
  disableAppSwitcherProtectionAsync: jest.fn().mockResolvedValue(),
  addScreenshotListener: jest.fn().mockReturnValue({ remove: jest.fn() }),
}));

const { loadPasswords, clearVault, savePasswords } = require("../src/services/storage");
const { loadSessionToken, clearSessionToken } = require("../src/services/session");
const { loadLoginGuard } = require("../src/services/loginGuard");
const { logSecurityEvent, clearSecurityEvents, loadSecurityEvents } =
  require("../src/services/securityAudit");
const ScreenCapture = require("expo-screen-capture");
const {
  loadLocalAccount,
  saveLocalAccount,
  verifyLocalAccount,
  deleteLocalAccount,
} = require("../src/services/account");

const ACCESS_PASSWORD = "Ab1!cd23";
const REAL_CRYPTO_TIMEOUT = 60000;

async function registerAccount(
  findByPlaceholderText,
  getByText,
  password = ACCESS_PASSWORD,
) {
  const emailInput = await findByPlaceholderText("Email");
  const createAccessPasswordInput = await findByPlaceholderText(
    "Crie sua senha de acesso",
  );
  const confirmAccessPasswordInput =
    await findByPlaceholderText("Confirme sua senha");

  fireEvent.changeText(emailInput, "user@email.com");
  fireEvent.changeText(createAccessPasswordInput, password);
  fireEvent.changeText(confirmAccessPasswordInput, password);
  fireEvent.press(getByText("Criar conta"));

  await waitFor(() => {
    expect(getByText("Entrar")).toBeTruthy();
  });
}

async function loginInApp(findByPlaceholderText, getByText) {
  await registerAccount(findByPlaceholderText, getByText, ACCESS_PASSWORD);

  const loginEmailInput = await findByPlaceholderText("Email");
  const loginAccessPasswordInput =
    await findByPlaceholderText("Senha de acesso");

  fireEvent.changeText(loginEmailInput, "user@email.com");
  fireEvent.changeText(loginAccessPasswordInput, ACCESS_PASSWORD);
  fireEvent.press(getByText("Entrar"));

  await waitFor(() => {
    expect(getByText("Sua central de credenciais")).toBeTruthy();
  });
}

// O efeito do AppState e re-registrado sempre que isLoggedIn muda (login ou
// logout), entao o listener mais recente e o unico com os closures atuais do
// componente. Mockamos addEventListener para sempre devolver uma subscription
// valida (evita comportamento inconsistente do modulo nativo em teste) e
// guardamos cada listener registrado para pegar o mais recente sob demanda.
function mockAppStateChange() {
  const listeners = [];

  jest
    .spyOn(AppState, "addEventListener")
    .mockImplementation((eventName, handler) => {
      if (eventName === "change") {
        listeners.push(handler);
      }
      return { remove: jest.fn() };
    });

  return () => listeners[listeners.length - 1];
}

describe("HomeScreen", () => {
  beforeEach(() => {
    let account = null;

    jest.clearAllMocks();
    Platform.OS = "ios";
    loadSessionToken.mockResolvedValue(null);
    loadLocalAccount.mockImplementation(async () => account);
    saveLocalAccount.mockImplementation(async ({ email, password }) => {
      account = {
        email,
        password,
      };
    });
    verifyLocalAccount.mockImplementation(async ({ email, password }) => {
      return (
        !!account && account.email === email && account.password === password
      );
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("adiciona nova credencial", async () => {
    loadPasswords.mockResolvedValueOnce([]);

    const { findByPlaceholderText, getByPlaceholderText, getByText } = render(
      <HomeScreen />,
    );

    await loginInApp(findByPlaceholderText, getByText);

    fireEvent.changeText(getByPlaceholderText("Titulo"), "GitHub");
    fireEvent.changeText(getByPlaceholderText("Usuario"), "clemilton");
    fireEvent.changeText(getByPlaceholderText("Senha"), "Segura!123");
    fireEvent.press(getByText("Salvar"));

    await waitFor(() => {
      expect(getByText("GitHub")).toBeTruthy();
      expect(getByText("clemilton")).toBeTruthy();
    });
  });

  it("filtra credenciais pela busca", async () => {
    loadPasswords.mockResolvedValueOnce([
      {
        id: "1",
        title: "GitHub",
        username: "dev-user",
        password: "A!23456789",
      },
      {
        id: "2",
        title: "Email",
        username: "mail-user",
        password: "B!23456789",
      },
    ]);

    const {
      findByPlaceholderText,
      getByPlaceholderText,
      getByText,
      queryByText,
    } = render(<HomeScreen />);

    await loginInApp(findByPlaceholderText, getByText);

    await waitFor(() => {
      expect(getByText("GitHub")).toBeTruthy();
      expect(getByText("Email")).toBeTruthy();
    });

    fireEvent.changeText(
      getByPlaceholderText("Pesquisar por titulo ou usuario"),
      "git",
    );

    await waitFor(() => {
      expect(getByText("GitHub")).toBeTruthy();
      expect(queryByText("Email")).toBeNull();
    });
  });

  it("mostra o historico de eventos de seguranca ao abrir o modal", async () => {
    loadPasswords.mockResolvedValueOnce([]);
    loadSecurityEvents.mockResolvedValueOnce([
      {
        id: "1",
        type: "login_success",
        status: "info",
        createdAt: "2026-01-01T10:00:00.000Z",
      },
      {
        id: "2",
        type: "account_created",
        status: "info",
        createdAt: "2026-01-01T09:00:00.000Z",
      },
    ]);

    const { findByPlaceholderText, getByText } = render(<HomeScreen />);
    await loginInApp(findByPlaceholderText, getByText);

    fireEvent.press(getByText("Ver historico de seguranca"));

    await waitFor(() => {
      expect(getByText("Login bem-sucedido")).toBeTruthy();
      expect(getByText("Conta local criada")).toBeTruthy();
    });
  });

  it("mostra mensagem quando nao ha eventos de seguranca", async () => {
    loadPasswords.mockResolvedValueOnce([]);
    loadSecurityEvents.mockResolvedValueOnce([]);

    const { findByPlaceholderText, getByText } = render(<HomeScreen />);
    await loginInApp(findByPlaceholderText, getByText);

    fireEvent.press(getByText("Ver historico de seguranca"));

    await waitFor(() => {
      expect(getByText("Nenhum evento registrado.")).toBeTruthy();
    });
  });

  it("limpa o historico de seguranca apos confirmacao", async () => {
    loadPasswords.mockResolvedValueOnce([]);
    loadSecurityEvents.mockResolvedValueOnce([
      {
        id: "1",
        type: "login_success",
        status: "info",
        createdAt: "2026-01-01T10:00:00.000Z",
      },
    ]);
    const alertSpy = jest
      .spyOn(Alert, "alert")
      .mockImplementation((title, message, buttons) => {
        const confirmButton = buttons.find(
          (button) => button.text === "Limpar",
        );
        confirmButton?.onPress();
      });

    const { findByPlaceholderText, getByText, queryByText } = render(
      <HomeScreen />,
    );
    await loginInApp(findByPlaceholderText, getByText);

    fireEvent.press(getByText("Ver historico de seguranca"));

    await waitFor(() => {
      expect(getByText("Login bem-sucedido")).toBeTruthy();
    });

    fireEvent.press(getByText("Limpar historico"));

    await waitFor(() => {
      expect(clearSecurityEvents).toHaveBeenCalled();
      expect(queryByText("Login bem-sucedido")).toBeNull();
    });

    alertSpy.mockRestore();
  });

  it("ativa protecao de captura de tela ao desbloquear e desativa ao sair", async () => {
    loadPasswords.mockResolvedValueOnce([]);

    const { findByPlaceholderText, getByText } = render(<HomeScreen />);
    await loginInApp(findByPlaceholderText, getByText);

    await waitFor(() => {
      expect(ScreenCapture.enableAppSwitcherProtectionAsync).toHaveBeenCalled();
      expect(ScreenCapture.preventScreenCaptureAsync).toHaveBeenCalled();
    });

    fireEvent.press(getByText("Sair"));

    await waitFor(() => {
      expect(ScreenCapture.allowScreenCaptureAsync).toHaveBeenCalled();
      expect(ScreenCapture.disableAppSwitcherProtectionAsync).toHaveBeenCalled();
    });
  });

  it("registra evento de seguranca ao detectar uma captura de tela", async () => {
    loadPasswords.mockResolvedValueOnce([]);

    const { findByPlaceholderText, getByText } = render(<HomeScreen />);
    await loginInApp(findByPlaceholderText, getByText);

    await waitFor(() => {
      expect(ScreenCapture.addScreenshotListener).toHaveBeenCalled();
    });

    const screenshotHandler =
      ScreenCapture.addScreenshotListener.mock.calls[0][0];
    screenshotHandler();

    await waitFor(() => {
      expect(logSecurityEvent).toHaveBeenCalledWith({
        type: "screenshot_detected",
        status: "warning",
      });
    });
  });

  it("bloqueia o cofre por inatividade apos o tempo limite", async () => {
    loadPasswords.mockResolvedValueOnce([]);

    const { findByPlaceholderText, getByText, getByPlaceholderText } = render(
      <HomeScreen />,
    );
    await loginInApp(findByPlaceholderText, getByText);

    await waitFor(() => {
      expect(getByText("Sua central de credenciais")).toBeTruthy();
    });

    jest.useFakeTimers();

    // Gera uma nova atividade agora que os timers falsos estao ativos, para
    // que o proximo setTimeout do temporizador de inatividade seja criado
    // sob o relogio falso (o anterior foi agendado com o relogio real).
    fireEvent.changeText(
      getByPlaceholderText("Pesquisar por titulo ou usuario"),
      "a",
    );

    await act(async () => {
      await jest.advanceTimersByTimeAsync(2 * 60 * 1000);
    });

    expect(getByText("Cofre bloqueado")).toBeTruthy();
    expect(getByText("Cofre bloqueado por inatividade.")).toBeTruthy();
  });

  it("rejeita cadastro quando a confirmacao de senha nao confere", async () => {
    const { findByPlaceholderText, getByText } = render(<HomeScreen />);

    const emailInput = await findByPlaceholderText("Email");
    const createAccessPasswordInput = await findByPlaceholderText(
      "Crie sua senha de acesso",
    );
    const confirmAccessPasswordInput =
      await findByPlaceholderText("Confirme sua senha");

    fireEvent.changeText(emailInput, "user@email.com");
    fireEvent.changeText(createAccessPasswordInput, ACCESS_PASSWORD);
    fireEvent.changeText(confirmAccessPasswordInput, "Diferente!123");
    fireEvent.press(getByText("Criar conta"));

    await waitFor(() => {
      expect(getByText("As senhas nao conferem.")).toBeTruthy();
    });
    expect(saveLocalAccount).not.toHaveBeenCalled();
  });

  it("rejeita cadastro quando a senha nao atende a politica minima", async () => {
    const { findByPlaceholderText, getByText } = render(<HomeScreen />);

    const emailInput = await findByPlaceholderText("Email");
    const createAccessPasswordInput = await findByPlaceholderText(
      "Crie sua senha de acesso",
    );
    const confirmAccessPasswordInput =
      await findByPlaceholderText("Confirme sua senha");

    fireEvent.changeText(emailInput, "user@email.com");
    fireEvent.changeText(createAccessPasswordInput, "abcdefgh");
    fireEvent.changeText(confirmAccessPasswordInput, "abcdefgh");
    fireEvent.press(getByText("Criar conta"));

    await waitFor(() => {
      expect(getByText("Senha deve incluir ao menos 1 numero.")).toBeTruthy();
    });
    expect(saveLocalAccount).not.toHaveBeenCalled();
  });

  it("mostra tentativas restantes ao errar a senha de login", async () => {
    const { findByPlaceholderText, getByText } = render(<HomeScreen />);
    await registerAccount(findByPlaceholderText, getByText);

    const loginEmailInput = await findByPlaceholderText("Email");
    const loginAccessPasswordInput =
      await findByPlaceholderText("Senha de acesso");

    fireEvent.changeText(loginEmailInput, "user@email.com");
    fireEvent.changeText(loginAccessPasswordInput, "SenhaErrada!1");
    fireEvent.press(getByText("Entrar"));

    await waitFor(() => {
      expect(
        getByText(
          "Email ou senha incorretos. Restam 4 tentativa(s) antes do bloqueio.",
        ),
      ).toBeTruthy();
    });
  });

  it("bloqueia login progressivamente apos 5 tentativas erradas seguidas", async () => {
    const { findByPlaceholderText, getByText } = render(<HomeScreen />);
    await registerAccount(findByPlaceholderText, getByText);

    const loginEmailInput = await findByPlaceholderText("Email");
    const loginAccessPasswordInput =
      await findByPlaceholderText("Senha de acesso");

    fireEvent.changeText(loginEmailInput, "user@email.com");

    for (let attempt = 1; attempt <= 4; attempt += 1) {
      fireEvent.changeText(loginAccessPasswordInput, "SenhaErrada!1");
      fireEvent.press(getByText("Entrar"));

      // eslint-disable-next-line no-await-in-loop
      await waitFor(() => {
        expect(
          getByText(
            `Email ou senha incorretos. Restam ${5 - attempt} tentativa(s) antes do bloqueio.`,
          ),
        ).toBeTruthy();
      });
    }

    fireEvent.changeText(loginAccessPasswordInput, "SenhaErrada!1");
    fireEvent.press(getByText("Entrar"));

    await waitFor(() => {
      expect(getByText(/^Muitas tentativas\. Tente novamente em \d+s\.$/)).toBeTruthy();
    });
  });

  it("exige confirmacao antes de recriar a conta em Esqueci minha senha", async () => {
    const alertSpy = jest
      .spyOn(Alert, "alert")
      .mockImplementation((title, message, buttons) => {
        const continueButton = buttons.find(
          (button) => button.text === "Continuar mesmo assim",
        );
        continueButton.onPress();
      });

    const { findByPlaceholderText, getByText } = render(<HomeScreen />);
    await registerAccount(findByPlaceholderText, getByText);

    fireEvent.press(getByText("Esqueci minha senha"));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        "Isso apaga o acesso ao cofre atual",
        expect.stringContaining("nao ha como recuperar a senha antiga"),
        expect.any(Array),
      );
    });

    await waitFor(() => {
      expect(
        getByText(
          "Recriando conta local. O cofre anterior sera perdido sem um backup.",
        ),
      ).toBeTruthy();
    });

    alertSpy.mockRestore();
  });

  it("exclui a conta e todos os dados apos confirmacao", async () => {
    loadPasswords.mockResolvedValueOnce([]);
    const alertSpy = jest
      .spyOn(Alert, "alert")
      .mockImplementation((title, message, buttons) => {
        if (Array.isArray(buttons)) {
          const confirmButton = buttons.find(
            (button) => button.text === "Excluir tudo",
          );
          confirmButton?.onPress();
        }
      });

    const { findByPlaceholderText, getByText } = render(<HomeScreen />);
    await loginInApp(findByPlaceholderText, getByText);

    fireEvent.press(getByText("Excluir conta e todos os dados"));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        "Excluir conta e todos os dados",
        expect.stringContaining("nao pode ser desfeita"),
        expect.any(Array),
      );
    });

    await waitFor(() => {
      expect(clearVault).toHaveBeenCalled();
      expect(deleteLocalAccount).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(
        getByText("Conta e dados excluidos deste aparelho."),
      ).toBeTruthy();
      expect(getByText("Criar conta")).toBeTruthy();
    });

    alertSpy.mockRestore();
  });

  it("exige biometria antes de permitir excluir a conta", async () => {
    loadPasswords.mockResolvedValueOnce([]);
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});

    const { findByPlaceholderText, getByText } = render(<HomeScreen />);
    await loginInApp(findByPlaceholderText, getByText);

    const biometricAuth = require("../src/utils/biometricAuth");
    biometricAuth.authenticateVaultAccess.mockResolvedValueOnce({
      success: false,
      error: "not_available",
    });

    fireEvent.press(getByText("Excluir conta e todos os dados"));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        "Autenticacao necessaria",
        "Autentique-se com biometria para excluir a conta e os dados.",
      );
    });
    expect(clearVault).not.toHaveBeenCalled();
    expect(deleteLocalAccount).not.toHaveBeenCalled();

    alertSpy.mockRestore();
  });

  it(
    "exporta o cofre cifrado via compartilhamento nativo",
    async () => {
      loadPasswords.mockResolvedValueOnce([
        {
          id: "1",
          title: "GitHub",
          username: "dev-user",
          password: "A!23456789",
        },
      ]);
      const shareSpy = jest
        .spyOn(Share, "share")
        .mockResolvedValue({ action: "sharedAction" });

      const { findByPlaceholderText, getByText } = render(<HomeScreen />);
      await loginInApp(findByPlaceholderText, getByText);

      await waitFor(() => {
        expect(getByText("GitHub")).toBeTruthy();
      });

      fireEvent.press(getByText("Exportar backup"));

      await waitFor(
        () => {
          expect(shareSpy).toHaveBeenCalledWith(
            expect.objectContaining({
              title: "Backup SecPass",
              message: expect.stringContaining('"type":"encrypted_vault"'),
            }),
          );
        },
        { timeout: REAL_CRYPTO_TIMEOUT },
      );

      shareSpy.mockRestore();
    },
    REAL_CRYPTO_TIMEOUT,
  );

  it(
    "importa um backup valido e substitui o cofre atual",
    async () => {
      loadPasswords.mockResolvedValueOnce([]);
      const alertSpy = jest
        .spyOn(Alert, "alert")
        .mockImplementation((title, message, buttons) => {
          if (Array.isArray(buttons)) {
            const confirmButton = buttons.find(
              (button) => button.text === "Substituir",
            );
            confirmButton?.onPress();
          }
        });

      const { findByPlaceholderText, getByText } = render(<HomeScreen />);
      await loginInApp(findByPlaceholderText, getByText);

      const vaultSecret = createVaultSecret({
        email: "user@email.com",
        password: ACCESS_PASSWORD,
      });
      const backupItems = [
        {
          id: "9",
          title: "Backup Site",
          username: "backup-user",
          password: "B4ckup!99",
        },
      ];
      const envelope = await encryptVaultItems(backupItems, vaultSecret);

      fireEvent.press(getByText("Importar backup"));

      const pasteInput = await findByPlaceholderText("Cole o backup aqui");
      fireEvent.changeText(pasteInput, JSON.stringify(envelope));
      fireEvent.press(getByText("Confirmar importacao"));

      await waitFor(
        () => {
          expect(getByText("Backup Site")).toBeTruthy();
          expect(getByText("backup-user")).toBeTruthy();
        },
        { timeout: REAL_CRYPTO_TIMEOUT },
      );

      alertSpy.mockRestore();
    },
    REAL_CRYPTO_TIMEOUT,
  );

  it(
    "rejeita importar um backup invalido/corrompido",
    async () => {
      loadPasswords.mockResolvedValueOnce([]);
      const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});

      const { findByPlaceholderText, getByText } = render(<HomeScreen />);
      await loginInApp(findByPlaceholderText, getByText);

      fireEvent.press(getByText("Importar backup"));

      const pasteInput = await findByPlaceholderText("Cole o backup aqui");
      fireEvent.changeText(pasteInput, "isso nao e um json valido");
      fireEvent.press(getByText("Confirmar importacao"));

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith(
          "Backup invalido",
          "O conteudo colado nao e um backup valido.",
        );
      });

      alertSpy.mockRestore();
    },
    REAL_CRYPTO_TIMEOUT,
  );

  it("bloqueia e tenta reautenticar ao sair e voltar ao app", async () => {
    loadPasswords.mockResolvedValueOnce([]);
    const getLatestChangeHandler = mockAppStateChange();

    const { findByPlaceholderText, getByText } = render(<HomeScreen />);
    await loginInApp(findByPlaceholderText, getByText);

    await act(async () => {
      getLatestChangeHandler()("background");
    });

    expect(getByText("Cofre bloqueado")).toBeTruthy();
    expect(getByText("Cofre bloqueado ao sair do app.")).toBeTruthy();

    const biometricAuth = require("../src/utils/biometricAuth");
    biometricAuth.authenticateVaultAccess.mockResolvedValueOnce({
      success: false,
      error: "not_available",
    });

    await act(async () => {
      getLatestChangeHandler()("active");
    });

    await waitFor(() => {
      expect(
        getByText("Biometria/senha do aparelho indisponivel."),
      ).toBeTruthy();
    });
  });

  it("mantem cofre bloqueado sem mensagem quando o usuario cancela a biometria", async () => {
    loadPasswords.mockResolvedValueOnce([]);
    const getLatestChangeHandler = mockAppStateChange();

    const { findByPlaceholderText, getByText, queryByText } = render(
      <HomeScreen />,
    );
    await loginInApp(findByPlaceholderText, getByText);

    await act(async () => {
      getLatestChangeHandler()("background");
    });

    const biometricAuth = require("../src/utils/biometricAuth");
    biometricAuth.authenticateVaultAccess.mockResolvedValueOnce({
      success: false,
      error: "user_cancel",
    });

    await act(async () => {
      getLatestChangeHandler()("active");
    });

    await waitFor(() => {
      expect(getByText("Cofre bloqueado")).toBeTruthy();
    });
    expect(
      queryByText("Biometria/senha do aparelho indisponivel."),
    ).toBeNull();
  });

  it("mostra falha quando a autenticacao biometrica lanca excecao", async () => {
    loadPasswords.mockResolvedValueOnce([]);
    const getLatestChangeHandler = mockAppStateChange();

    const { findByPlaceholderText, getByText } = render(<HomeScreen />);
    await loginInApp(findByPlaceholderText, getByText);

    await act(async () => {
      getLatestChangeHandler()("background");
    });

    const biometricAuth = require("../src/utils/biometricAuth");
    biometricAuth.authenticateVaultAccess.mockRejectedValueOnce(
      new Error("hardware-error"),
    );

    await act(async () => {
      getLatestChangeHandler()("active");
    });

    await waitFor(() => {
      expect(getByText("Falha ao iniciar autenticacao.")).toBeTruthy();
    });
  });

  it("limpa token de sessao orfao ao iniciar o app", async () => {
    loadSessionToken.mockResolvedValueOnce("session:orphaned");
    loadPasswords.mockResolvedValueOnce([]);

    render(<HomeScreen />);

    await waitFor(() => {
      expect(clearSessionToken).toHaveBeenCalled();
    });
  });

  it("restaura e decai um bloqueio de login salvo ao iniciar o app", async () => {
    loadLocalAccount.mockResolvedValue({ email: "user@email.com" });
    loadLoginGuard.mockResolvedValueOnce({
      failedAttempts: 3,
      lockLevel: 2,
      lockUntil: Date.now() - 1000,
    });
    loadPasswords.mockResolvedValueOnce([]);

    const { findByPlaceholderText, getByText } = render(<HomeScreen />);

    const loginEmailInput = await findByPlaceholderText("Email");
    const loginAccessPasswordInput =
      await findByPlaceholderText("Senha de acesso");

    fireEvent.changeText(loginEmailInput, "user@email.com");
    fireEvent.changeText(loginAccessPasswordInput, "SenhaErrada!1");
    fireEvent.press(getByText("Entrar"));

    // O lock salvo tinha nivel 2 e ja expirou: decai 1 nivel (vira nivel 1)
    // e reinicia as tentativas. A proxima falha deve contar como a 1a
    // tentativa do ciclo (4 restantes), nao a continuacao do estado antigo.
    await waitFor(() => {
      expect(
        getByText(
          "Email ou senha incorretos. Restam 4 tentativa(s) antes do bloqueio.",
        ),
      ).toBeTruthy();
    });
  });

  it("mostra alerta quando falha ao salvar o cofre localmente", async () => {
    loadPasswords.mockResolvedValueOnce([]);
    savePasswords.mockRejectedValueOnce(new Error("write-failure"));
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});

    const { findByPlaceholderText, getByPlaceholderText, getByText } = render(
      <HomeScreen />,
    );
    await loginInApp(findByPlaceholderText, getByText);

    fireEvent.changeText(getByPlaceholderText("Titulo"), "GitHub");
    fireEvent.changeText(getByPlaceholderText("Usuario"), "clemilton");
    fireEvent.changeText(getByPlaceholderText("Senha"), "Segura!123");
    fireEvent.press(getByText("Salvar"));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        "Falha de seguranca",
        "Nao foi possivel salvar o cofre com seguranca neste dispositivo.",
      );
    });

    alertSpy.mockRestore();
  });

  it("bloqueia tentativa de login imediatamente quando ja esta bloqueado", async () => {
    loadLocalAccount.mockResolvedValueOnce({ email: "user@email.com" });
    loadLoginGuard.mockResolvedValueOnce({
      failedAttempts: 0,
      lockLevel: 1,
      lockUntil: Date.now() + 60000,
    });
    loadPasswords.mockResolvedValueOnce([]);

    const { findByPlaceholderText, getByText } = render(<HomeScreen />);

    const loginEmailInput = await findByPlaceholderText("Email");
    const loginAccessPasswordInput =
      await findByPlaceholderText("Senha de acesso");

    fireEvent.changeText(loginEmailInput, "user@email.com");
    fireEvent.changeText(loginAccessPasswordInput, ACCESS_PASSWORD);
    fireEvent.press(getByText("Entrar"));

    await waitFor(() => {
      expect(getByText(/^Muitas tentativas\. Tente novamente em \d+s\.$/)).toBeTruthy();
    });
    expect(verifyLocalAccount).not.toHaveBeenCalled();
  });
});
