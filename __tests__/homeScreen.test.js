import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { Alert, Platform, Share } from "react-native";

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
}));

jest.mock("../src/services/loginGuard", () => ({
  loadLoginGuard: jest.fn().mockResolvedValue(null),
  saveLoginGuard: jest.fn().mockResolvedValue(),
  clearLoginGuard: jest.fn().mockResolvedValue(),
}));

jest.mock("../src/services/securityAudit", () => ({
  logSecurityEvent: jest.fn().mockResolvedValue(),
}));

const { loadPasswords } = require("../src/services/storage");
const { loadSessionToken } = require("../src/services/session");
const {
  loadLocalAccount,
  saveLocalAccount,
  verifyLocalAccount,
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

      fireEvent.press(getByText("Exportar"));

      await waitFor(() => {
        expect(shareSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Backup SecPass",
            message: expect.stringContaining('"type":"encrypted_vault"'),
          }),
        );
      });

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

      fireEvent.press(getByText("Importar"));

      const pasteInput = await findByPlaceholderText("Cole o backup aqui");
      fireEvent.changeText(pasteInput, JSON.stringify(envelope));
      fireEvent.press(getByText("Confirmar importacao"));

      await waitFor(() => {
        expect(getByText("Backup Site")).toBeTruthy();
        expect(getByText("backup-user")).toBeTruthy();
      });

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

      fireEvent.press(getByText("Importar"));

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
});
