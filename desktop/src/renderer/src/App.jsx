import React, { useCallback, useEffect, useState } from "react";
import AuthScreen from "./components/AuthScreen.jsx";
import LockedScreen from "./components/LockedScreen.jsx";
import VaultScreen from "./components/VaultScreen.jsx";

export default function App() {
  const [status, setStatus] = useState("loading");
  const [hasLocalAccount, setHasLocalAccount] = useState(false);
  const [hasRemoteVault, setHasRemoteVault] = useState(false);
  const [driveSyncActive, setDriveSyncActive] = useState(false);
  const [syncBackendPreference, setSyncBackendPreference] = useState("drive");
  const [email, setEmail] = useState("");
  const [items, setItems] = useState([]);
  const [canPromptDeviceAuth, setCanPromptDeviceAuth] = useState(false);

  const refreshSession = useCallback(async () => {
    const session = await window.secpass.sessionInit();
    setHasLocalAccount(session.hasLocalAccount);
    setHasRemoteVault(session.hasRemoteVault);
    setDriveSyncActive(session.driveSyncActive);
    setSyncBackendPreference(session.syncBackendPreference || "drive");
    setCanPromptDeviceAuth(Boolean(session.canPromptDeviceAuth));
    // A barra de titulo custom so precisa reservar espaco pros botoes
    // nativos de fechar/minimizar/maximizar no macOS (titleBarStyle
    // "hiddenInset" - ver main/index.js); no Windows/Linux a janela usa o
    // frame padrao do sistema, entao esse espaco extra nao e necessario.
    if (session.platform) {
      document.documentElement.dataset.platform = session.platform;
    }
    if (session.email) {
      setEmail(session.email);
    }
    return session;
  }, []);

  useEffect(() => {
    refreshSession().then((session) => {
      setStatus(session.hasLocalAccount ? "locked" : "auth");
    });
  }, [refreshSession]);

  // O processo principal trava o cofre sozinho por inatividade ou quando o
  // Mac dorme/a tela bloqueia (ver session:autoLocked em desktop/src/main/index.js)
  // - aqui so refletimos isso na UI; o estado ja foi zerado do lado main.
  useEffect(() => {
    const unsubscribe = window.secpass.onAutoLocked(() => {
      setItems([]);
      setStatus((current) => (current === "vault" ? "locked" : current));
    });
    return unsubscribe;
  }, []);

  const enterVault = useCallback(async () => {
    const list = await window.secpass.listItems();
    setItems(list);
    setStatus("vault");
  }, []);

  const handleAuthenticated = useCallback(async () => {
    await enterVault();
    setHasLocalAccount(true);
  }, [enterVault]);

  const handleLock = useCallback(async () => {
    await window.secpass.lock();
    setStatus("locked");
  }, []);

  const handleLogout = useCallback(async () => {
    await window.secpass.logout();
    setItems([]);
    setStatus("locked");
  }, []);

  const handleUnlocked = useCallback(async () => {
    await enterVault();
  }, [enterVault]);

  const handleAccessReset = useCallback(() => {
    // Reseta so a credencial local (ver account:resetLocalAccess no main
    // process) - o cache local do cofre e o cofre remoto no Drive nao sao
    // apagados, so ficam inacessiveis com a senha antiga. O Drive TAMBEM e
    // desconectado deste Mac nesse fluxo (evita o cofre novo tentar
    // reconciliar com o cofre remoto da senha antiga) - reflete isso aqui
    // pra UI nao continuar mostrando "Drive ativo"/cofre remoto encontrado
    // com base num estado que acabou de mudar do lado main.
    setItems([]);
    setHasLocalAccount(false);
    setHasRemoteVault(false);
    setDriveSyncActive(false);
    setStatus("auth");
  }, []);

  // account:delete agora exige a senha de acesso real (e Touch ID quando
  // disponivel) no processo principal (ver main/index.js) - se a senha
  // estiver errada ou o usuario cancelar o Touch ID, nada foi apagado,
  // entao a UI nao pode assumir sucesso e resetar pra tela de "auth"
  // incondicionalmente.
  const handleDeleteAccount = useCallback(async (password) => {
    const result = await window.secpass.deleteAccount(password);
    if (!result?.ok) {
      return result;
    }
    setItems([]);
    setHasLocalAccount(false);
    setHasRemoteVault(false);
    setDriveSyncActive(false);
    setEmail("");
    setStatus("auth");
    return result;
  }, []);

  // Barra de titulo custom, presente em toda tela: a janela usa
  // titleBarStyle "hiddenInset" (ver main/index.js), que deixa os botoes
  // nativos de fechar/minimizar/maximizar flutuando por cima do conteudo,
  // no canto superior esquerdo. Sem reservar esse espaco aqui, a marca e os
  // controles de cada tela ficam por baixo desses botoes (era exatamente o
  // bug de "botoes sobrepondo" em cadastro/bloqueio/cofre) - reservando uma
  // vez, no nivel mais alto, cobre as tres telas de uma vez so.
  const renderScreen = () => {
    if (status === "loading") {
      return <div className="centered-screen" />;
    }

    if (status === "auth") {
      return (
        <AuthScreen
          hasRemoteVault={hasRemoteVault}
          initialEmail={email}
          onAuthenticated={handleAuthenticated}
          onRemoteVaultFound={(foundEmail) => {
            setHasRemoteVault(true);
            setDriveSyncActive(true);
            if (foundEmail) setEmail(foundEmail);
          }}
          onDriveSyncEnabledFromRegister={() => setDriveSyncActive(true)}
        />
      );
    }

    if (status === "locked") {
      return (
        <LockedScreen
          email={email}
          canPromptDeviceAuth={canPromptDeviceAuth}
          onUnlocked={handleUnlocked}
          onAccessReset={handleAccessReset}
        />
      );
    }

    return (
      <VaultScreen
        items={items}
        setItems={setItems}
        driveSyncActive={driveSyncActive}
        onDriveSyncChange={setDriveSyncActive}
        syncBackendPreference={syncBackendPreference}
        onSyncBackendChange={setSyncBackendPreference}
        onLock={handleLock}
        onLogout={handleLogout}
        onDeleteAccount={handleDeleteAccount}
      />
    );
  };

  return (
    <div className="app-frame">
      <div className="title-bar">
        <span className="title-bar-brand">SecPass</span>
      </div>
      <div className="screen-body">{renderScreen()}</div>
    </div>
  );
}
