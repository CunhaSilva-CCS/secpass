import { constantTimeCompare } from "../src/main/core/constantTimeCompare.js";

describe("constantTimeCompare (desktop)", () => {
  it("retorna true para strings identicas", () => {
    expect(constantTimeCompare("segredo123", "segredo123")).toBe(true);
  });

  it("retorna false para strings diferentes de mesmo tamanho", () => {
    expect(constantTimeCompare("segredo123", "segredo124")).toBe(false);
  });

  it("retorna false para strings de tamanhos diferentes", () => {
    expect(constantTimeCompare("curta", "muito-mais-longa")).toBe(false);
  });

  it("retorna false quando um dos lados nao e string", () => {
    expect(constantTimeCompare(null, "x")).toBe(false);
    expect(constantTimeCompare("x", undefined)).toBe(false);
    expect(constantTimeCompare(123, "123")).toBe(false);
  });

  it("retorna true para duas strings vazias", () => {
    expect(constantTimeCompare("", "")).toBe(true);
  });

  it("sempre itera ate o comprimento maximo (nao sai mais cedo por causa do tamanho)", () => {
    // Nao da pra medir tempo de execucao de forma confiavel num teste
    // unitario, mas confirma pelo menos que o resultado nao depende de
    // qual lado e mais longo.
    expect(constantTimeCompare("ab", "abc")).toBe(false);
    expect(constantTimeCompare("abc", "ab")).toBe(false);
  });
});
