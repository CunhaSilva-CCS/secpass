import React, { useMemo, useState } from "react";
import CredentialModal from "./CredentialModal.jsx";

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
    if (!window.confirm("Desativar a sincronizacao com o Google Drive neste Mac?")) {
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

  const handleDeleteAccountClick = async () => {
    if (
      !window.confirm(
        "Isso apaga permanentemente a conta local e todas as credenciais salvas neste Mac. Essa acao nao pode ser desfeita. Deseja excluir tudo agora?",
      )
    ) {
      return;
    }
    await onDeleteAccount();
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <span className="brand">SecPass</span>
        <div className="actions">
          {driveSyncActive && <span className="sync-badge">Drive ativo</span>}
          <button className="secondary-button" onClick={driveSyncActive ? handleDisableSync : handleEnableSync} disabled={isSyncBusy}>
            {driveSyncActive ? "Desativar sync" : "Sincronizar com Drive"}
          </button>
          <button
            className="secondary-button"
            disabled={isSyncBackendBusy || syncBackendPreference === "drive"}
            onClick={() => handleSelectSyncBackend("drive")}
            title="Google Drive - funciona com Android, iPhone e Mac"
          >
            {syncBackendPreference === "drive" ? "Backend: Google Drive" : "Usar Google Drive"}
          </button>
          <button
            className="secondary-button"
            disabled={isSyncBackendBusy || syncBackendPreference === "icloud"}
            onClick={() => handleSelectSyncBackend("icloud")}
            title="iCloud (CloudKit) - so entre iPhone e Mac"
          >
            {syncBackendPreference === "icloud" ? "Backend: iCloud" : "Usar iCloud"}
          </button>
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
          <div className="toolbar">
            <input
              className="search-input"
              placeholder="Buscar credenciais..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <button className="primary-button" style={{ width: "auto" }} onClick={() => setIsAddingNew(true)}>
              + Nova credencial
            </button>
          </div>

          {visibleItems.length === 0 ? (
            <p className="empty-state">
              {items.length === 0 ? "Nenhuma credencial ainda. Adicione a primeira." : "Nada encontrado pra essa busca."}
            </p>
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
    </div>
  );
}
