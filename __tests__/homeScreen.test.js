import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { Platform } from "react-native";

import HomeScreen from "../src/screens/HomeScreen";

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

async function loginInApp(findByPlaceholderText, getByText) {
  const accessPassword = "Ab1!cd23";

  const emailInput = await findByPlaceholderText("Email");
  const createAccessPasswordInput = await findByPlaceholderText(
    "Crie sua senha de acesso",
  );
  const confirmAccessPasswordInput =
    await findByPlaceholderText("Confirme sua senha");

  fireEvent.changeText(emailInput, "user@email.com");
  fireEvent.changeText(createAccessPasswordInput, accessPassword);
  fireEvent.changeText(confirmAccessPasswordInput, accessPassword);
  fireEvent.press(getByText("Criar conta"));

  await waitFor(() => {
    expect(getByText("Entrar")).toBeTruthy();
  });

  const loginEmailInput = await findByPlaceholderText("Email");
  const loginAccessPasswordInput =
    await findByPlaceholderText("Senha de acesso");

  fireEvent.changeText(loginEmailInput, "user@email.com");
  fireEvent.changeText(loginAccessPasswordInput, accessPassword);
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
});
