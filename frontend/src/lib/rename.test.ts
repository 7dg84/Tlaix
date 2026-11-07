import { describe, expect, it } from "vitest";
import { normalizeRename, shouldSubmitRename } from "./rename";

describe("normalizeRename", () => {
  it("recorta los espacios al inicio y al final", () => {
    expect(normalizeRename("  Ventas  ")).toBe("Ventas");
    expect(normalizeRename("\tVentas\n")).toBe("Ventas");
    expect(normalizeRename("   ")).toBe("");
  });

  it("conserva los espacios internos", () => {
    expect(normalizeRename("  Ventas  2026  ")).toBe("Ventas  2026");
    expect(normalizeRename("Cliente   Norte")).toBe("Cliente   Norte");
  });

  it("conserva acentos y eñes", () => {
    expect(normalizeRename("  Diseño de año  ")).toBe("Diseño de año");
  });
});

describe("shouldSubmitRename", () => {
  it("devuelve false para una cadena vacía", () => {
    expect(shouldSubmitRename("Ventas", "")).toBe(false);
    expect(shouldSubmitRename("", "")).toBe(false);
  });

  it("devuelve false para una cadena con solo espacios", () => {
    expect(shouldSubmitRename("Ventas", "   ")).toBe(false);
    expect(shouldSubmitRename("Ventas", "\t \n")).toBe(false);
  });

  it("devuelve false cuando el nombre es igual al original", () => {
    expect(shouldSubmitRename("Ventas", "Ventas")).toBe(false);
  });

  it("devuelve false cuando solo cambian los espacios exteriores", () => {
    expect(shouldSubmitRename("Ventas", "  Ventas  ")).toBe(false);
    expect(shouldSubmitRename("  Ventas  ", "Ventas")).toBe(false);
    expect(shouldSubmitRename("  Ventas  ", "   Ventas ")).toBe(false);
  });

  it("devuelve true cuando el nombre cambia", () => {
    expect(shouldSubmitRename("Ventas", "Ventas 2026")).toBe(true);
    expect(shouldSubmitRename("Ventas", "ventas")).toBe(true);
    expect(shouldSubmitRename("Ventas", "  Compras  ")).toBe(true);
  });

  it("detecta cambios que solo afectan a espacios internos", () => {
    expect(shouldSubmitRename("Ventas 2026", "Ventas  2026")).toBe(true);
  });

  it("compara acentos y eñes de forma literal", () => {
    // El helper no normaliza acentos: "Año" y "Ano" son nombres distintos.
    expect(shouldSubmitRename("Año", "Año")).toBe(false);
    expect(shouldSubmitRename("Año", "  Año  ")).toBe(false);
    expect(shouldSubmitRename("Año", "Ano")).toBe(true);
    expect(shouldSubmitRename("Diseño", "Diseno")).toBe(true);
  });
});
