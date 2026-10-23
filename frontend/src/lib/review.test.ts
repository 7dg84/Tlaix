import { describe, expect, it } from "vitest";
import type {
  ColumnCellValuesResponse,
  RowCellValuesResponse,
} from "@/api/review";
import {
  buildColumnReviewItems,
  buildRowReviewItems,
  draftToValue,
  filterOptions,
  isSameCellValue,
  isSameValue,
  normalizeText,
  parseOptionNumber,
  valueToDraft,
} from "./review";

const rowResponse: RowCellValuesResponse = {
  axis: "row",
  target: { id: "row-1", name: "Fila 1", order: 1 },
  tab: { id: "tab-1", name: "Hoja 1", label: "Hoja 1" },
  items: [
    {
      column_id: "col-estado",
      column_name: "Estado",
      type: "select",
      options: ["Activo", "Inactivo"],
      order: 1,
      is_required: true,
      value: "Activo",
    },
    {
      column_id: "col-notas",
      column_name: "Notas",
      type: "text",
      options: null,
      order: 2,
      is_required: false,
      value: "Sin observaciones",
    },
    {
      column_id: "col-fecha",
      column_name: "Fecha",
      type: "date",
      // La API podría devolver un valor inesperado; se normaliza a undefined.
      options: "no-es-array" as unknown as string[],
      order: 3,
      is_required: false,
      value: "2026-12-31",
    },
  ],
  total: 3,
};

const columnResponse: ColumnCellValuesResponse = {
  axis: "column",
  target: {
    id: "col-estado",
    name: "Estado",
    order: 1,
    type: "select",
    options: ["Activo", "Inactivo", "En revisión"],
    is_required: true,
    tab_id: "tab-1",
  },
  items: [
    { row_id: "row-1", row_name: "Fila 1", order: 1, value: "Activo" },
    { row_id: "row-2", row_name: "Fila 2", order: 2, value: null },
  ],
  total: 2,
};

describe("normalizeText", () => {
  it("pasa a minúsculas y quita acentos", () => {
    expect(normalizeText("En Revisión")).toBe("en revision");
  });

  it("convierte null y undefined en cadena vacía", () => {
    expect(normalizeText(null)).toBe("");
    expect(normalizeText(undefined)).toBe("");
  });
});

describe("filterOptions", () => {
  const options = ["Activo", "Inactivo", "En revisión"];

  it("filtra por subcadena normalizada", () => {
    expect(filterOptions(options, "revi")).toEqual(["En revisión"]);
  });

  it("encuentra opciones con acento usando una consulta sin acento", () => {
    expect(filterOptions(options, "revision")).toEqual(["En revisión"]);
  });

  it("devuelve una copia con todas las opciones si la consulta está vacía", () => {
    const result = filterOptions(options, "");
    expect(result).toEqual(options);
    expect(result).not.toBe(options);
  });

  it("devuelve una lista vacía si no hay coincidencias", () => {
    expect(filterOptions(options, "inexistente")).toEqual([]);
  });

  it("devuelve una lista vacía si las opciones no son un array", () => {
    expect(filterOptions(null as unknown as string[], "revi")).toEqual([]);
  });
});

describe("buildRowReviewItems", () => {
  it("mapea la respuesta de fila a celdas de revisión", () => {
    const items = buildRowReviewItems(rowResponse);

    expect(items).toHaveLength(3);

    expect(items[0]).toEqual({
      rowId: "row-1",
      rowName: "Fila 1",
      columnId: "col-estado",
      columnName: "Estado",
      type: "select",
      options: ["Activo", "Inactivo"],
      value: "Activo",
    });

    expect(items[1]).toEqual({
      rowId: "row-1",
      rowName: "Fila 1",
      columnId: "col-notas",
      columnName: "Notas",
      type: "text",
      options: undefined,
      value: "Sin observaciones",
    });
  });

  it("normaliza a undefined las options que no son array", () => {
    const items = buildRowReviewItems(rowResponse);

    expect(items[2].options).toBeUndefined();
    expect(items[2].columnId).toBe("col-fecha");
  });
});

