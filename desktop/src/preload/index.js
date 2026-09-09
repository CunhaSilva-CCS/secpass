import { contextBridge, ipcRenderer } from "electron";

// Superficie minima exposta ao renderer - so os canais IPC que o processo
// principal registra em src/main/index.js. Nenhuma logica de cripto,
// storage ou rede acontece aqui nem no renderer.
contextBridge.exposeInMainWorld("secpass", {
  sessionInit: () => ipcRenderer.invoke("session:init"),

  register: (email, password) => ipcRenderer.invoke("account:register", { email, password }),
  login: (email, password) => ipcRenderer.invoke("account:login", { email, password }),
  lock: () => ipcRenderer.invoke("account:lock"),
  unlock: () => ipcRenderer.invoke("account:unlock"),
  unlockWithPassword: (email, password) =>
    ipcRenderer.invoke("account:unlockWithPassword", { email, password }),
  logout: () => ipcRenderer.invoke("account:logout"),
  deleteAccount: () => ipcRenderer.invoke("account:delete"),
  resetLocalAccess: () => ipcRenderer.invoke("account:resetLocalAccess"),

  listItems: () => ipcRenderer.invoke("vault:list"),
  addItem: (title, username, password) => ipcRenderer.invoke("vault:add", { title, username, password }),
  updateItem: (id, title, username, password) =>
    ipcRenderer.invoke("vault:update", { id, title, username, password }),
  deleteItem: (id) => ipcRenderer.invoke("vault:delete", { id }),
  generatePassword: () => ipcRenderer.invoke("vault:generatePassword"),

  enableDriveSync: () => ipcRenderer.invoke("drive:enableSync"),
  disableDriveSync: () => ipcRenderer.invoke("drive:disableSync"),
  useExistingDriveVault: () => ipcRenderer.invoke("drive:useExisting"),

  enableCloudKitSync: () => ipcRenderer.invoke("cloudkit:enableSync"),

  getSyncBackendPreference: () => ipcRenderer.invoke("sync:getPreference"),
  setSyncBackend: (backend) => ipcRenderer.invoke("sync:setBackend", { backend }),
});
