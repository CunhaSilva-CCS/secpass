import React, { act as reactAct } from "react";
if (!React.act) {
  React.act = reactAct;
}
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";
import * as Clipboard from "expo-clipboard";

import PasswordCard from "../src/components/PasswordCard";
import { authenticateVaultAccess } from "../src/utils/biometricAuth";

jest.mock("expo-clipboard", () => ({
  setStringAsync: jest.fn(),
  getStringAsync: jest.fn(),
}));

jest.mock("../src/utils/biometricAuth", () => ({
  authenticateVaultAccess: jest.fn(),
}));

const sampleItem = {
  id: "1",
  title: "GitHub",
  username: "dev-user",
  password: "S3nh@!Forte",
};

describe("PasswordCard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Clipboard.setStringAsync.mockResolvedValue();
    Clipboard.getStringAsync.mockResolvedValue("");
    authenticateVaultAccess.mockResolvedValue({ success: true });
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("mostra a senha mascarada por padrao", () => {
    const { getByText } = render(
      <PasswordCard
        item={sampleItem}
        onDelete={jest.fn()}
        onUpdate={jest.fn()}
      />,
    );

    expect(getByText("••••••••••")).toBeTruthy();
  });

  it("revela a senha apos autenticacao bem-sucedida", async () => {
    const { getByText, getByLabelText, queryByText } = render(
      <PasswordCard
        item={sampleItem}
        onDelete={jest.fn()}
        onUpdate={jest.fn()}
      />,
    );

    fireEvent.press(getByLabelText("Mostrar senha"));

    await waitFor(() => {
      expect(getByText(sampleItem.password)).toBeTruthy();
    });
    expect(queryByText("••••••••••")).toBeNull();
  });

  it("nao revela a senha quando a autenticacao falha", async () => {
    authenticateVaultAccess.mockResolvedValue({
      success: false,
      error: "not_available",
    });

    const { getByText, getByLabelText } = render(
      <PasswordCard
        item={sampleItem}
        onDelete={jest.fn()}
        onUpdate={jest.fn()}
      />,
    );

    fireEvent.press(getByLabelText("Mostrar senha"));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        "Autenticacao indisponivel",
        "Ative Face ID, Touch ID ou uma senha de bloqueio no aparelho para acessar o cofre.",
      );
    });
    expect(getByText("••••••••••")).toBeTruthy();
  });

  it("nao exibe alerta quando o usuario cancela a autenticacao", async () => {
    authenticateVaultAccess.mockResolvedValue({
      success: false,
      error: "user_cancel",
    });

    const { getByText, getByLabelText } = render(
      <PasswordCard
        item={sampleItem}
        onDelete={jest.fn()}
        onUpdate={jest.fn()}
      />,
    );

    fireEvent.press(getByLabelText("Mostrar senha"));

    await waitFor(() => {
      expect(authenticateVaultAccess).toHaveBeenCalled();
    });
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(getByText("••••••••••")).toBeTruthy();
  });

  it("copia a senha apos autenticacao e limpa a area de transferencia apos 30s", async () => {
    jest.useFakeTimers();
    Clipboard.getStringAsync.mockResolvedValue(sampleItem.password);

    const { getByLabelText } = render(
      <PasswordCard
        item={sampleItem}
        onDelete={jest.fn()}
        onUpdate={jest.fn()}
      />,
    );

    await act(async () => {
      fireEvent.press(getByLabelText("Copiar senha"));
    });

    expect(Clipboard.setStringAsync).toHaveBeenCalledWith(sampleItem.password);

    await act(async () => {
      await jest.advanceTimersByTimeAsync(30000);
    });

    expect(Clipboard.setStringAsync).toHaveBeenLastCalledWith("");
  });

  it("nao limpa o clipboard se o conteudo foi alterado por outra copia", async () => {
    jest.useFakeTimers();
    Clipboard.getStringAsync.mockResolvedValue("outro-valor-copiado-depois");

    const { getByLabelText } = render(
      <PasswordCard
        item={sampleItem}
        onDelete={jest.fn()}
        onUpdate={jest.fn()}
      />,
    );

    await act(async () => {
      fireEvent.press(getByLabelText("Copiar senha"));
    });

    await act(async () => {
      await jest.advanceTimersByTimeAsync(30000);
    });

    expect(Clipboard.setStringAsync).toHaveBeenCalledTimes(1);
    expect(Clipboard.setStringAsync).not.toHaveBeenCalledWith("");
  });

  it("nao copia quando a autenticacao falha", async () => {
    authenticateVaultAccess.mockResolvedValue({
      success: false,
      error: "not_available",
    });

    const { getByLabelText } = render(
      <PasswordCard
        item={sampleItem}
        onDelete={jest.fn()}
        onUpdate={jest.fn()}
      />,
    );

    fireEvent.press(getByLabelText("Copiar senha"));

    await waitFor(() => {
      expect(authenticateVaultAccess).toHaveBeenCalled();
    });
    expect(Clipboard.setStringAsync).not.toHaveBeenCalled();
  });

  it("exclui o item ao pressionar Excluir apos autenticacao", async () => {
    const onDelete = jest.fn();
    const { getByLabelText } = render(
      <PasswordCard
        item={sampleItem}
        onDelete={onDelete}
        onUpdate={jest.fn()}
      />,
    );

    fireEvent.press(getByLabelText("Excluir credencial"));

    await waitFor(() => {
      expect(onDelete).toHaveBeenCalledWith(sampleItem.id);
    });
  });

  it("nao exclui o item quando a autenticacao falha", async () => {
    const onDelete = jest.fn();
    authenticateVaultAccess.mockResolvedValue({
      success: false,
      error: "not_available",
    });

    const { getByLabelText } = render(
      <PasswordCard
        item={sampleItem}
        onDelete={onDelete}
        onUpdate={jest.fn()}
      />,
    );

    fireEvent.press(getByLabelText("Excluir credencial"));

    await waitFor(() => {
      expect(authenticateVaultAccess).toHaveBeenCalled();
    });
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("edita e salva um item apos autenticacao", async () => {
    const onUpdate = jest.fn();

    const { getByText, getByLabelText, getByDisplayValue } = render(
      <PasswordCard
        item={sampleItem}
        onDelete={jest.fn()}
        onUpdate={onUpdate}
      />,
    );

    fireEvent.press(getByLabelText("Editar credencial"));

    await waitFor(() => {
      expect(getByDisplayValue(sampleItem.title)).toBeTruthy();
    });

    fireEvent.changeText(getByDisplayValue(sampleItem.title), "GitHub Pessoal");
    fireEvent.press(getByText("Salvar edicao"));

    expect(onUpdate).toHaveBeenCalledWith(sampleItem.id, {
      title: "GitHub Pessoal",
      username: sampleItem.username,
      password: sampleItem.password,
    });
  });

  it("bloqueia salvar edicao com campos vazios", async () => {
    const onUpdate = jest.fn();

    const { getByText, getByLabelText, getByDisplayValue } = render(
      <PasswordCard
        item={sampleItem}
        onDelete={jest.fn()}
        onUpdate={onUpdate}
      />,
    );

    fireEvent.press(getByLabelText("Editar credencial"));

    await waitFor(() => {
      expect(getByDisplayValue(sampleItem.title)).toBeTruthy();
    });

    fireEvent.changeText(getByDisplayValue(sampleItem.title), "   ");
    fireEvent.press(getByText("Salvar edicao"));

    expect(onUpdate).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith(
      "Campos obrigatorios",
      "Preencha titulo, usuario e senha.",
    );
  });

  it("cancela edicao restaurando valores originais", async () => {
    const {
      getByText,
      getByLabelText,
      getByDisplayValue,
      queryByDisplayValue,
    } = render(
      <PasswordCard
        item={sampleItem}
        onDelete={jest.fn()}
        onUpdate={jest.fn()}
      />,
    );

    fireEvent.press(getByLabelText("Editar credencial"));

    await waitFor(() => {
      expect(getByDisplayValue(sampleItem.title)).toBeTruthy();
    });

    fireEvent.changeText(
      getByDisplayValue(sampleItem.title),
      "Titulo temporario",
    );
    fireEvent.press(getByText("Cancelar"));

    expect(queryByDisplayValue("Titulo temporario")).toBeNull();
    expect(getByText(sampleItem.title)).toBeTruthy();
  });
});
