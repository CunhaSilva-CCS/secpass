import { secureGet, secureSet } from "../secureStore.js";

const PREFERENCE_KEY = "secpass_sync_backend_preference";

export const SYNC_BACKEND_DRIVE = "drive";
export const SYNC_BACKEND_ICLOUD = "icloud";
const VALID_BACKENDS = [SYNC_BACKEND_DRIVE, SYNC_BACKEND_ICLOUD];

export const getSyncBackendPreference = () => {
  const value = secureGet(PREFERENCE_KEY);
  return VALID_BACKENDS.includes(value) ? value : SYNC_BACKEND_DRIVE;
};

export const setSyncBackendPreference = (value) => {
  if (!VALID_BACKENDS.includes(value)) {
    throw new Error("Backend de sincronizacao invalido.");
  }

  secureSet(PREFERENCE_KEY, value);
};