describe("buildColumnReviewItems", () => {
  it("mapea la respuesta de columna usando el target como columna", () => {
    const items = buildColumnReviewItems(columnResponse);

    expect(items).toHaveLength(2);

    expect(items[0]).toEqual({
      rowId: "row-1",
      rowName: "Fila 1",
      columnId: "col-estado",
      columnName: "Estado",
      type: "select",
      options: ["Activo", "Inactivo", "En revisión"],
      value: "Activo",
    });

    expect(items[1]).toEqual({
      rowId: "row-2",
      rowName: "Fila 2",
      columnId: "col-estado",
      columnName: "Estado",
      type: "select",
      options: ["Activo", "Inactivo", "En revisión"],
      value: null,
    });
  });
});

describe("isSameValue", () => {
  it("considera equivalentes null y undefined", () => {
    expect(isSameValue(null, undefined)).toBe(true);
  });

  it("considera equivalentes null y false (casilla desmarcada)", () => {
    expect(isSameValue(null, false)).toBe(true);
  });

  it("compara números con cadenas numéricas", () => {
    expect(isSameValue(1, "1")).toBe(true);
  });

  it("distingue números diferentes", () => {
    expect(isSameValue(1, 2)).toBe(false);
  });

  it("usa la comparación por cadena cuando el número no es finito", () => {
    expect(isSameValue(Number.NaN, "NaN")).toBe(true);
  });

  it("distingue cadenas diferentes", () => {
    expect(isSameValue("a", "b")).toBe(false);
  });
});

describe("isSameCellValue", () => {
  it("trata texto vacío y null como equivalentes en columnas de texto", () => {
    expect(isSameCellValue("text", "", null)).toBe(true);
  });

  it("distingue texto con contenido de null", () => {
    expect(isSameCellValue("text", "a", null)).toBe(false);
  });

  it("compara números en columnas enteras", () => {
    expect(isSameCellValue("int", 1, 1)).toBe(true);
  });

  it("trata false y null como equivalentes en casillas", () => {
    expect(isSameCellValue("checkbox", false, null)).toBe(true);
  });
});

describe("parseOptionNumber", () => {
  it("interpreta el buffer como índice 1-based dentro de rango", () => {
    expect(parseOptionNumber("1", 12)).toBe(1);
    expect(parseOptionNumber("12", 12)).toBe(12);
    expect(parseOptionNumber("01", 12)).toBe(1);
  });

  it("devuelve null fuera de rango o con buffers inválidos", () => {
    expect(parseOptionNumber("0", 12)).toBeNull();
    expect(parseOptionNumber("13", 12)).toBeNull();
    expect(parseOptionNumber("", 12)).toBeNull();
    expect(parseOptionNumber("abc", 12)).toBeNull();
  });
});

describe("valueToDraft", () => {
  it("convierte el valor de una casilla a booleano", () => {
    expect(valueToDraft("checkbox", true)).toBe(true);
    expect(valueToDraft("checkbox", null)).toBe(false);
  });

  it("convierte valores vacíos a cadena vacía y números a texto", () => {
    expect(valueToDraft("text", null)).toBe("");
    expect(valueToDraft("int", 5)).toBe("5");
  });
});

describe("draftToValue", () => {
  it("convierte enteros sin truncar decimales", () => {
    expect(draftToValue("int", "3.7")).toBe(3.7);
    expect(draftToValue("int", "")).toBeNull();
    expect(draftToValue("int", "  ")).toBeNull();
  });

  it("convierte decimales", () => {
    expect(draftToValue("float", "2.5")).toBe(2.5);
    expect(draftToValue("float", "")).toBeNull();
  });

  it("mantiene el texto vacío como cadena vacía", () => {
    expect(draftToValue("text", "")).toBe("");
    expect(draftToValue("text", null)).toBe("");
  });

  it("convierte selecciones vacías a null", () => {
    expect(draftToValue("select", "")).toBeNull();
    expect(draftToValue("select", "Activo")).toBe("Activo");
  });

  it("convierte fechas vacías a null", () => {
    expect(draftToValue("date", "")).toBeNull();
    expect(draftToValue("date", "2026-12-31")).toBe("2026-12-31");
  });

  it("convierte casillas a booleano", () => {
    expect(draftToValue("checkbox", false)).toBe(false);
    expect(draftToValue("checkbox", true)).toBe(true);
  });
});
