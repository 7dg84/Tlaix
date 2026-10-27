import { describe, expect, it } from "vitest";
import type { DateNameMode } from "./date-name";
import {
  DATE_NAME_SEQUENCE,
  describeDateNameMode,
  formatDateName,
  nextDateNameMode,
} from "./date-name";

// Fechas construidas con componentes numéricos (hora local).
// `new Date("2026-10-26")` se interpretaría como UTC y el día podría cambiar
// según la zona horaria de quien ejecuta los tests.
const october26 = new Date(2026, 9, 26, 12, 0, 0);
const january5 = new Date(2026, 0, 5);
const december31 = new Date(2026, 11, 31);

describe("DATE_NAME_SEQUENCE", () => {
  it("define el ciclo completa → día → mes → mes en nombre → año", () => {
    expect(DATE_NAME_SEQUENCE).toEqual([
      "full",
      "day",
      "month",
      "monthName",
      "year",
    ]);
  });
});

describe("nextDateNameMode", () => {
  it("avanza full → day → month → monthName → year → full", () => {
    expect(nextDateNameMode("full")).toBe("day");
    expect(nextDateNameMode("day")).toBe("month");
    expect(nextDateNameMode("month")).toBe("monthName");
    expect(nextDateNameMode("monthName")).toBe("year");
    expect(nextDateNameMode("year")).toBe("full");
  });

  it("recorre los cinco modos y vuelve al punto de partida sin saltos", () => {
    const visited: DateNameMode[] = [];
    let mode: DateNameMode = "full";

    for (let step = 0; step <= DATE_NAME_SEQUENCE.length; step += 1) {
      visited.push(mode);
      mode = nextDateNameMode(mode);
    }

    expect(visited).toEqual([...DATE_NAME_SEQUENCE, "full"]);
  });

  it("reinicia el ciclo en full si el modo no existe", () => {
    expect(nextDateNameMode("desconocido" as DateNameMode)).toBe("full");
  });
});

describe("formatDateName con el 26 de octubre de 2026", () => {
  it("genera la fecha completa en formato ISO", () => {
    expect(formatDateName("full", october26)).toBe("2026-10-26");
  });

  it("genera el día con dos dígitos", () => {
    expect(formatDateName("day", october26)).toBe("26");
  });

  it("genera el mes como número de dos dígitos", () => {
    expect(formatDateName("month", october26)).toBe("10");
  });

  it("genera el mes en nombre, en español y en minúscula", () => {
    expect(formatDateName("monthName", october26)).toBe("octubre");
  });

  it("genera el año con cuatro dígitos", () => {
    expect(formatDateName("year", october26)).toBe("2026");
  });
});

describe("formatDateName con el 5 de enero de 2026", () => {
  it("rellena con ceros a la izquierda el día y el mes", () => {
    expect(formatDateName("day", january5)).toBe("05");
    expect(formatDateName("month", january5)).toBe("01");
  });

  it("genera el mes en nombre", () => {
    expect(formatDateName("monthName", january5)).toBe("enero");
  });
});

describe("formatDateName con el 31 de diciembre de 2026", () => {
  it("genera la fecha completa en formato ISO", () => {
    expect(formatDateName("full", december31)).toBe("2026-12-31");
  });

  it("genera el día y el mes del último día del año", () => {
    expect(formatDateName("day", december31)).toBe("31");
    expect(formatDateName("month", december31)).toBe("12");
  });

  it("genera el mes en nombre", () => {
    expect(formatDateName("monthName", december31)).toBe("diciembre");
  });
});

describe("formatDateName y la zona horaria", () => {
  it("no adelanta el día cuando la hora local es casi medianoche", () => {
    expect(formatDateName("full", new Date(2026, 9, 26, 23, 59, 59))).toBe(
      "2026-10-26"
    );
  });

  it("no atrasa el día cuando la hora local es casi medianoche", () => {
    expect(formatDateName("full", new Date(2026, 9, 26, 0, 0, 1))).toBe(
      "2026-10-26"
    );
  });
});

describe("describeDateNameMode", () => {
  const cases: Array<[DateNameMode, string]> = [
    ["full", "Rellenar fecha completa (2026-10-26)"],
    ["day", "Rellenar día (26)"],
    ["month", "Rellenar mes en número (10)"],
    ["monthName", "Rellenar mes en nombre (octubre)"],
    ["year", "Rellenar año (2026)"],
  ];

  it.each(cases)("describe el modo %s como «%s»", (mode, expected) => {
    expect(describeDateNameMode(mode, october26)).toBe(expected);
  });
});
