import React, { useEffect, useState } from "react";
import { EyeIcon, EyeOffIcon } from "./icons.jsx";

export default function LockedScreen({ email, canPromptDeviceAuth, onUnlocked, onAccessReset }) {
  // Sem biometria disponivel (Windows/Linux, ou Mac sem Touch ID), ja
  // comeca direto no formulario de senha - nao faz sentido tentar
  // automaticamente nem mostrar um botao/mensagem de "indisponivel" pra
  // algo que nunca vai funcionar nesse aparelho.
  const [needsPassword, setNeedsPassword] = useState(!canPromptDeviceAuth);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  const tryTouchId = async () => {
    setIsBusy(true);
    setMessage("");
    try {
      const result = await window.secpass.unlock();
      if (result.ok) {
        await onUnlocked();
        return;
      }
      if (result.requiresPassword) {
        setNeedsPassword(true);
      }
      if (result.message) {
        setMessage(result.message);
      }
    } finally {
      setIsBusy(false);
    }
  };

  useEffect(() => {
    if (canPromptDeviceAuth) {
      tryTouchId();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePasswordSubmit = async (event) => {
    event.preventDefault();
    setIsBusy(true);
    setMessage("");
    try {
      const result = await window.secpass.unlockWithPassword(email, password);
      if (!result.ok) {
        setMessage(result.message || "Senha incorreta.");
        return;
      }
      await onUnlocked();
    } finally {
      setIsBusy(false);
    }
  };

  const handleForgotPassword = async () => {
    const confirmed = window.confirm(
      "A senha original nao pode ser recuperada. Redefinir apaga o acesso e o cofre em cache neste computador, e desconecta a sincronizacao com o Google Drive neste aparelho, permitindo criar uma senha nova. O cofre sincronizado no Google Drive (se houver) NAO e apagado - continua acessivel normalmente em outro aparelho que ainda saiba a senha antiga (voce pode reconectar o Drive neste computador depois, com a conta nova). So continue se aceitar perder os dados locais deste computador ou tiver um backup. Deseja continuar?",
    );
    if (!confirmed) return;

    setIsBusy(true);
    setMessage("");
    try {
      const result = await window.secpass.resetLocalAccess();
      if (!result.ok) {
        if (!result.cancelled) {
          setMessage("Nao foi possivel confirmar sua identidade no aparelho.");
        }
        return;
      }
      onAccessReset();
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="centered-screen">
      <div className="auth-card" style={{ textAlign: "center" }}>
        <h1 className="auth-title">Cofre bloqueado</h1>
        <p className="auth-subtitle">
          {needsPassword ? "Digite sua senha de acesso pra desbloquear." : "Use o Touch ID pra acessar as credenciais."}
        </p>

        {/* Logo apos o subtitulo, antes de qualquer botao - funciona pros
            dois modos (Touch ID e senha) sem ficar espremido entre botoes. */}
        {!!message && <p className="error-text lock-error">{message}</p>}

        {!needsPassword && (
          <button className="primary-button" onClick={tryTouchId} disabled={isBusy}>
            Desbloquear com Touch ID
          </button>
        )}

        {needsPassword && (
          <form onSubmit={handlePasswordSubmit}>
            <div className="password-field">
              <input
                className="text-input"
                type={showPassword ? "text" : "password"}
                placeholder="Senha de acesso"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoFocus
                required
              />
              <button
                type="button"
                className="reveal-toggle"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
            <button className="primary-button" type="submit" disabled={isBusy}>
              Desbloquear
            </button>
          </form>
        )}

        {!needsPassword && (
          <button type="button" className="link-button" onClick={() => setNeedsPassword(true)}>
            Usar senha de acesso
          </button>
        )}

        {needsPassword && (
          <button type="button" className="link-button" onClick={handleForgotPassword} disabled={isBusy}>
            Esqueci minha senha
          </button>
        )}
      </div>
    </div>
  );
}
