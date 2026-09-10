import React, { useMemo, useState } from "react";
import BrandLogo from "./BrandLogo.jsx";
import CredentialModal from "./CredentialModal.jsx";
import { EyeIcon, EyeOffIcon, RefreshIcon } from "./icons.jsx";

// Mesma janela de auto-limpeza usada no app mobile (PasswordCard.js) -
// deixar uma senha no clipboard indefinidamente e uma fraqueza conhecida
// de password managers (qualquer outro processo na sessao do usuario pode
// ler o clipboard depois). So limpa se o clipboard ainda tiver exatamente
// o valor copiado, pra nao apagar algo que o usuario copiou de outro app
// nesse meio-tempo.
const CLIPBOARD_CLEAR_MS = 30000;
let clipboardClearTimer = null;

const copyToClipboard = async (value) => {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    // Best-effort; sem feedback bloqueante se o clipboard falhar.
    return;
  }

  if (clipboardClearTimer) {
    clearTimeout(clipboardClearTimer);
  }

  clipboardClearTimer = setTimeout(async () => {
    try {
      const current = await navigator.clipboard.readText();
      if (current === value) {
        await navigator.clipboard.writeText("");
      }
    } catch {
      // Nao interrompe o fluxo se a limpeza automatica falhar.
    }
  }, CLIPBOARD_CLEAR_MS);
};

