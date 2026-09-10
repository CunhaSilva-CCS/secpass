// Porta simplificada de src/services/loginGuard.js (app mobile): mesmo
// formato de estado (failedAttempts/lockLevel/lockUntil) persistido via
// secureStore.js (Keychain via safeStorage) em vez de SecureStore/
// AsyncStorage. Sem o fallback de migracao legado do mobile - este app
// desktop e novo, nunca teve um formato antigo de guard pra migrar.
import { secureDelete, secureGet, secureSet } from "../secureStore.js";

const LOGIN_GUARD_KEY = "secpass_login_guard";

const EMPTY_GUARD = { failedAttempts: 0, lockLevel: 0, lockUntil: 0 };

const parseGuard = (raw) => {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    return {
      failedAttempts: Number(parsed?.failedAttempts) || 0,
      lockLevel: Number(parsed?.lockLevel) || 0,
      lockUntil: Number(parsed?.lockUntil) || 0,
    };
  } catch {
    return null;
  }
};

export const loadLoginGuard = () => parseGuard(secureGet(LOGIN_GUARD_KEY)) || EMPTY_GUARD;

export const saveLoginGuard = ({ failedAttempts, lockLevel, lockUntil }) => {
  secureSet(LOGIN_GUARD_KEY, JSON.stringify({ failedAttempts, lockLevel, lockUntil }));
};

export const clearLoginGuard = () => {
  secureDelete(LOGIN_GUARD_KEY);
};
