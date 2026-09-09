import React, { useState } from "react";

export default function AuthScreen({
  hasRemoteVault,
  initialEmail,
  onAuthenticated,
  onRemoteVaultFound,
  onDriveSyncEnabledFromRegister,
}) {
  const [isRegisterMode, setIsRegisterMode] = useState(!hasRemoteVault);
  const [email, setEmail] = useState(initialEmail || "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage("");

    if (isRegisterMode && password !== confirmPassword) {
      setMessage("As senhas nao coincidem.");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = isRegisterMode
        ? await window.secpass.register(email, password)
        : await window.secpass.login(email, password);

      if (!result.ok) {
        setMessage(result.message || "Nao foi possivel continuar.");
        return;
      }

      await onAuthenticated();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUseExistingDrive = async () => {
    setIsSubmitting(true);
    setMessage("");
    try {
      const result = await window.secpass.useExistingDriveVault();
      if (!result.ok) {
        if (!result.cancelled) {
          setMessage("Falha ao conectar com o Google Drive.");
        }
        return;
      }

      if (result.hasRemoteVault) {
        setIsRegisterMode(false);
        onRemoteVaultFound(result.email);
        setMessage("Cofre encontrado no Google Drive. Entre com o mesmo email e senha usados no outro aparelho.");
      } else {
        onDriveSyncEnabledFromRegister();
        setMessage("Nenhum cofre encontrado nessa conta ainda. Crie a conta - a sincronizacao ja fica ativa.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="centered-screen">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1 className="auth-title">{isRegisterMode ? "Criar conta no SecPass" : "Entrar no SecPass"}</h1>
        <p className="auth-subtitle">
          {isRegisterMode
            ? "Crie sua conta local para acessar o cofre neste Mac."
            : "Acesse sua conta para abrir o cofre."}
        </p>

        <label className="field-label" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          className="text-input"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />

        <label className="field-label" htmlFor="password">
          {isRegisterMode ? "Crie sua senha de acesso" : "Senha de acesso"}
        </label>
        <input
          id="password"
          className="text-input"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />

        {isRegisterMode && (
          <>
            <label className="field-label" htmlFor="confirmPassword">
              Confirme sua senha
            </label>
            <input
              id="confirmPassword"
              className="text-input"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
            />
            <p className="info-text">
              Minimo 8 caracteres, com letra, numero e caractere especial. Nao ha recuperacao de senha.
            </p>
          </>
        )}

        {!!message && <p className="error-text">{message}</p>}

        <button className="primary-button" type="submit" disabled={isSubmitting}>
          {isRegisterMode ? "Criar conta" : "Entrar"}
        </button>

        <button
          type="button"
          className="link-button"
          onClick={() => {
            setIsRegisterMode((prev) => !prev);
            setMessage("");
          }}
        >
          {isRegisterMode ? "Ja tenho conta" : "Criar conta local"}
        </button>

        {isRegisterMode && (
          <button type="button" className="link-button" disabled={isSubmitting} onClick={handleUseExistingDrive}>
            Ja uso o SecPass em outro aparelho (Google Drive)
          </button>
        )}
      </form>
    </div>
  );
}
