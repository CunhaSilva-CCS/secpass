import React, { useEffect, useState } from "react";

export default function LockedScreen({ email, onUnlocked, onAccessReset }) {
  const [needsPassword, setNeedsPassword] = useState(false);
  const [password, setPassword] = useState("");
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
    tryTouchId();
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
      "A senha original nao pode ser recuperada. Redefinir apaga o acesso e o cofre em cache neste Mac, permitindo criar uma senha nova. O cofre sincronizado no Google Drive (se houver) NAO e apagado - continua acessivel normalmente em outro aparelho que ainda saiba a senha antiga. So continue se aceitar perder os dados locais deste Mac ou tiver um backup. Deseja continuar?",
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

        {!needsPassword && (
          <button className="primary-button" onClick={tryTouchId} disabled={isBusy}>
            Desbloquear com Touch ID
          </button>
        )}

        {needsPassword && (
          <form onSubmit={handlePasswordSubmit}>
            <input
              className="text-input"
              type="password"
              placeholder="Senha de acesso"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoFocus
              required
            />
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

        {!!message && <p className="error-text">{message}</p>}

        {needsPassword && (
          <button type="button" className="link-button" onClick={handleForgotPassword} disabled={isBusy}>
            Esqueci minha senha
          </button>
        )}
      </div>
    </div>
  );
}