export default function VaultScreen({
  items,
  setItems,
  driveSyncActive,
  onDriveSyncChange,
  syncBackendPreference,
  onSyncBackendChange,
  onLock,
  onLogout,
  onDeleteAccount,
}) {
  const [search, setSearch] = useState("");
  const [modalItem, setModalItem] = useState(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [revealedId, setRevealedId] = useState(null);
  const [isSyncBusy, setIsSyncBusy] = useState(false);
  const [isSyncBackendBusy, setIsSyncBackendBusy] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isDeleteAccountOpen, setIsDeleteAccountOpen] = useState(false);
  const [deleteAccountPassword, setDeleteAccountPassword] = useState("");
  const [showDeleteAccountPassword, setShowDeleteAccountPassword] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState("");
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  const visibleItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return items;
    return items.filter(
      (item) => item.title.toLowerCase().includes(term) || item.username.toLowerCase().includes(term),
    );
  }, [items, search]);

  const handleDelete = async (id) => {
    if (!window.confirm("Excluir esta credencial?")) {
      return;
    }
    const updated = await window.secpass.deleteItem(id);
    setItems(updated);
  };

  const handleEnableSync = async () => {
    const confirmed = window.confirm(
      "O cofre cifrado passa a ser salvo tambem na pasta privada do app na sua conta Google, pra abrir em outro aparelho. O Google nunca ve suas senhas em texto claro, so o cofre ja cifrado - mas isso amplia o que protege seus dados: quem comprometer sua conta Google podera baixar esse cofre cifrado e tentar quebrar a senha offline. Recomendamos ativar a verificacao em duas etapas na conta Google. Deseja continuar?",
    );
    if (!confirmed) return;

    setIsSyncBusy(true);
    try {
      const result = await window.secpass.enableDriveSync();
      if (result.success) {
        onDriveSyncChange(true);
      }
    } finally {
      setIsSyncBusy(false);
    }
  };

  const handleDisableSync = async () => {
    if (!window.confirm("Desativar a sincronizacao com o Google Drive neste computador?")) {
      return;
    }
    await window.secpass.disableDriveSync();
    onDriveSyncChange(false);
  };

  // Troca de backend e uma acao explicita, nunca um fallback automatico
  // (ver core/storage.js): o main process migra o cofre pro novo backend
  // antes de persistir a preferencia. A preferencia e local deste Mac, por
  // isso o aviso explicito de repetir a troca nos outros aparelhos.
  const handleSelectSyncBackend = async (backend) => {
    if (backend === syncBackendPreference || isSyncBackendBusy) {
      return;
    }

    const confirmed = window.confirm(
      "O cofre atual sera copiado para o novo backend antes da troca (o backend antigo nao e apagado). Repita esta mesma troca em todos os outros aparelhos que acessam este cofre, ou eles vao parar de se sincronizar entre si. Deseja continuar?",
    );
    if (!confirmed) return;

    setIsSyncBackendBusy(true);
    try {
      if (backend === "icloud") {
        const signInResult = await window.secpass.enableCloudKitSync();
        if (!signInResult?.success) {
          window.alert("Nao foi possivel entrar com o Apple ID.");
          return;
        }
      }

      const result = await window.secpass.setSyncBackend(backend);
      if (!result.ok) {
        window.alert(result.message || "Falha ao trocar o backend de sincronizacao.");
        return;
      }

      onSyncBackendChange(backend);
      window.alert(
        "Backend alterado. Repita esta mesma troca em todos os outros aparelhos que acessam este cofre.",
      );
    } finally {
      setIsSyncBackendBusy(false);
    }
  };

  // Cobre o caso da janela ficar aberta enquanto outro aparelho grava no
  // Drive: o cofre em memoria so e recarregado sozinho no login/desbloqueio
  // (ver account:unlock em main/index.js), entao sem isso o usuario so veria
  // a mudanca ao bloquear/sair e voltar.
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const result = await window.secpass.refreshVault();
      if (result?.ok) {
        setItems(result.items);
      } else if (result?.message) {
        window.alert(result.message);
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleDeleteAccountClick = () => {
    setDeleteAccountPassword("");
    setDeleteAccountError("");
    setIsDeleteAccountOpen(true);
  };

  // A senha e reverificada no processo principal (ver account:delete em
  // main/index.js) - o pedido aqui nao e so uma confirmacao de UI, e o
  // unico jeito de provar que quem esta chamando isso e o dono do cofre
  // (nao um script injetado por uma dependencia comprometida).
  const handleConfirmDeleteAccount = async (event) => {
    event.preventDefault();
    setIsDeletingAccount(true);
    setDeleteAccountError("");
    try {
      const result = await onDeleteAccount(deleteAccountPassword);
      if (!result?.ok) {
        if (result?.cancelled) {
          setIsDeleteAccountOpen(false);
          return;
        }
        setDeleteAccountError(result?.message || "Nao foi possivel confirmar sua identidade.");
        return;
      }
      setIsDeleteAccountOpen(false);
    } finally {
      setIsDeletingAccount(false);
    }
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="header-brand-group">
          <BrandLogo />

          <div className="actions-group">
            {driveSyncActive && <span className="sync-badge">Drive ativo</span>}
            <button className="secondary-button" onClick={driveSyncActive ? handleDisableSync : handleEnableSync} disabled={isSyncBusy}>
              {driveSyncActive ? "Desativar sync" : "Sincronizar com Drive"}
            </button>
            <div className="segmented-control" role="group" aria-label="Backend de sincronizacao">
              <button
                type="button"
                className={`segmented-option${syncBackendPreference === "drive" ? " active" : ""}`}
                disabled={isSyncBackendBusy || syncBackendPreference === "drive"}
                onClick={() => handleSelectSyncBackend("drive")}
                title="Google Drive - funciona com Android, iPhone e Mac"
              >
                Google Drive
              </button>
              <button
                type="button"
                className={`segmented-option${syncBackendPreference === "icloud" ? " active" : ""}`}
                disabled={isSyncBackendBusy || syncBackendPreference === "icloud"}
                onClick={() => handleSelectSyncBackend("icloud")}
                title="iCloud (CloudKit) - so entre iPhone e Mac"
              >
                iCloud
              </button>
            </div>
          </div>
        </div>

        <div className="actions-group">
          <button className="secondary-button" onClick={onLock}>
            Bloquear
          </button>
          <button className="secondary-button" onClick={onLogout}>
            Sair
          </button>
        </div>
      </header>

      <div className="app-content">
        <div className="content-inner">
          <div className="kpi-row">
            <div className="kpi-card">
              <p className="kpi-label">Total</p>
              <p className="kpi-value">{items.length}</p>
            </div>
            {!!search.trim() && (
              <div className="kpi-card">
                <p className="kpi-label">Filtrados</p>
                <p className="kpi-value">{visibleItems.length}</p>
              </div>
            )}
          </div>

          <div className="toolbar">
            <input
              className="search-input"
              placeholder="Pesquisar por titulo ou usuario"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            {driveSyncActive && (
              <button
                type="button"
                className="secondary-button icon-button"
                onClick={handleRefresh}
                disabled={isRefreshing}
                title="Buscar atualizacoes do Drive"
                aria-label="Atualizar"
              >
                <RefreshIcon className={isRefreshing ? "spin" : undefined} />
              </button>
            )}
            <button className="primary-button" style={{ width: "auto" }} onClick={() => setIsAddingNew(true)}>
              + Nova credencial
            </button>
          </div>

          {items.length > 0 && <p className="list-title">Credenciais salvas</p>}

          {visibleItems.length === 0 ? (
            <div className="empty-state">
              <p className="empty-title">
                {items.length === 0 ? "Nenhuma credencial ainda" : "Nada encontrado pra essa busca"}
              </p>
              {items.length === 0 && (
                <p className="empty-text">Clique no botao + Nova credencial para criar seu primeiro registro.</p>
              )}
            </div>
          ) : (
            <div className="credential-grid">
              {visibleItems.map((item) => (
                <div className="credential-card" key={item.id}>
                  <p className="credential-title">{item.title}</p>
                  <p className="credential-username">{item.username}</p>

                  <div className="credential-row">
                    <code>{revealedId === item.id ? item.password : "••••••••••••"}</code>
                    <button
                      className="small-icon-button"
                      onClick={() => setRevealedId((prev) => (prev === item.id ? null : item.id))}
                    >
                      {revealedId === item.id ? "Ocultar" : "Ver"}
                    </button>
                  </div>

                  <div className="card-actions">
                    <button className="secondary-button" onClick={() => copyToClipboard(item.password)}>
                      Copiar senha
                    </button>
                    <button className="secondary-button" onClick={() => setModalItem(item)}>
                      Editar
                    </button>
                    <button className="secondary-button danger-text" onClick={() => handleDelete(item.id)}>
                      Excluir
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <button type="button" className="link-button" style={{ marginTop: 48 }} onClick={handleDeleteAccountClick}>
            Excluir conta e todos os dados
          </button>
        </div>
      </div>

      {(modalItem || isAddingNew) && (
        <CredentialModal
          initialItem={modalItem}
          onClose={() => {
            setModalItem(null);
            setIsAddingNew(false);
          }}
          onSaved={(updated) => {
            setItems(updated);
            setModalItem(null);
            setIsAddingNew(false);
          }}
        />
      )}

      {isDeleteAccountOpen && (
        <div className="modal-backdrop" onMouseDown={() => !isDeletingAccount && setIsDeleteAccountOpen(false)}>
          <form
            className="modal-card"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={handleConfirmDeleteAccount}
          >
            <h2 className="modal-title">Excluir conta e todos os dados</h2>
            <p className="field-label" style={{ whiteSpace: "normal", fontWeight: 400, marginBottom: 16 }}>
              Isso apaga permanentemente a conta local e todas as credenciais salvas neste computador, alem do
              cofre sincronizado no Drive/iCloud (se houver). Essa acao nao pode ser desfeita. Digite sua senha
              de acesso para confirmar.
            </p>

            <label className="field-label" htmlFor="delete-account-password">
              Senha de acesso
            </label>
            <div className="password-field">
              <input
                id="delete-account-password"
                className="text-input"
                type={showDeleteAccountPassword ? "text" : "password"}
                value={deleteAccountPassword}
                onChange={(event) => setDeleteAccountPassword(event.target.value)}
                autoFocus
                required
              />
              <button
                type="button"
                className="reveal-toggle"
                onClick={() => setShowDeleteAccountPassword((prev) => !prev)}
                aria-label={showDeleteAccountPassword ? "Ocultar senha" : "Mostrar senha"}
              >
                {showDeleteAccountPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>

            {!!deleteAccountError && <p className="error-text">{deleteAccountError}</p>}

            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setIsDeleteAccountOpen(false)}
                disabled={isDeletingAccount}
              >
                Cancelar
              </button>
              <button type="submit" className="primary-button danger-button" disabled={isDeletingAccount}>
                Excluir tudo
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
