import { describe, expect, it } from "vitest";
import type {
  ColumnCellValuesResponse,
  RowCellValuesResponse,
} from "@/api/review";
import type { ReviewColumn, ReviewItem } from "./review";
import {
  buildColumnReviewItems,
  buildRowReviewItems,
  compareReviewValues,
  draftToValue,
  filterOptions,
  formatReviewValue,
  isEmptyReviewValue,
  isSameCellValue,
  isSameValue,
  normalizeText,
  parseOptionNumber,
  resolveReviewSortDisplay,
  searchReviewItems,
  sortReviewItems,
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

// --- Modo revisión de columnas: orden configurable y búsqueda ---

/** Columnas de la pestaña que se usan como criterio de orden. */
const sortColumns: ReviewColumn[] = [
  { id: "col-estado", name: "Estado", type: "select" },
  { id: "col-notas", name: "Notas", type: "text" },
  { id: "col-importe", name: "Importe", type: "float" },
  { id: "col-unidades", name: "Unidades", type: "int" },
  { id: "col-fecha", name: "Fecha", type: "date" },
  { id: "col-activo", name: "Activo", type: "checkbox" },
];

/** Construye un ítem de revisión con valores por defecto de la columna "Estado". */
function makeItem(
  rowId: string,
  rowName: string,
  overrides: Partial<ReviewItem> = {}
): ReviewItem {
  return {
    rowId,
    rowName,
    columnId: "col-estado",
    columnName: "Estado",
    type: "select",
    value: null,
    ...overrides,
  };
}

describe("isEmptyReviewValue", () => {
  it("trata null, undefined y cadena vacía como vacíos", () => {
    expect(isEmptyReviewValue(null)).toBe(true);
    expect(isEmptyReviewValue(undefined)).toBe(true);
    expect(isEmptyReviewValue("")).toBe(true);
  });

  it("no considera vacíos el cero, false ni la cadena '0'", () => {
    expect(isEmptyReviewValue(0)).toBe(false);
    expect(isEmptyReviewValue(false)).toBe(false);
    expect(isEmptyReviewValue("0")).toBe(false);
  });
});

describe("compareReviewValues", () => {
  it("ordena texto con mayúsculas y acentos según el collator español", () => {
    expect(compareReviewValues("text", "ágil", "Barcelona")).toBeLessThan(0);
    expect(compareReviewValues("text", "Zeta", "árbol")).toBeGreaterThan(0);
    expect(compareReviewValues("text", "ACTIVO", "activo")).toBe(0);
  });

  it("coloca la eñe entre la ene y la o", () => {
    expect(compareReviewValues("text", "Ñandú", "Nube")).toBeGreaterThan(0);
    expect(compareReviewValues("text", "Ñandú", "Oso")).toBeLessThan(0);
  });

  it("compara los números de un texto de forma natural", () => {
    expect(compareReviewValues("text", "Cliente 2", "Cliente 10")).toBeLessThan(0);
  });

  it("deja los valores vacíos al final en cualquier tipo", () => {
    expect(compareReviewValues("text", "", "a")).toBeGreaterThan(0);
    expect(compareReviewValues("int", null, 3)).toBeGreaterThan(0);
    expect(compareReviewValues("date", undefined, "2026-01-01")).toBeGreaterThan(0);
    expect(compareReviewValues("checkbox", "", false)).toBeGreaterThan(0);
  });

  it("considera equivalentes dos valores vacíos", () => {
    expect(compareReviewValues("text", null, "")).toBe(0);
  });

  it("ordena enteros, decimales y negativos de forma numérica", () => {
    expect(compareReviewValues("int", 2, 10)).toBeLessThan(0);
    expect(compareReviewValues("int", -5, -1)).toBeLessThan(0);
    expect(compareReviewValues("float", 1.25, 1.5)).toBeLessThan(0);
    expect(compareReviewValues("int", 5, 5)).toBe(0);
  });

  it("compara cadenas numéricas como números", () => {
    expect(compareReviewValues("int", "2", "10")).toBeLessThan(0);
    expect(compareReviewValues("float", "1.5", 1.25)).toBeGreaterThan(0);
  });

  it("deja un valor no numérico después de uno válido", () => {
    expect(compareReviewValues("int", "abc", 5)).toBeGreaterThan(0);
    expect(compareReviewValues("int", 5, "abc")).toBeLessThan(0);
  });

  it("compara como texto dos valores no numéricos", () => {
    expect(compareReviewValues("float", "abc", "abd")).toBeLessThan(0);
    expect(compareReviewValues("int", "b", "a")).toBeGreaterThan(0);
  });

  it("ordena fechas válidas de forma cronológica", () => {
    expect(compareReviewValues("date", "2026-01-02", "2026-01-10")).toBeLessThan(0);
    expect(compareReviewValues("date", "2026-12-31", "2026-01-01")).toBeGreaterThan(0);
  });

  it("deja una fecha inválida después de una válida", () => {
    expect(compareReviewValues("date", "no-es-fecha", "2026-01-01")).toBeGreaterThan(0);
    expect(compareReviewValues("date", "2026-01-01", "no-es-fecha")).toBeLessThan(0);
  });

  it("compara como texto dos fechas inválidas", () => {
    expect(compareReviewValues("date", "aaa", "bbb")).toBeLessThan(0);
    expect(compareReviewValues("date", "bbb", "aaa")).toBeGreaterThan(0);
  });

  it("ordena checkbox con false antes que true", () => {
    expect(compareReviewValues("checkbox", false, true)).toBeLessThan(0);
    expect(compareReviewValues("checkbox", true, false)).toBeGreaterThan(0);
    expect(compareReviewValues("checkbox", true, true)).toBe(0);
  });

  it("compara select y text como texto", () => {
    expect(compareReviewValues("select", "Activo", "Inactivo")).toBeLessThan(0);
    expect(compareReviewValues("select", "activo", "Activo")).toBe(0);
  });

  it("acepta un collator externo", () => {
    const collator = new Intl.Collator("es", {
      sensitivity: "base",
      numeric: false,
    });
    expect(
      compareReviewValues("text", "Cliente 2", "Cliente 10", collator)
    ).toBeGreaterThan(0);
  });
});

describe("sortReviewItems", () => {
  const items = [
    makeItem("row-1", "Cliente 10"),
    makeItem("row-2", "Ávila"),
    makeItem("row-3", "Cliente 2"),
    makeItem("row-4", "Zeta"),
  ];

  it("ordena por nombre de fila ascendente con el collator español", () => {
    const result = sortReviewItems(items, {
      sortKey: "row-name",
      direction: "asc",
      columns: sortColumns,
    });

    expect(result.map((item) => item.rowName)).toEqual([
      "Ávila",
      "Cliente 2",
      "Cliente 10",
      "Zeta",
    ]);
  });

  it("ordena por nombre de fila descendente", () => {
    const result = sortReviewItems(items, {
      sortKey: "row-name",
      direction: "desc",
      columns: sortColumns,
    });

    expect(result.map((item) => item.rowName)).toEqual([
      "Zeta",
      "Cliente 10",
      "Cliente 2",
      "Ávila",
    ]);
  });

  it("devuelve una copia en el mismo orden con sortKey original", () => {
    const snapshot = items.map((item) => item.rowId);
    const result = sortReviewItems(items, {
      sortKey: "original",
      direction: "desc",
      columns: sortColumns,
    });

    expect(result.map((item) => item.rowId)).toEqual(snapshot);
    expect(result).not.toBe(items);
    // No muta el array recibido
    expect(items.map((item) => item.rowId)).toEqual(snapshot);
  });

  const importes = [
    makeItem("p-1", "Fila 1", {
      columnId: "col-importe",
      columnName: "Importe",
      type: "float",
      value: 10.5,
    }),
    makeItem("p-2", "Fila 2", {
      columnId: "col-importe",
      columnName: "Importe",
      type: "float",
      value: -3,
    }),
    makeItem("p-3", "Fila 3", {
      columnId: "col-importe",
      columnName: "Importe",
      type: "float",
      value: null,
    }),
    makeItem("p-4", "Fila 4", {
      columnId: "col-importe",
      columnName: "Importe",
      type: "float",
      value: 2.25,
    }),
  ];

  it("ordena por la columna revisada usando el valor del propio ítem", () => {
    // Sin `valuesByRow`: la columna revisada ya trae su valor en `item.value`
    const result = sortReviewItems(importes, {
      sortKey: "col-importe",
      direction: "asc",
      columns: sortColumns,
    });

    expect(result.map((item) => item.rowId)).toEqual(["p-2", "p-4", "p-1", "p-3"]);
  });

  it("invierte el orden de la columna revisada en descendente", () => {
    const result = sortReviewItems(importes, {
      sortKey: "col-importe",
      direction: "desc",
      columns: sortColumns,
    });

    expect(result.map((item) => item.rowId)).toEqual(["p-1", "p-4", "p-2", "p-3"]);
  });

  it("ordena por otra columna usando valuesByRow", () => {
    const valuesByRow = new Map<string, unknown>([
      ["row-1", "beta"],
      ["row-2", "Alfa"],
      ["row-3", "Gamma"],
      ["row-4", "alfa"],
    ]);

    const result = sortReviewItems(items, {
      sortKey: "col-notas",
      direction: "asc",
      columns: sortColumns,
      valuesByRow,
    });

    // "Alfa" y "alfa" empatan; el desempate es por nombre de fila
    expect(result.map((item) => item.rowId)).toEqual([
      "row-2",
      "row-4",
      "row-1",
      "row-3",
    ]);
  });

  it("trata como vacíos los valores ausentes en valuesByRow", () => {
    const asc = sortReviewItems(items, {
      sortKey: "col-notas",
      direction: "asc",
      columns: sortColumns,
    });
    const desc = sortReviewItems(items, {
      sortKey: "col-notas",
      direction: "desc",
      columns: sortColumns,
    });

    // Todos vacíos: el desempate por nombre de fila no se invierte
    expect(asc.map((item) => item.rowName)).toEqual([
      "Ávila",
      "Cliente 2",
      "Cliente 10",
      "Zeta",
    ]);
    expect(desc.map((item) => item.rowName)).toEqual([
      "Ávila",
      "Cliente 2",
      "Cliente 10",
      "Zeta",
    ]);
  });

  const unidades = [
    makeItem("n-1", "Fila 1", {
      columnId: "col-unidades",
      columnName: "Unidades",
      type: "int",
      value: 3,
    }),
    makeItem("n-2", "Fila 2", {
      columnId: "col-unidades",
      columnName: "Unidades",
      type: "int",
      value: null,
    }),
    makeItem("n-3", "Fila 3", {
      columnId: "col-unidades",
      columnName: "Unidades",
      type: "int",
      value: 1,
    }),
    makeItem("n-4", "Fila 4", {
      columnId: "col-unidades",
      columnName: "Unidades",
      type: "int",
      value: "",
    }),
  ];

  it("deja los vacíos al final en ascendente", () => {
    const result = sortReviewItems(unidades, {
      sortKey: "col-unidades",
      direction: "asc",
      columns: sortColumns,
    });

    expect(result.map((item) => item.rowId)).toEqual(["n-3", "n-1", "n-2", "n-4"]);
  });

  it("deja los vacíos al final en descendente", () => {
    const result = sortReviewItems(unidades, {
      sortKey: "col-unidades",
      direction: "desc",
      columns: sortColumns,
    });

    expect(result.map((item) => item.rowId)).toEqual(["n-1", "n-3", "n-2", "n-4"]);
  });

  it("desempata por nombre de fila cuando los valores coinciden", () => {
    const empatados = [
      makeItem("e-1", "Beta", {
        columnId: "col-unidades",
        columnName: "Unidades",
        type: "int",
        value: 5,
      }),
      makeItem("e-2", "Alfa", {
        columnId: "col-unidades",
        columnName: "Unidades",
        type: "int",
        value: 5,
      }),
    ];

    const asc = sortReviewItems(empatados, {
      sortKey: "col-unidades",
      direction: "asc",
      columns: sortColumns,
    });
    const desc = sortReviewItems(empatados, {
      sortKey: "col-unidades",
      direction: "desc",
      columns: sortColumns,
    });

    // El desempate por nombre no se invierte con la dirección
    expect(asc.map((item) => item.rowId)).toEqual(["e-2", "e-1"]);
    expect(desc.map((item) => item.rowId)).toEqual(["e-2", "e-1"]);
  });

  it("mantiene estable el orden original con nombres y valores duplicados", () => {
    const duplicados = [
      makeItem("d-1", "Repetida", {
        columnId: "col-unidades",
        columnName: "Unidades",
        type: "int",
        value: 7,
      }),
      makeItem("d-2", "Repetida", {
        columnId: "col-unidades",
        columnName: "Unidades",
        type: "int",
        value: 7,
      }),
      makeItem("d-3", "Repetida", {
        columnId: "col-unidades",
        columnName: "Unidades",
        type: "int",
        value: 7,
      }),
    ];

    const result = sortReviewItems(duplicados, {
      sortKey: "col-unidades",
      direction: "desc",
      columns: sortColumns,
    });

    expect(result.map((item) => item.rowId)).toEqual(["d-1", "d-2", "d-3"]);
  });

  it("ordena columnas de fecha y deja las inválidas al final", () => {
    const fechas = [
      makeItem("f-1", "Fila 1", {
        columnId: "col-fecha",
        columnName: "Fecha",
        type: "date",
        value: "2026-03-01",
      }),
      makeItem("f-2", "Fila 2", {
        columnId: "col-fecha",
        columnName: "Fecha",
        type: "date",
        value: "sin fecha",
      }),
      makeItem("f-3", "Fila 3", {
        columnId: "col-fecha",
        columnName: "Fecha",
        type: "date",
        value: "2026-01-15",
      }),
      makeItem("f-4", "Fila 4", {
        columnId: "col-fecha",
        columnName: "Fecha",
        type: "date",
        value: null,
      }),
    ];

    const result = sortReviewItems(fechas, {
      sortKey: "col-fecha",
      direction: "asc",
      columns: sortColumns,
    });

    expect(result.map((item) => item.rowId)).toEqual(["f-3", "f-1", "f-2", "f-4"]);
  });

  it("ordena columnas checkbox con false antes que true", () => {
    const casillas = [
      makeItem("c-1", "Fila 1", {
        columnId: "col-activo",
        columnName: "Activo",
        type: "checkbox",
        value: true,
      }),
      makeItem("c-2", "Fila 2", {
        columnId: "col-activo",
        columnName: "Activo",
        type: "checkbox",
        value: null,
      }),
      makeItem("c-3", "Fila 3", {
        columnId: "col-activo",
        columnName: "Activo",
        type: "checkbox",
        value: false,
      }),
    ];

    const asc = sortReviewItems(casillas, {
      sortKey: "col-activo",
      direction: "asc",
      columns: sortColumns,
    });
    const desc = sortReviewItems(casillas, {
      sortKey: "col-activo",
      direction: "desc",
      columns: sortColumns,
    });

    expect(asc.map((item) => item.rowId)).toEqual(["c-3", "c-1", "c-2"]);
    expect(desc.map((item) => item.rowId)).toEqual(["c-1", "c-3", "c-2"]);
  });

  it("ordena columnas de lista como texto", () => {
    const listas = [
      makeItem("s-1", "Fila 1", { value: "Inactivo" }),
      makeItem("s-2", "Fila 2", { value: "activo" }),
      makeItem("s-3", "Fila 3", { value: "En revisión" }),
    ];

    const result = sortReviewItems(listas, {
      sortKey: "col-estado",
      direction: "asc",
      columns: sortColumns,
    });

    expect(result.map((item) => item.rowId)).toEqual(["s-2", "s-3", "s-1"]);
  });
});

describe("formatReviewValue", () => {
  it("formatea checkbox como Sí/No", () => {
    expect(formatReviewValue("checkbox", true)).toBe("Sí");
    expect(formatReviewValue("checkbox", false)).toBe("No");
  });

  it("muestra una raya para los valores vacíos", () => {
    expect(formatReviewValue("text", null)).toBe("—");
    expect(formatReviewValue("int", undefined)).toBe("—");
    expect(formatReviewValue("date", "")).toBe("—");
    expect(formatReviewValue("checkbox", null)).toBe("—");
  });

  it("convierte texto, números y fechas a cadena", () => {
    expect(formatReviewValue("text", "Hola")).toBe("Hola");
    expect(formatReviewValue("int", 42)).toBe("42");
    expect(formatReviewValue("float", 1.5)).toBe("1.5");
    expect(formatReviewValue("date", "2026-12-31")).toBe("2026-12-31");
  });
});

describe("resolveReviewSortDisplay", () => {
  /** Columna revisada por defecto: "Estado" de la fila actual. */
  const estadoTarget = {
    id: "col-estado",
    name: "Estado",
    type: "select" as const,
    value: "Activo",
  };

  /** Columna revisada de tipo casilla, para comprobar el formato Sí/No. */
  const activoTarget = {
    id: "col-activo",
    name: "Activo",
    type: "checkbox" as const,
    value: false,
  };

  it("devuelve null con el criterio Orden original", () => {
    expect(
      resolveReviewSortDisplay({
        sortKey: "original",
        rowId: "row-1",
        columns: sortColumns,
        valuesByRow: new Map([["row-1", "Activo"]]),
        target: estadoTarget,
      })
    ).toBeNull();
  });

  it("devuelve null con el criterio Nombre de fila", () => {
    expect(
      resolveReviewSortDisplay({
        sortKey: "row-name",
        rowId: "row-1",
        columns: sortColumns,
        valuesByRow: new Map([["row-1", "Activo"]]),
        target: estadoTarget,
      })
    ).toBeNull();
  });

  it("muestra la columna revisada con el valor congelado de valuesByRow", () => {
    // El mapa manda sobre `target.value`: tras editar la celda, la línea sigue
    // mostrando el valor usado para congelar el orden hasta pulsar Reordenar.
    const result = resolveReviewSortDisplay({
      sortKey: "col-estado",
      rowId: "row-1",
      columns: sortColumns,
      valuesByRow: new Map([["row-1", "En revisión"]]),
      target: estadoTarget,
    });

    expect(result).toEqual({ columnName: "Estado", value: "En revisión" });
  });

  it("usa target.value como respaldo de la columna revisada si no hay mapa", () => {
    expect(
      resolveReviewSortDisplay({
        sortKey: "col-estado",
        rowId: "row-1",
        columns: sortColumns,
        target: estadoTarget,
      })
    ).toEqual({ columnName: "Estado", value: "Activo" });

    expect(
      resolveReviewSortDisplay({
        sortKey: "col-estado",
        rowId: "row-1",
        columns: sortColumns,
        valuesByRow: null,
        target: estadoTarget,
      })
    ).toEqual({ columnName: "Estado", value: "Activo" });
  });

  it("usa el nombre y el tipo del objetivo aunque la columna revisada no esté en columns", () => {
    const result = resolveReviewSortDisplay({
      sortKey: "col-otra",
      rowId: "row-1",
      columns: sortColumns,
      valuesByRow: new Map([["row-1", "Valor congelado"]]),
      target: {
        id: "col-otra",
        name: "Otra columna",
        type: "text" as const,
        value: null,
      },
    });

    expect(result).toEqual({
      columnName: "Otra columna",
      value: "Valor congelado",
    });
  });

  it("muestra otra columna con su valor de valuesByRow", () => {
    const result = resolveReviewSortDisplay({
      sortKey: "col-importe",
      rowId: "row-1",
      columns: sortColumns,
      valuesByRow: new Map([["row-1", 12.5]]),
      target: estadoTarget,
    });

    expect(result).toEqual({ columnName: "Importe", value: "12.5" });
  });

  it("muestra una raya cuando el valor de la columna está vacío", () => {
    expect(
      resolveReviewSortDisplay({
        sortKey: "col-notas",
        rowId: "row-1",
        columns: sortColumns,
        valuesByRow: new Map([["row-1", null]]),
        target: estadoTarget,
      })
    ).toEqual({ columnName: "Notas", value: "—" });

    expect(
      resolveReviewSortDisplay({
        sortKey: "col-notas",
        rowId: "row-1",
        columns: sortColumns,
        valuesByRow: new Map([["row-1", ""]]),
        target: estadoTarget,
      })
    ).toEqual({ columnName: "Notas", value: "—" });
  });

  it("muestra una raya cuando la fila no está en el mapa", () => {
    // Columna revisada sin entrada para la fila actual
    expect(
      resolveReviewSortDisplay({
        sortKey: "col-estado",
        rowId: "row-9",
        columns: sortColumns,
        valuesByRow: new Map([["row-1", "Activo"]]),
        target: estadoTarget,
      })
    ).toEqual({ columnName: "Estado", value: "—" });

    // Otra columna sin entrada para la fila actual
    expect(
      resolveReviewSortDisplay({
        sortKey: "col-notas",
        rowId: "row-9",
        columns: sortColumns,
        valuesByRow: new Map([["row-1", "Sin observaciones"]]),
        target: estadoTarget,
      })
    ).toEqual({ columnName: "Notas", value: "—" });
  });

  it("devuelve null para una columna inexistente que no es la revisada", () => {
    expect(
      resolveReviewSortDisplay({
        sortKey: "col-inexistente",
        rowId: "row-1",
        columns: sortColumns,
        valuesByRow: new Map([["row-1", "Activo"]]),
        target: estadoTarget,
      })
    ).toBeNull();
  });

  it("formatea una casilla como Sí/No", () => {
    // Otra columna de tipo casilla
    expect(
      resolveReviewSortDisplay({
        sortKey: "col-activo",
        rowId: "row-1",
        columns: sortColumns,
        valuesByRow: new Map([["row-1", true]]),
        target: estadoTarget,
      })
    ).toEqual({ columnName: "Activo", value: "Sí" });

    expect(
      resolveReviewSortDisplay({
        sortKey: "col-activo",
        rowId: "row-1",
        columns: sortColumns,
        valuesByRow: new Map([["row-1", false]]),
        target: estadoTarget,
      })
    ).toEqual({ columnName: "Activo", value: "No" });

    // Columna revisada de tipo casilla, usando el respaldo target.value
    expect(
      resolveReviewSortDisplay({
        sortKey: "col-activo",
        rowId: "row-2",
        columns: sortColumns,
        target: activoTarget,
      })
    ).toEqual({ columnName: "Activo", value: "No" });
  });
});

describe("searchReviewItems", () => {
  const items = [
    makeItem("row-1", "Cliente 1", { value: "Activo" }),
    makeItem("row-2", "Cliente 2", { value: "En revisión" }),
    makeItem("row-3", "Proveedor Ñandú", { value: null }),
    makeItem("row-4", "Cliente 10", { value: "Pendiente" }),
  ];

  it("devuelve todos los ítems con su índice si la consulta está vacía", () => {
    const result = searchReviewItems(items, "");

    expect(result.map((entry) => entry.index)).toEqual([0, 1, 2, 3]);
    expect(result.map((entry) => entry.item.rowId)).toEqual([
      "row-1",
      "row-2",
      "row-3",
      "row-4",
    ]);
  });

  it("ignora los espacios de una consulta sin contenido", () => {
    expect(searchReviewItems(items, "   ")).toHaveLength(items.length);
  });

  it("encuentra por nombre de fila sin distinguir mayúsculas", () => {
    const result = searchReviewItems(items, "cliente 2");

    expect(result.map((entry) => entry.item.rowId)).toEqual(["row-2"]);
  });

  it("encuentra por el valor de la columna revisada", () => {
    const result = searchReviewItems(items, "activo");

    expect(result.map((entry) => entry.item.rowId)).toEqual(["row-1"]);
  });

  it("busca por subcadena, no por palabra completa", () => {
    const inactivos = [
      makeItem("row-1", "Cliente 1", { value: "Activo" }),
      makeItem("row-2", "Cliente 2", { value: "Inactivo" }),
    ];

    // "activo" es subcadena de "Inactivo" y por tanto coincide con ambas filas
    expect(
      searchReviewItems(inactivos, "activo").map((entry) => entry.item.rowId)
    ).toEqual(["row-1", "row-2"]);
  });

  it("ignora acentos y eñes en la consulta", () => {
    expect(
      searchReviewItems(items, "revision").map((entry) => entry.item.rowId)
    ).toEqual(["row-2"]);
    expect(
      searchReviewItems(items, "nandu").map((entry) => entry.item.rowId)
    ).toEqual(["row-3"]);
  });

  it("encuentra casillas por su valor formateado Sí/No", () => {
    const casillas = [
      makeItem("c-1", "Fila 1", {
        columnId: "col-activo",
        columnName: "Activo",
        type: "checkbox",
        value: true,
      }),
      makeItem("c-2", "Fila 2", {
        columnId: "col-activo",
        columnName: "Activo",
        type: "checkbox",
        value: false,
      }),
    ];

    expect(
      searchReviewItems(casillas, "sí").map((entry) => entry.item.rowId)
    ).toEqual(["c-1"]);
    expect(
      searchReviewItems(casillas, "no").map((entry) => entry.item.rowId)
    ).toEqual(["c-2"]);
  });

  it("devuelve una lista vacía cuando no hay coincidencias", () => {
    expect(searchReviewItems(items, "inexistente")).toEqual([]);
  });

  it("conserva el índice dentro de la lista ordenada recibida", () => {
    const ordenados = [items[2], items[0], items[3], items[1]];

    const result = searchReviewItems(ordenados, "cliente");

    expect(result.map((entry) => entry.index)).toEqual([1, 2, 3]);
    expect(result.map((entry) => entry.item.rowId)).toEqual([
      "row-1",
      "row-4",
      "row-2",
    ]);
  });
});

// --- Regresión H-02: los no ordenables y los vacíos van al final en desc ---

describe("sortReviewItems · regresión H-02: no ordenables al final", () => {
  it("en descendente deja la fecha inválida y los vacíos al final", () => {
    const fechas = [
      makeItem("f-1", "Fila 1", {
        columnId: "col-fecha",
        columnName: "Fecha",
        type: "date",
        value: "2026-01-15",
      }),
      makeItem("f-2", "Fila 2", {
        columnId: "col-fecha",
        columnName: "Fecha",
        type: "date",
        value: "2026-03-01",
      }),
      makeItem("f-3", "Fila 3", {
        columnId: "col-fecha",
        columnName: "Fecha",
        type: "date",
        value: "sin fecha",
      }),
      makeItem("f-4", "Fila 4", {
        columnId: "col-fecha",
        columnName: "Fecha",
        type: "date",
        value: null,
      }),
      makeItem("f-5", "Fila 5", {
        columnId: "col-fecha",
        columnName: "Fecha",
        type: "date",
        value: "",
      }),
    ];

    const result = sortReviewItems(fechas, {
      sortKey: "col-fecha",
      direction: "desc",
      columns: sortColumns,
    });

    // Válidas de más reciente a más antigua, después la inválida y los vacíos
    expect(result.map((item) => item.rowId)).toEqual([
      "f-2",
      "f-1",
      "f-3",
      "f-4",
      "f-5",
    ]);
    // La fecha inválida no puede quedar la primera al invertir la dirección
    expect(result[0].rowId).not.toBe("f-3");
    expect(result.findIndex((item) => item.rowId === "f-3")).toBe(2);
  });

  it("en descendente deja el valor no numérico y el vacío al final (float)", () => {
    const importes = [
      makeItem("p-1", "Fila 1", {
        columnId: "col-importe",
        columnName: "Importe",
        type: "float",
        value: 10.5,
      }),
      makeItem("p-2", "Fila 2", {
        columnId: "col-importe",
        columnName: "Importe",
        type: "float",
        value: -3,
      }),
      makeItem("p-3", "Fila 3", {
        columnId: "col-importe",
        columnName: "Importe",
        type: "float",
        value: null,
      }),
      makeItem("p-4", "Fila 4", {
        columnId: "col-importe",
        columnName: "Importe",
        type: "float",
        value: 2.25,
      }),
      makeItem("p-5", "Fila 5", {
        columnId: "col-importe",
        columnName: "Importe",
        type: "float",
        value: "sin importe",
      }),
    ];

    const result = sortReviewItems(importes, {
      sortKey: "col-importe",
      direction: "desc",
      columns: sortColumns,
    });

    expect(result.map((item) => item.rowId)).toEqual([
      "p-1",
      "p-4",
      "p-2",
      "p-5",
      "p-3",
    ]);
    expect(result[0].rowId).not.toBe("p-5");
    expect(result.findIndex((item) => item.rowId === "p-5")).toBe(3);
  });

  it("en descendente deja el valor no numérico y la cadena vacía al final (int)", () => {
    const unidades = [
      makeItem("u-1", "Fila 1", {
        columnId: "col-unidades",
        columnName: "Unidades",
        type: "int",
        value: 7,
      }),
      makeItem("u-2", "Fila 2", {
        columnId: "col-unidades",
        columnName: "Unidades",
        type: "int",
        value: -2,
      }),
      makeItem("u-3", "Fila 3", {
        columnId: "col-unidades",
        columnName: "Unidades",
        type: "int",
        value: "no-numero",
      }),
      makeItem("u-4", "Fila 4", {
        columnId: "col-unidades",
        columnName: "Unidades",
        type: "int",
        value: "",
      }),
    ];

    const desc = sortReviewItems(unidades, {
      sortKey: "col-unidades",
      direction: "desc",
      columns: sortColumns,
    });
    const asc = sortReviewItems(unidades, {
      sortKey: "col-unidades",
      direction: "asc",
      columns: sortColumns,
    });

    expect(desc.map((item) => item.rowId)).toEqual(["u-1", "u-2", "u-3", "u-4"]);
    // El no ordenable queda al final también en ascendente
    expect(asc.map((item) => item.rowId)).toEqual(["u-2", "u-1", "u-3", "u-4"]);
  });

  it("mantiene el desempate por nombre entre fechas inválidas en descendente", () => {
    const invalidas = [
      makeItem("i-1", "Beta", {
        columnId: "col-fecha",
        columnName: "Fecha",
        type: "date",
        value: "sin fecha",
      }),
      makeItem("i-2", "Alfa", {
        columnId: "col-fecha",
        columnName: "Fecha",
        type: "date",
        value: "sin fecha",
      }),
    ];

    const result = sortReviewItems(invalidas, {
      sortKey: "col-fecha",
      direction: "desc",
      columns: sortColumns,
    });

    // El desempate por nombre de fila no se invierte con la dirección
    expect(result.map((item) => item.rowId)).toEqual(["i-2", "i-1"]);
  });

  it("mantiene estable el orden original entre no ordenables idénticos", () => {
    const repetidas = [
      makeItem("r-1", "Repetida", {
        columnId: "col-fecha",
        columnName: "Fecha",
        type: "date",
        value: "sin fecha",
      }),
      makeItem("r-2", "Repetida", {
        columnId: "col-fecha",
        columnName: "Fecha",
        type: "date",
        value: "sin fecha",
      }),
      makeItem("r-3", "Repetida", {
        columnId: "col-fecha",
        columnName: "Fecha",
        type: "date",
        value: "sin fecha",
      }),
    ];

    const result = sortReviewItems(repetidas, {
      sortKey: "col-fecha",
      direction: "desc",
      columns: sortColumns,
    });

    expect(result.map((item) => item.rowId)).toEqual(["r-1", "r-2", "r-3"]);
  });

  it("compara como texto los no ordenables entre sí y deja la válida primero", () => {
    const mezcla = [
      makeItem("x-1", "Fila 1", {
        columnId: "col-fecha",
        columnName: "Fecha",
        type: "date",
        value: "aaa",
      }),
      makeItem("x-2", "Fila 2", {
        columnId: "col-fecha",
        columnName: "Fecha",
        type: "date",
        value: "bbb",
      }),
      makeItem("x-3", "Fila 3", {
        columnId: "col-fecha",
        columnName: "Fecha",
        type: "date",
        value: "2026-05-01",
      }),
    ];

    const asc = sortReviewItems(mezcla, {
      sortKey: "col-fecha",
      direction: "asc",
      columns: sortColumns,
    });
    const desc = sortReviewItems(mezcla, {
      sortKey: "col-fecha",
      direction: "desc",
      columns: sortColumns,
    });

    // La válida siempre va primero; las inválidas se ordenan como texto
    expect(asc.map((item) => item.rowId)).toEqual(["x-3", "x-1", "x-2"]);
    expect(desc.map((item) => item.rowId)).toEqual(["x-3", "x-2", "x-1"]);
  });
});
