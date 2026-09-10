import { secureDelete, secureGet, secureSet } from "../src/main/secureStore.js";
import { clearLoginGuard, loadLoginGuard, saveLoginGuard } from "../src/main/core/loginGuard.js";

jest.mock("../src/main/secureStore.js", () => ({
  secureDelete: jest.fn(),
  secureGet: jest.fn(),
  secureSet: jest.fn(),
}));

describe("loginGuard (desktop)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("retorna estado zerado quando nada foi gravado", () => {
    secureGet.mockReturnValue(null);

    expect(loadLoginGuard()).toEqual({ failedAttempts: 0, lockLevel: 0, lockUntil: 0 });
  });

  it("retorna estado zerado se o valor gravado estiver corrompido", () => {
    secureGet.mockReturnValue("{invalido");

    expect(loadLoginGuard()).toEqual({ failedAttempts: 0, lockLevel: 0, lockUntil: 0 });
  });

  it("le o estado gravado quando valido", () => {
    secureGet.mockReturnValue(JSON.stringify({ failedAttempts: 2, lockLevel: 1, lockUntil: 12345 }));

    expect(loadLoginGuard()).toEqual({ failedAttempts: 2, lockLevel: 1, lockUntil: 12345 });
  });

  it("grava o estado no secureStore", () => {
    saveLoginGuard({ failedAttempts: 3, lockLevel: 0, lockUntil: 0 });

    expect(secureSet).toHaveBeenCalledWith(
      "secpass_login_guard",
      JSON.stringify({ failedAttempts: 3, lockLevel: 0, lockUntil: 0 }),
    );
  });

  it("apaga o estado gravado", () => {
    clearLoginGuard();

    expect(secureDelete).toHaveBeenCalledWith("secpass_login_guard");
  });
});
