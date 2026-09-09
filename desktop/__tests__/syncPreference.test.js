import { secureGet, secureSet } from "../src/main/secureStore.js";
import {
  getSyncBackendPreference,
  setSyncBackendPreference,
  SYNC_BACKEND_DRIVE,
  SYNC_BACKEND_ICLOUD,
} from "../src/main/core/syncPreference.js";

jest.mock("../src/main/secureStore.js", () => ({
  secureGet: jest.fn(),
  secureSet: jest.fn(),
}));

describe("syncPreference (desktop)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("retorna drive como padrao quando nada foi gravado", () => {
    secureGet.mockReturnValue(null);

    expect(getSyncBackendPreference()).toBe(SYNC_BACKEND_DRIVE);
  });

  it("retorna drive como padrao se o valor gravado for invalido", () => {
    secureGet.mockReturnValue("dropbox");

    expect(getSyncBackendPreference()).toBe(SYNC_BACKEND_DRIVE);
  });

  it("le a preferencia gravada quando ela e valida", () => {
    secureGet.mockReturnValue(SYNC_BACKEND_ICLOUD);

    expect(getSyncBackendPreference()).toBe(SYNC_BACKEND_ICLOUD);
  });

  it("grava a preferencia no secureStore", () => {
    setSyncBackendPreference(SYNC_BACKEND_ICLOUD);

    expect(secureSet).toHaveBeenCalledWith(
      "secpass_sync_backend_preference",
      SYNC_BACKEND_ICLOUD,
    );
  });

  it("rejeita um valor de backend invalido sem gravar nada", () => {
    expect(() => setSyncBackendPreference("dropbox")).toThrow(
      "Backend de sincronizacao invalido.",
    );
    expect(secureSet).not.toHaveBeenCalled();
  });
});
