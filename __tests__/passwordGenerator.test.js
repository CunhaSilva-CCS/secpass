import { generatePassword } from "../src/utils/passwordGenerator";

describe("generatePassword", () => {
  it("gera uma senha com 16 caracteres", () => {
    const password = generatePassword();

    expect(password).toHaveLength(16);
  });

  it("usa apenas caracteres permitidos", () => {
    const password = generatePassword();

    expect(password).toMatch(/^[A-Za-z0-9!@#$%]{16}$/);
  });

  it("garante a presenca de todas as classes obrigatorias (maiuscula, minuscula, digito, especial)", () => {
    for (let i = 0; i < 50; i += 1) {
      const password = generatePassword();
      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/[0-9]/);
      expect(password).toMatch(/[!@#$%]/);
    }
  });

  it("gera valores diferentes em chamadas consecutivas", () => {
    const first = generatePassword();
    const second = generatePassword();

    expect(first).not.toBe(second);
  });
});
