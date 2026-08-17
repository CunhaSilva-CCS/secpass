import {
  MAX_ACCESS_PASSWORD_LENGTH,
  MIN_ACCESS_PASSWORD_LENGTH,
  validateAccessPasswordPolicy,
} from "../src/utils/securityPolicy";

describe("securityPolicy", () => {
  it("valida senha forte", () => {
    expect(validateAccessPasswordPolicy("Ab1!cd23")).toBeNull();
  });

  it("valida senha longa", () => {
    expect(validateAccessPasswordPolicy("Ab1!cd23ef45gh67ij89")).toBeNull();
  });

  it("reprova senha curta", () => {
    expect(validateAccessPasswordPolicy("Ab1!cd")).toBe(
      `Senha deve ter no minimo ${MIN_ACCESS_PASSWORD_LENGTH} caracteres.`,
    );
  });

  it("reprova senha acima do limite maximo", () => {
    const tooLong = `Ab1!${"a".repeat(MAX_ACCESS_PASSWORD_LENGTH)}`;
    expect(validateAccessPasswordPolicy(tooLong)).toBe(
      `Senha deve ter no maximo ${MAX_ACCESS_PASSWORD_LENGTH} caracteres.`,
    );
  });

  it("reprova sem letra", () => {
    expect(validateAccessPasswordPolicy("12345!@#")).toBe(
      "Senha deve incluir ao menos 1 letra.",
    );
  });

  it("reprova sem especial", () => {
    expect(validateAccessPasswordPolicy("Abcdef12")).toBe(
      "Senha deve incluir ao menos 1 caractere especial.",
    );
  });

  it("reprova sem numero", () => {
    expect(validateAccessPasswordPolicy("Abcdef!@")).toBe(
      "Senha deve incluir ao menos 1 numero.",
    );
  });
});
