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

  const refreshSession = useCallback(async () => {
    const session = await window.secpass.sessionInit();
    setHasLocalAccount(session.hasLocalAccount);
    setHasRemoteVault(session.hasRemoteVault);
    setDriveSyncActive(session.driveSyncActive);
    setSyncBackendPreference(session.syncBackendPreference || "drive");
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
    // apagados, so ficam inacessiveis com a senha antiga.
    setItems([]);
    setHasLocalAccount(false);
    setStatus("auth");
  }, []);

  const handleDeleteAccount = useCallback(async () => {
    await window.secpass.deleteAccount();
    setItems([]);
    setHasLocalAccount(false);
    setHasRemoteVault(false);
    setDriveSyncActive(false);
    setEmail("");
    setStatus("auth");
  }, []);

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
    return <LockedScreen email={email} onUnlocked={handleUnlocked} onAccessReset={handleAccessReset} />;
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
}
