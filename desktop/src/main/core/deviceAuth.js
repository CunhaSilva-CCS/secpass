// Abstrai a confirmacao biometrica do sistema operacional por plataforma -
// so existe implementacao real no macOS (Touch ID, via systemPreferences).
// No Windows/Linux nao ha integracao nativa equivalente aqui (Windows Hello
// exigiria um modulo nativo a parte, fora do escopo atual): esses
// aparelhos sempre caem no mesmo fallback ja usado no Mac quando o
// hardware de Touch ID esta ausente - a acao segue sem confirmacao extra
// alem do que a UI (window.confirm) ja pede, mesmo comportamento aceito
// para Mac sem Touch ID, so estendido pra outras plataformas.
import { systemPreferences } from "electron";

export const isMac = process.platform === "darwin";

export const canPromptDeviceAuth = () => isMac && Boolean(systemPreferences.canPromptTouchID?.());

export const promptDeviceAuth = (reason) => systemPreferences.promptTouchID(reason);
