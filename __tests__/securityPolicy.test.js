import { validateAccessPasswordPolicy } from "../src/utils/securityPolicy";

describe("securityPolicy", () => {
  it("valida senha forte", () => {
    expect(validateAccessPasswordPolicy("Abc!123456")).toBeNull();
  });

  it("reprova senha curta", () => {
    expect(validateAccessPasswordPolicy("Ab!123")).toBe(
      "Senha deve ter pelo menos 10 caracteres.",
    );
  });

  it("reprova sem maiuscula", () => {
    expect(validateAccessPasswordPolicy("abc!123456")).toBe(
      "Senha deve incluir ao menos 1 letra maiuscula.",
    );
  });

  it("reprova sem especial", () => {
    expect(validateAccessPasswordPolicy("Abc1234567")).toBe(
      "Senha deve incluir ao menos 1 caractere especial.",
    );
  });
});
