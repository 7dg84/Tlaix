import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import {
  AlertCircle,
  ArrowDownAZ,
  ArrowUpAZ,
  CheckCircle2,
  Loader2,
  MoveLeft,
  MoveRight,
  RefreshCw,
  ScanLine,
  Search,
  X,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { reviewService } from "@/api";
import { isAuthError } from "@/lib/auth";
import type { ColumnType } from "@/components/AddColumnDialog";
import {
  buildColumnReviewItems,
  buildRowReviewItems,
  draftToValue,
  filterOptions,
  formatReviewValue,
  isSameCellValue,
  parseOptionNumber,
  searchReviewItems,
  sortReviewItems,
  valueToDraft,
} from "@/lib/review";
import type {
  ReviewAxis,
  ReviewColumn,
  ReviewDraftValue,
  ReviewItem,
  ReviewSortDirection,
  ReviewSortKey,
} from "@/lib/review";

interface ReviewModeProps {
  axis: ReviewAxis;
  tableId: string;
  targetId: string;
  targetLabel: string;
  /** Pestaña activa: solo aplica al revisar una fila. */
  tabId?: string;
  /** Columnas de la pestaña activa; solo se usan para ordenar una columna. */
  columns?: ReviewColumn[];
  /** Actualiza la tabla y persiste la celda. Debe rechazar la promesa si falla. */
  onSave: (rowId: string, columnId: string, value: unknown) => Promise<void>;
  onClose: () => void;
}

interface SelectEntry {
  key: string;
  label: string;
  /** Índice original 1-based; `null` para la opción virtual "Valor actual". */
  number: number | null;
  value: string;
  isCurrent: boolean;
}

/** Vista del overlay: recorrido con orden configurable o búsqueda rápida. */
type ReviewViewMode = "order" | "search";

/** Dentro de la búsqueda: lista de resultados o edición de un registro. */
type ReviewSearchView = "list" | "edit";

/** Destino tras guardar: mover, cerrar el overlay o quedarse en el editor. */
type SaveAdvance = number | "close" | "stay";

const TYPE_LABELS: Record<ColumnType, string> = {
  text: "Texto",
  checkbox: "Casilla",
  int: "Entero",
  float: "Decimal",
  select: "Lista",
  date: "Fecha",
};

/** Valor de la celda convertido a texto para las listas; `null` si está vacío. */
const selectionText = (value: unknown): string | null =>
  value === null || value === undefined || value === "" ? null : String(value);

const describeSaveError = (error: unknown): string => {
  const status = (error as { response?: { status?: number } })?.response?.status;
  switch (status) {
    case 400:
      return "El servidor rechazó el valor. Revisa el dato e inténtalo de nuevo.";
    case 401:
      return "Tu sesión expiró. Vuelve a iniciar sesión para guardar.";
    case 403:
      return "No tienes permiso para modificar esta celda.";
    case 404:
      return "La celda o la tabla ya no existe.";
    default:
      return "No se pudo guardar el cambio. Inténtalo de nuevo.";
  }
};

/** Código HTTP del error, si lo trae (para distinguir la sesión expirada). */
const errorStatus = (error: unknown): number | null =>
  (error as { response?: { status?: number } })?.response?.status ?? null;

const describeLoadError = (error: unknown): string => {
  const status = (error as { response?: { status?: number } })?.response?.status;
  switch (status) {
    case 401:
      return "Tu sesión expiró. Vuelve a iniciar sesión para usar el modo revisión.";
    case 403:
      return "No tienes permiso para ver estos registros.";
    case 404:
      return "La tabla, la fila o la columna ya no existe.";
    default:
      return "No se pudieron cargar los datos del modo revisión.";
  }
};

/** ¿El foco está en un campo donde las teclas se escriben de forma nativa? */
const isEditableTarget = (target: EventTarget | null): boolean => {
  const element = target as HTMLElement | null;
  if (!element) return false;
  return (
    element.tagName === "INPUT" ||
    element.tagName === "TEXTAREA" ||
    element.tagName === "SELECT" ||
    element.isContentEditable
  );
};

export const ReviewMode = ({
  axis,
  tableId,
  targetId,
  targetLabel,
  tabId,
  columns = [],
  onSave,
  onClose,
}: ReviewModeProps) => {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [index, setIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [targetName, setTargetName] = useState(targetLabel);
  const [draft, setDraft] = useState<ReviewDraftValue>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [selectError, setSelectError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const [filter, setFilter] = useState("");
  const [numberBuffer, setNumberBuffer] = useState("");
  const [highlighted, setHighlighted] = useState(0);

  // Modo orden y búsqueda (solo al revisar una columna)
  const [viewMode, setViewMode] = useState<ReviewViewMode>("order");
  const [searchView, setSearchView] = useState<ReviewSearchView>("list");
  const [sortKey, setSortKey] = useState<ReviewSortKey>("row-name");
  const [sortDirection, setSortDirection] = useState<ReviewSortDirection>("asc");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchHighlighted, setSearchHighlighted] = useState(0);
  const [sortLoading, setSortLoading] = useState(false);
  // Orden congelado: editar un valor no reordena hasta pulsar "Reordenar"
  const [orderedIds, setOrderedIds] = useState<string[]>([]);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const checkboxRef = useRef<HTMLDivElement | null>(null);
  const highlightedOptionRef = useRef<HTMLLIElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const highlightedResultRef = useRef<HTMLLIElement | null>(null);
  const sortBarRef = useRef<HTMLDivElement | null>(null);
  // Ref sincronizada: bloquea el avance en cuanto arranca el PUT, sin esperar al render
  const savingRef = useRef(false);
  // Código HTTP del último fallo de guardado (401 cierra el overlay)
  const saveErrorStatusRef = useRef<number | null>(null);
  // Valor y destino del guardado fallido, para reintentarlo desde el panel de error
  const failedSaveRef = useRef<{
    value: unknown;
    advance: SaveAdvance;
  } | null>(null);
  // Copia sincronizada de los ítems: permite reordenar justo después de guardar
  const itemsRef = useRef<ReviewItem[]>([]);
  // Valores por columna para ordenar, cacheados durante la vida del overlay
  const sortCacheRef = useRef<Map<string, Map<string, unknown>>>(new Map());
  // Petición de valores de orden en curso (se cancela al cerrar o al cambiarla)
  const sortAbortRef = useRef<AbortController | null>(null);
  // Descarta respuestas de orden que lleguen tarde
  const sortRequestRef = useRef(0);

  const isColumnAxis = axis === "column";
  const isSearchList =
    isColumnAxis && viewMode === "search" && searchView === "list";
  const isSearchEditor =
    isColumnAxis && viewMode === "search" && searchView === "edit";

  const itemsById = useMemo(
    () => new Map(items.map((item) => [item.rowId, item])),
    [items]
  );

  // Orden visible: los ítems se resuelven contra el estado actual para que un
  // valor editado se vea sin cambiar la posición congelada en `orderedIds`.
  const visibleItems = useMemo(() => {
    if (!isColumnAxis || orderedIds.length === 0) return items;
    const seen = new Set<string>();
    const ordered: ReviewItem[] = [];
    orderedIds.forEach((rowId) => {
      const item = itemsById.get(rowId);
      if (item && !seen.has(rowId)) {
        seen.add(rowId);
        ordered.push(item);
      }
    });
    // Filas nuevas o no incluidas en el orden congelado se añaden al final
    items.forEach((item) => {
      if (!seen.has(item.rowId)) ordered.push(item);
    });
    return ordered;
  }, [isColumnAxis, items, itemsById, orderedIds]);

  const current = visibleItems[index];
  const isSelect = current?.type === "select";
  const listOptions = useMemo(
    () => (Array.isArray(current?.options) ? current.options : []),
    [current]
  );
  const options = useMemo(
    () => (current?.type === "select" ? listOptions : []),
    [current, listOptions]
  );

  const searchResults = useMemo(
    () => searchReviewItems(visibleItems, searchQuery),
    [visibleItems, searchQuery]
  );

  const sortKeyLabel = useMemo(() => {
    if (sortKey === "original") return "Orden original";
    if (sortKey === "row-name") return "Nombre de fila";
    return columns.find((column) => column.id === sortKey)?.name ?? "Columna";
  }, [sortKey, columns]);

  // ---------------------------------------------------------------- carga
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setIsLoading(true);
    setLoadError(null);
    setItems([]);
    itemsRef.current = [];
    setOrderedIds([]);
    setIndex(0);
    setCompleted(false);
    setDraft(null);
    setSaveError(null);
    saveErrorStatusRef.current = null;
    failedSaveRef.current = null;
    setSelectError(null);
    setFilter("");
    setNumberBuffer("");
    setTargetName(targetLabel);
    // El criterio y la búsqueda viven mientras el overlay está abierto; al
    // recargar datos se vuelve al orden inicial y se limpia la caché de columnas.
    setViewMode("order");
    setSearchView("list");
    setSearchQuery("");
    setSearchHighlighted(0);
    setSortKey("row-name");
    setSortDirection("asc");
    sortCacheRef.current.clear();
    sortAbortRef.current?.abort();
    sortAbortRef.current = null;
    sortRequestRef.current += 1;

    const load = async () => {
      try {
        if (axis === "row") {
          const response = await reviewService.getRowCellValues(
            tableId,
            targetId,
            tabId,
            controller.signal
          );
          if (cancelled || controller.signal.aborted) return;
          const loaded = buildRowReviewItems(response);
          itemsRef.current = loaded;
          setItems(loaded);
          setTargetName(response.target.name || targetLabel);
        } else {
          const response = await reviewService.getColumnCellValues(
            tableId,
            targetId,
            controller.signal
          );
          if (cancelled || controller.signal.aborted) return;
          const loaded = buildColumnReviewItems(response);
          itemsRef.current = loaded;
          setItems(loaded);
          // Orden inicial: nombre de fila ascendente
          setOrderedIds(
            sortReviewItems(loaded, {
              sortKey: "row-name",
              direction: "asc",
              columns: [],
            }).map((item) => item.rowId)
          );
          setTargetName(response.target.name || targetLabel);
        }
      } catch (error) {
        // Una carga cancelada al cerrar el overlay no es un error para el usuario
        if (cancelled || controller.signal.aborted) return;
        setLoadError(describeLoadError(error));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [axis, tableId, targetId, tabId, targetLabel, reloadToken]);

  // Cancelar la carga de columnas de orden al cerrar el overlay
  useEffect(
    () => () => {
      sortAbortRef.current?.abort();
      sortAbortRef.current = null;
    },
    []
  );

  // Mantener la ref de ítems al día con el estado
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // Bloquear el scroll del documento mientras el overlay está montado y aislar
  // el árbol de la app (`#root`) del lector de pantalla: el portal vive en `body`.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const root = document.getElementById("root");
    const previousAriaHidden = root?.getAttribute("aria-hidden") ?? null;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // El foco se mueve al overlay antes de ocultar `#root`: los navegadores
    // ignoran `aria-hidden` si algún descendiente conserva el foco.
    containerRef.current?.focus();
    root?.setAttribute("aria-hidden", "true");

    return () => {
      document.body.style.overflow = previousOverflow;
      if (root) {
        if (previousAriaHidden === null) {
          root.removeAttribute("aria-hidden");
        } else {
          root.setAttribute("aria-hidden", previousAriaHidden);
        }
      }
      try {
        previouslyFocused?.focus();
      } catch {
        // El elemento que tenía el foco pudo desaparecer mientras estaba abierto
      }
    };
  }, []);

  // Reiniciar el editor local al cambiar de ítem
  useEffect(() => {
    if (!current) {
      setDraft(null);
      return;
    }
    setDraft(valueToDraft(current.type, current.value));
    setFilter("");
    setNumberBuffer("");
    setHighlighted(0);
    setSelectError(null);
    setSaveError(null);
    saveErrorStatusRef.current = null;
    failedSaveRef.current = null;
  }, [index, visibleItems.length, current?.rowId, current?.columnId, current?.type]);

  // Foco automático en cada iteración: la lista filtra escribiendo (sin selección),
  // la casilla enfoca su contenedor y el resto selecciona el texto completo.
  // En la lista de búsqueda el foco pertenece al buscador.
  useEffect(() => {
    if (isLoading || loadError || completed || !current || isSearchList) return;

    // Se espera al frame siguiente para que el efecto de reinicio ya haya
    // aplicado el nuevo draft; si no, la selección cae sobre el texto anterior.
    const frame = requestAnimationFrame(() => {
      if (current.type === "select") {
        inputRef.current?.focus();
        return;
      }

      if (current.type === "checkbox") {
        checkboxRef.current?.focus();
        return;
      }

      const input = inputRef.current;
      if (input) {
        input.focus();
        try {
          input.select();
        } catch {
          // Algunos tipos nativos (number/date) no admiten selección programática
        }
        return;
      }
      containerRef.current?.focus();
    });

    return () => cancelAnimationFrame(frame);
  }, [
    index,
    visibleItems.length,
    isLoading,
    loadError,
    completed,
    isSearchList,
    current?.rowId,
    current?.columnId,
    current?.type,
  ]);

  // El buscador recibe el foco al entrar en la lista de resultados
  useEffect(() => {
    if (!isSearchList || isLoading || loadError || completed) return;
    const frame = requestAnimationFrame(() => searchInputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [isSearchList, isLoading, loadError, completed]);

  // Al entrar en la lista (o al cambiar la consulta) se resalta el registro actual
  // si sigue visible; si no, el primero.
  useEffect(() => {
    if (!isSearchList) return;
    const position = searchResults.findIndex(
      (result) => result.item.rowId === current?.rowId
    );
    setSearchHighlighted(position >= 0 ? position : 0);
  }, [isSearchList, searchQuery, searchResults, current?.rowId]);

  // Mantener visible el resultado resaltado en listas largas
  useEffect(() => {
    if (!isSearchList) return;
    highlightedResultRef.current?.scrollIntoView({ block: "nearest" });
  }, [isSearchList, searchHighlighted]);

  // Mantener visible la opción resaltada en listas largas
  useEffect(() => {
    highlightedOptionRef.current?.scrollIntoView({ block: "nearest" });
  }, [highlighted, filter, numberBuffer, index]);

  // El buffer numérico se descarta tras 700 ms sin dígitos
  useEffect(() => {
    if (!numberBuffer) return;
    const timeout = window.setTimeout(() => setNumberBuffer(""), 700);
    return () => window.clearTimeout(timeout);
  }, [numberBuffer]);

  // -------------------------------------------------------- opciones (lista)
  const selectEntries = useMemo<SelectEntry[]>(() => {
    if (!current || current.type !== "select") return [];
    const currentText = selectionText(current.value);
    const matches = filterOptions(listOptions, filter);
    const matchedSet = new Set(matches);

    const entries: SelectEntry[] = listOptions
      .map((option, optionIndex) => ({
        key: `option-${optionIndex}`,
        label: option,
        number: optionIndex + 1,
        value: option,
        isCurrent: currentText !== null && option === currentText,
      }))
      .filter((entry) => matchedSet.has(entry.label));

    // Dato legado: el valor actual no está entre las opciones configuradas
    if (currentText !== null && !listOptions.includes(currentText)) {
      entries.unshift({
        key: "current-value",
        label: `Valor actual: ${currentText}`,
        number: null,
        value: currentText,
        isCurrent: true,
      });
    }
    return entries;
  }, [current, filter, listOptions]);

  // Reajustar el resaltado al filtrar: primero el valor actual, si sigue visible.
  // Con un filtro activo y un valor legado (no está en las opciones) se resalta
  // la primera coincidencia real.
  useEffect(() => {
    // Mientras se escribe un número no se reajusta: el resaltado sigue a la
    // opción numérica; al expirar el buffer el efecto se reevalúa.
    if (numberBuffer) return;
    if (selectEntries.length === 0) {
      setHighlighted(0);
      return;
    }
    const currentIndex = selectEntries.findIndex(
      (entry) => entry.isCurrent && (filter.trim() === "" || entry.number !== null)
    );
    setHighlighted(currentIndex >= 0 ? currentIndex : 0);
  }, [filter, selectEntries.length, current?.rowId, current?.columnId, numberBuffer]);

  const hasNoMatches =
    isSelect &&
    filter.trim() !== "" &&
    filterOptions(listOptions, filter).length === 0;

  // ------------------------------------------------------------- guardado
  const readDraftValue = (): unknown => {
    if (!current) return null;
    return draftToValue(current.type, draft);
  };

  const clearSaveError = () => {
    setSaveError(null);
    saveErrorStatusRef.current = null;
    failedSaveRef.current = null;
  };

  /** Refleja el valor guardado en el ítem correspondiente sin tocar el orden. */
  const applySavedValue = (rowId: string, columnId: string, value: unknown) => {
    const nextItems = itemsRef.current.map((item) =>
      item.rowId === rowId && item.columnId === columnId
        ? { ...item, value }
        : item
    );
    itemsRef.current = nextItems;
    setItems(nextItems);
  };

  /**
   * Persiste el valor. `advance` describe el destino que se intentaba alcanzar,
   * para poder reintentar la acción completa desde el panel de error.
   */
  const commitValue = async (
    value: unknown,
    advance: SaveAdvance = 1
  ): Promise<boolean> => {
    if (!current || savingRef.current) return false;

    // Validación numérica previa: evita truncados silenciosos en `int`/`float`
    if (current.type === "int" && value !== null && !Number.isInteger(value)) {
      saveErrorStatusRef.current = null;
      failedSaveRef.current = null;
      setSaveError("El valor debe ser un número entero.");
      return false;
    }
    if (
      current.type === "float" &&
      typeof value === "number" &&
      Number.isNaN(value)
    ) {
      saveErrorStatusRef.current = null;
      failedSaveRef.current = null;
      setSaveError("El valor debe ser un número.");
      return false;
    }

    if (isSameCellValue(current.type, value, current.value)) {
      clearSaveError();
      return true;
    }

    savingRef.current = true;
    setSaving(true);
    try {
      await onSave(current.rowId, current.columnId, value);
      applySavedValue(current.rowId, current.columnId, value);
      setDraft(valueToDraft(current.type, value));
      clearSaveError();
      return true;
    } catch (error) {
      // El valor no se guardó: se revierte el editor y se ofrece reintentar o salir
      saveErrorStatusRef.current = errorStatus(error);
      failedSaveRef.current = { value, advance };
      setDraft(valueToDraft(current.type, current.value));
      setSaveError(describeSaveError(error));
      // Un 401 ya disparó la redirección global al login: el toast es redundante
      if (!isAuthError(error)) {
        toast.error(describeSaveError(error));
      }
      // El foco estaba en "Reintentar": al volver a fallar el panel se remonta y
      // el elemento enfocado desaparece. Se devuelve el foco al editor en el
      // frame siguiente (ya repintado) para no perder el teclado.
      requestAnimationFrame(() => {
        if (current.type === "checkbox") {
          checkboxRef.current?.focus();
          return;
        }
        if (current.type === "select") {
          inputRef.current?.focus();
          return;
        }
        if (inputRef.current) {
          inputRef.current.focus();
          return;
        }
        containerRef.current?.focus();
      });
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  /**
   * Guarda el cambio pendiente sin mover de registro. Se usa antes de cambiar de
   * modo, de criterio de orden o de resultado de búsqueda.
   */
  const commitPending = async (): Promise<boolean> => {
    if (!current || completed || isSearchList) return true;
    return commitValue(readDraftValue(), "stay");
  };

  const goTo = (nextIndex: number) => {
    if (nextIndex >= visibleItems.length) {
      setCompleted(true);
      return;
    }
    if (nextIndex < 0) return;
    setIndex(nextIndex);
  };

  const navigate = async (delta: number) => {
    if (savingRef.current || completed) return;
    const saved = await commitValue(readDraftValue(), delta);
    if (!saved) return;
    goTo(index + delta);
  };

  const commitAndAdvance = async (value: unknown, delta: number) => {
    if (!current || savingRef.current || completed) return;
    setDraft(valueToDraft(current.type, value));
    const saved = await commitValue(value, delta);
    if (!saved) return;
    goTo(index + delta);
  };

  const handleClose = async () => {
    if (savingRef.current) return;
    // En la lista de búsqueda no hay edición abierta que guardar
    if (completed || !current || isSearchList) {
      onClose();
      return;
    }
    // Segundo intento de cierre con el error a la vista: se descarta y se sale
    if (saveError) {
      onClose();
      return;
    }
    const saved = await commitValue(readDraftValue(), "close");
    if (saved) {
      onClose();
      return;
    }
    // Sesión expirada: el interceptor global ya lleva al login; solo cerramos
    // el overlay para no bloquear la navegación
    if (saveErrorStatusRef.current === 401) {
      onClose();
    }
  };

  /** Reintenta el guardado fallido y continúa con la acción interrumpida. */
  const handleRetry = async () => {
    const failed = failedSaveRef.current;
    clearSaveError();
    if (!failed) {
      inputRef.current?.focus();
      return;
    }
    const saved = await commitValue(failed.value, failed.advance);
    if (!saved) return;
    if (failed.advance === "close") {
      onClose();
      return;
    }
    // "stay" no avanza: el usuario sigue en el editor tras reintentar
    if (failed.advance === "stay") return;
    goTo(index + failed.advance);
  };

  const restart = () => {
    setCompleted(false);
    setIndex(0);
    const first = visibleItems[0];
    setDraft(first ? valueToDraft(first.type, first.value) : null);
    setFilter("");
    setNumberBuffer("");
    setHighlighted(0);
    setSelectError(null);
    clearSaveError();
  };

  // ------------------------------------------------------------- orden
  /** Valores de la columna de orden por fila, con caché por columna. */
  const ensureSortValues = async (
    columnId: string,
    sourceItems: ReviewItem[]
  ): Promise<Map<string, unknown> | null> => {
    // La columna revisada ya trae sus valores en los ítems
    if (columnId === targetId) {
      return new Map(sourceItems.map((item) => [item.rowId, item.value]));
    }
    const cached = sortCacheRef.current.get(columnId);
    if (cached) return cached;

    sortAbortRef.current?.abort();
    const controller = new AbortController();
    sortAbortRef.current = controller;
    setSortLoading(true);
    try {
      const response = await reviewService.getColumnCellValues(
        tableId,
        columnId,
        controller.signal
      );
      const values = new Map(
        response.items.map((item) => [item.row_id, item.value])
      );
      sortCacheRef.current.set(columnId, values);
      return values;
    } catch (error) {
      if (controller.signal.aborted) return null;
      if (!isAuthError(error)) {
        toast.error("No se pudo cargar la columna para ordenar.");
      }
      return null;
    } finally {
      if (sortAbortRef.current === controller) {
        sortAbortRef.current = null;
        setSortLoading(false);
      }
    }
  };

  /** Calcula el orden; devuelve `null` si no se pudo cargar la columna. */
  const computeOrder = async (
    sourceItems: ReviewItem[],
    nextKey: ReviewSortKey,
    nextDirection: ReviewSortDirection
  ): Promise<ReviewItem[] | null> => {
    if (nextKey === "original") return [...sourceItems];
    if (nextKey === "row-name") {
      return sortReviewItems(sourceItems, {
        sortKey: "row-name",
        direction: nextDirection,
        columns,
      });
    }
    if (!columns.some((column) => column.id === nextKey)) {
      // La columna revisada siempre se puede usar aunque falte en la lista
      if (nextKey !== targetId || !current) {
        toast.error("La columna para ordenar ya no está disponible.");
        return null;
      }
    }
    const sortColumns = columns.some((column) => column.id === nextKey)
      ? columns
      : [
          ...columns,
          { id: targetId, name: targetName, type: current.type },
        ];
    const values = await ensureSortValues(nextKey, sourceItems);
    if (!values) return null;
    return sortReviewItems(sourceItems, {
      sortKey: nextKey,
      direction: nextDirection,
      columns: sortColumns,
      valuesByRow: values,
    });
  };

  /** Congela el orden y conserva la fila actual si sigue existiendo. */
  const applyOrder = (nextOrder: ReviewItem[]) => {
    setOrderedIds(nextOrder.map((item) => item.rowId));
    const currentRowId = current?.rowId;
    const nextIndex = currentRowId
      ? nextOrder.findIndex((item) => item.rowId === currentRowId)
      : -1;
    setIndex(nextIndex >= 0 ? nextIndex : 0);
  };

  const changeSort = async (
    nextKey: ReviewSortKey,
    nextDirection: ReviewSortDirection
  ) => {
    if (!isColumnAxis || savingRef.current || sortLoading) return;
    if (nextKey === sortKey && nextDirection === sortDirection) return;
    // Cambiar de criterio con un cambio pendiente guarda primero
    const saved = await commitPending();
    if (!saved) return;
    const requestId = ++sortRequestRef.current;
    const nextOrder = await computeOrder(
      itemsRef.current,
      nextKey,
      nextDirection
    );
    // Si falló la carga o llegó una respuesta vieja, se mantiene el orden anterior
    if (!nextOrder || requestId !== sortRequestRef.current) return;
    setSortKey(nextKey);
    setSortDirection(nextDirection);
    applyOrder(nextOrder);
  };

  const toggleSortDirection = () => {
    if (sortKey === "original") return;
    void changeSort(sortKey, sortDirection === "asc" ? "desc" : "asc");
  };

  const reorder = async () => {
    if (!isColumnAxis || savingRef.current || sortLoading) return;
    const saved = await commitPending();
    if (!saved) return;
    const requestId = ++sortRequestRef.current;
    const nextOrder = await computeOrder(
      itemsRef.current,
      sortKey,
      sortDirection
    );
    if (!nextOrder || requestId !== sortRequestRef.current) return;
    applyOrder(nextOrder);
  };

  // ------------------------------------------------------------- búsqueda
  const focusSearchInput = async () => {
    if (!isColumnAxis || savingRef.current) return;
    // Siempre se guarda el cambio pendiente; en la lista de búsqueda es no-op
    const saved = await commitPending();
    if (!saved) return;
    if (viewMode !== "search") setViewMode("search");
    setSearchView("list");
    requestAnimationFrame(() => searchInputRef.current?.focus());
  };

  const switchViewMode = async (next: ReviewViewMode) => {
    if (!isColumnAxis || next === viewMode || savingRef.current) return;
    const saved = await commitPending();
    if (!saved) return;
    setViewMode(next);
    if (next === "search") {
      setSearchView("list");
      return;
    }
    // Al volver al orden se edita el resultado resaltado, si había lista
    if (isSearchList) {
      const result = searchResults[searchHighlighted];
      if (result) setIndex(result.index);
    }
    setSearchView("edit");
  };

  const openSearchResult = async (position: number) => {
    const result = searchResults[position];
    if (!result || savingRef.current) return;
    const saved = await commitPending();
    if (!saved) return;
    setIndex(result.index);
    setSearchView("edit");
  };

  const moveSearchTo = (delta: number) => {
    if (!current) return;
    const position = searchResults.findIndex(
      (result) => result.item.rowId === current.rowId
    );
    if (position < 0) return;
    const next = position + delta;
    // Sin vecino dentro del filtro actual: se queda en el editor
    if (next < 0 || next >= searchResults.length) return;
    setIndex(searchResults[next].index);
  };

  /** Guarda y sale del editor de búsqueda hacia la lista o al vecino del filtro. */
  const exitSearchEditor = async (
    destination: "list" | "next" | "prev",
    override?: { value: unknown }
  ) => {
    if (!current || savingRef.current) return;
    const value = override ? override.value : readDraftValue();
    if (override) setDraft(valueToDraft(current.type, override.value));
    const saved = await commitValue(value, "stay");
    if (!saved) return;
    if (destination === "list") {
      setSearchView("list");
      return;
    }
    moveSearchTo(destination === "next" ? 1 : -1);
  };

  const handleSearchListKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setSearchHighlighted((previous) =>
          searchResults.length === 0
            ? 0
            : (previous + 1) % searchResults.length
        );
        return;
      case "ArrowUp":
        event.preventDefault();
        setSearchHighlighted((previous) =>
          searchResults.length === 0
            ? 0
            : (previous - 1 + searchResults.length) % searchResults.length
        );
        return;
      case "Home":
        event.preventDefault();
        setSearchHighlighted(0);
        return;
      case "End":
        event.preventDefault();
        setSearchHighlighted(Math.max(0, searchResults.length - 1));
        return;
      case "Enter":
        event.preventDefault();
        void openSearchResult(searchHighlighted);
        return;
      case "Escape":
        event.preventDefault();
        // Primero limpia la consulta; con el buscador vacío vuelve al orden
        if (searchQuery) {
          setSearchQuery("");
          setSearchHighlighted(0);
          return;
        }
        void switchViewMode("order");
        return;
      default:
        return;
    }
  };

  // -------------------------------------------------------------- teclado
  const trapFocus = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (!container) return;
    const focusables = Array.from(
      container.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
      )
    );
    if (focusables.length === 0) {
      event.preventDefault();
      container.focus();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === container)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const handleCheckboxKey = async (
    event: ReactKeyboardEvent<HTMLDivElement>,
    inSearch = false
  ) => {
    // Shift+flechas: se deja la selección nativa del texto
    if (
      event.shiftKey &&
      (event.key === "ArrowLeft" || event.key === "ArrowRight")
    ) {
      return;
    }
    if (event.key === " ") {
      event.preventDefault();
      clearSaveError();
      setDraft((previous) => !previous);
      return;
    }
    if (event.key === "0" || event.key === "f" || event.key === "F") {
      event.preventDefault();
      clearSaveError();
      setDraft(false);
      return;
    }
    if (event.key === "1" || event.key === "t" || event.key === "T") {
      event.preventDefault();
      clearSaveError();
      setDraft(true);
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      if (inSearch) {
        await exitSearchEditor("prev");
        return;
      }
      await navigate(-1);
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      if (inSearch) {
        await exitSearchEditor("next");
        return;
      }
      await navigate(1);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (inSearch) {
        await exitSearchEditor("list");
        return;
      }
      await navigate(1);
    }
  };

  const handleSelectKey = async (
    event: ReactKeyboardEvent<HTMLDivElement>,
    inSearch = false
  ) => {
    // Shift+flechas: se deja la selección nativa del texto del filtro
    if (
      event.shiftKey &&
      (event.key === "ArrowLeft" || event.key === "ArrowRight")
    ) {
      return;
    }

    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      const delta = event.key === "ArrowLeft" ? -1 : 1;
      if (inSearch) {
        // Guarda el valor pendiente antes de moverse dentro del filtro
        await exitSearchEditor(delta === -1 ? "prev" : "next");
        return;
      }
      await navigate(delta);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();

      // Con buffer numérico, el número debe existir y estar visible en la lista
      if (numberBuffer) {
        const byNumber = parseOptionNumber(numberBuffer, listOptions.length);
        const target =
          byNumber !== null
            ? selectEntries.find((entry) => entry.number === byNumber)
            : undefined;
        if (!target) {
          setSelectError(`Opción ${numberBuffer} no válida`);
          return;
        }
        setSelectError(null);
        if (inSearch) {
          await exitSearchEditor("list", { value: target.value });
          return;
        }
        await commitAndAdvance(target.value, 1);
        return;
      }

      if (hasNoMatches) return;
      const entry = selectEntries[Math.min(highlighted, selectEntries.length - 1)];
      if (!entry) return;
      if (inSearch) {
        await exitSearchEditor("list", { value: entry.value });
        return;
      }
      await commitAndAdvance(entry.value, 1);
      return;
    }

    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      setSelectError(null);
      if (selectEntries.length === 0) return;
      const delta = event.key === "ArrowDown" ? 1 : -1;
      setHighlighted(
        (previous) =>
          (previous + delta + selectEntries.length) % selectEntries.length
      );
      return;
    }

    if (event.key === "Backspace" && numberBuffer) {
      event.preventDefault();
      setSelectError(null);
      setNumberBuffer(numberBuffer.slice(0, -1));
      return;
    }

    // Solo se interceptan los dígitos: construyen el buffer numérico y limpian el filtro
    if (/^[0-9]$/.test(event.key)) {
      event.preventDefault();
      const nextBuffer = (numberBuffer + event.key).slice(-4);
      setFilter("");
      setSelectError(null);
      setNumberBuffer(nextBuffer);
      const parsed = parseOptionNumber(nextBuffer, listOptions.length);
      if (parsed !== null) {
        const optionValue = listOptions[parsed - 1];
        const visibleIndex = selectEntries.findIndex(
          (entry) => entry.number !== null && entry.value === optionValue
        );
        if (visibleIndex >= 0) setHighlighted(visibleIndex);
      }
      return;
    }

    // Letras y demás caracteres los maneja el input de forma nativa (`onChange`)
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.nativeEvent.isComposing) return;
    // Si hay un Select de Radix abierto, su contenido (portal) gestiona el teclado.
    // El foco puede seguir en el trigger, así que el guard del contenedor no basta.
    if (
      typeof document !== "undefined" &&
      document.querySelector('[role="listbox"][data-state="open"]')
    ) {
      return;
    }
    // Los portales (p. ej. el contenido de Radix Select) suben por el árbol de
    // React aunque vivan en `document.body`: solo se procesan las teclas de los
    // controles que están dentro del overlay.
    if (event.defaultPrevented) return;
    const targetNode = event.target as Node | null;
    if (!targetNode || !containerRef.current?.contains(targetNode)) return;

    const hasCommandModifier = event.ctrlKey || event.metaKey;

    // Ctrl+F: pasar a la búsqueda sin abrir el buscar del navegador
    if (
      hasCommandModifier &&
      !event.altKey &&
      event.key.toLowerCase() === "f"
    ) {
      if (!isColumnAxis) return;
      event.preventDefault();
      void focusSearchInput();
      return;
    }

    // Ctrl+Enter en el editor de búsqueda: guardar y avanzar dentro del filtro
    if (
      hasCommandModifier &&
      !event.altKey &&
      event.key === "Enter" &&
      isSearchEditor
    ) {
      event.preventDefault();
      if (current?.type === "select") {
        // En una lista, Enter ya elige la opción resaltada y vuelve a la lista
        void handleSelectKey(event, true);
        return;
      }
      void exitSearchEditor("next");
      return;
    }

    if (hasCommandModifier) return;

    // Alt+flechas dispara el historial del navegador: se anula sin interceptar
    // el resto de combinaciones con Alt (p. ej. menús del sistema).
    if (event.altKey) {
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
      }
      return;
    }

    if (event.key === "Tab") {
      trapFocus(event);
      return;
    }

    const targetElement = event.target as HTMLElement | null;
    const isNativeButton = targetElement?.tagName === "BUTTON";
    // En botones, Enter/Espacio disparan el click nativo: no duplicar la acción
    if (isNativeButton && (event.key === "Enter" || event.key === " ")) return;

    // `/` fuera de un campo de texto pasa a la búsqueda
    if (
      event.key === "/" &&
      isColumnAxis &&
      !isEditableTarget(event.target)
    ) {
      event.preventDefault();
      void focusSearchInput();
      return;
    }

    if (isSearchList) {
      handleSearchListKey(event);
      return;
    }

    if (completed) {
      if (event.key === "Escape" || event.key === "Enter") {
        event.preventDefault();
        onClose();
      }
      return;
    }

    if (!current) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
      return;
    }

    if (savingRef.current) {
      if (["ArrowLeft", "ArrowRight", "Enter", "Escape", " "].includes(event.key)) {
        event.preventDefault();
      }
      return;
    }

    // El editor de búsqueda guarda y vuelve a la lista en lugar de cerrar el overlay
    if (isSearchEditor) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (current.type === "select" && (filter || numberBuffer)) {
          setFilter("");
          setNumberBuffer("");
          setHighlighted(0);
          setSelectError(null);
          return;
        }
        void exitSearchEditor("list");
        return;
      }
      if (current.type === "select") {
        void handleSelectKey(event, true);
        return;
      }
      if (current.type === "checkbox") {
        void handleCheckboxKey(event, true);
        return;
      }
      // Shift+flechas: selección nativa del texto, no se intercepta
      if (
        event.shiftKey &&
        (event.key === "ArrowLeft" || event.key === "ArrowRight")
      ) {
        return;
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        void exitSearchEditor(event.key === "ArrowLeft" ? "prev" : "next");
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        void exitSearchEditor("list");
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      if (current.type === "select" && (filter || numberBuffer)) {
        setFilter("");
        setNumberBuffer("");
        setHighlighted(0);
        setSelectError(null);
        return;
      }
      void handleClose();
      return;
    }

    // Los controles de orden tienen su propio teclado (Radix): no se navega
    if (sortBarRef.current?.contains(targetElement)) return;

    if (current.type === "select") {
      void handleSelectKey(event);
      return;
    }

    if (current.type === "checkbox") {
      void handleCheckboxKey(event);
      return;
    }

    // text | int | float | date
    // Shift+flechas: selección nativa del texto, no se intercepta
    if (
      event.shiftKey &&
      (event.key === "ArrowLeft" || event.key === "ArrowRight")
    ) {
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      void navigate(-1);
      return;
    }
    if (event.key === "ArrowRight" || event.key === "Enter") {
      event.preventDefault();
      void navigate(1);
    }
  };

  // --------------------------------------------------------------- render
  const typeLabel = current ? TYPE_LABELS[current.type] : null;
  const optionCount = options.length;
  const title =
    axis === "column"
      ? `Revisar columna: "${targetName}"`
      : `Revisar fila: "${targetName}"`;

  const keyHints = useMemo(() => {
    if (isSearchList) {
      return [
        { keys: ["↑", "↓"], label: "Navegar" },
        { keys: ["Enter"], label: "Editar" },
        {
          keys: ["Esc"],
          label: searchQuery ? "Limpiar búsqueda" : "Volver a orden",
        },
        { keys: ["Ctrl+F"], label: "Buscar" },
      ];
    }

    if (!current) return [];

    if (isSearchEditor) {
      if (current.type === "checkbox") {
        return [
          { keys: ["Espacio"], label: "Alternar" },
          { keys: ["1", "t"], label: "Sí" },
          { keys: ["0", "f"], label: "No" },
          { keys: ["Enter", "Esc"], label: "Guardar y volver" },
          { keys: ["←", "→"], label: "Guardar y mover" },
        ];
      }
      if (current.type === "select") {
        return [
          { keys: ["1..N"], label: "Elegir por número" },
          { keys: ["A-Z"], label: "Filtrar" },
          { keys: ["↑", "↓"], label: "Resaltar" },
          { keys: ["Enter"], label: "Elegir y volver" },
          { keys: ["←", "→"], label: "Mover en resultados" },
        ];
      }
      return [
        { keys: ["Enter", "Esc"], label: "Guardar y volver" },
        { keys: ["←", "→"], label: "Guardar y mover" },
      ];
    }

    const hints =
      current.type === "checkbox"
        ? [
            { keys: ["Espacio"], label: "Alternar" },
            { keys: ["1", "t"], label: "Sí" },
            { keys: ["0", "f"], label: "No" },
            { keys: ["←", "→"], label: "Guardar y mover" },
            { keys: ["Enter"], label: "Guardar y seguir" },
            { keys: ["Esc"], label: "Guardar y salir" },
          ]
        : current.type === "select"
          ? [
              { keys: ["1..N", "Enter"], label: "Elegir por número" },
              { keys: ["A-Z"], label: "Filtrar" },
              { keys: ["↑", "↓"], label: "Resaltar" },
              { keys: ["Enter"], label: "Elegir y seguir" },
              {
                keys: ["Esc"],
                label: filter || numberBuffer ? "Limpiar filtro" : "Guardar y salir",
              },
            ]
          : [
              { keys: ["←", "→"], label: "Guardar y mover" },
              { keys: ["Enter"], label: "Guardar y seguir" },
              { keys: ["Ctrl+←/→"], label: "Mover cursor" },
              { keys: ["Esc"], label: "Guardar y salir" },
            ];

    if (isColumnAxis) {
      hints.push({ keys: ["Ctrl+F"], label: "Buscar" });
    }
    return hints;
  }, [
    current,
    filter,
    numberBuffer,
    isSearchList,
    isSearchEditor,
    isColumnAxis,
    searchQuery,
  ]);

  const inputType =
    current?.type === "int"
      ? "number"
      : current?.type === "float"
        ? "number"
        : current?.type === "date"
          ? "date"
          : "text";

  const renderEditor = () => {
    if (!current) return null;

    if (current.type === "checkbox") {
      return (
        <div
          ref={checkboxRef}
          role="checkbox"
          aria-checked={Boolean(draft)}
          aria-label={`${current.columnName}: ${draft ? "sí" : "no"}`}
          tabIndex={0}
          onClick={() => {
            if (savingRef.current) return;
            clearSaveError();
            setDraft((previous) => !previous);
          }}
          className="flex cursor-pointer items-center gap-4 rounded-lg border-2 border-input bg-background px-6 py-8 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Checkbox
            checked={Boolean(draft)}
            tabIndex={-1}
            aria-hidden="true"
            className="pointer-events-none h-8 w-8 [&_svg]:h-6 [&_svg]:w-6"
          />
          <span className="text-3xl font-semibold">
            {draft ? "Sí" : "No"}
          </span>
        </div>
      );
    }

    if (current.type === "select") {
      return (
        <div className="space-y-4">
          <div className="flex min-h-14 items-center gap-3">
            <Input
              ref={inputRef}
              type="text"
              value={filter}
              onChange={(event) => {
                setFilter(event.target.value);
                setNumberBuffer("");
                setHighlighted(0);
                setSelectError(null);
                clearSaveError();
              }}
              placeholder="Escriba para filtrar o use el número de la opción"
              aria-label={`Filtrar opciones de ${current.columnName}`}
              aria-controls="review-mode-options"
              aria-activedescendant={
                selectEntries[highlighted]
                  ? `review-option-${selectEntries[highlighted].key}`
                  : undefined
              }
              autoComplete="off"
              className="h-14 text-xl md:text-xl"
            />
            {numberBuffer && (
              <span className="shrink-0 rounded bg-muted px-2 py-0.5 font-mono text-base">
                #{numberBuffer}
              </span>
            )}
          </div>

          <ul
            id="review-mode-options"
            role="listbox"
            aria-label={`Opciones de ${current.columnName}`}
            aria-activedescendant={
              selectEntries[highlighted]
                ? `review-option-${selectEntries[highlighted].key}`
                : undefined
            }
            className="max-h-[45vh] space-y-1 overflow-y-auto"
          >
            {selectEntries.map((entry, entryIndex) => (
              <li
                key={entry.key}
                id={`review-option-${entry.key}`}
                role="option"
                aria-selected={entryIndex === highlighted}
                ref={(element) => {
                  if (entryIndex === highlighted) {
                    highlightedOptionRef.current = element;
                  }
                }}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  if (isSearchEditor) {
                    void exitSearchEditor("list", { value: entry.value });
                    return;
                  }
                  void commitAndAdvance(entry.value, 1);
                }}
                className={cn(
                  "flex cursor-pointer items-center gap-4 rounded-md px-4 py-3 text-lg transition-colors",
                  entryIndex === highlighted
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-muted/60"
                )}
              >
                <span className="w-10 shrink-0 text-right font-mono tabular-nums text-muted-foreground">
                  {entry.number ?? "—"}
                </span>
                <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                {entry.isCurrent && (
                  <span className="shrink-0 rounded bg-primary/10 px-2 py-0.5 text-xs text-primary">
                    Actual
                  </span>
                )}
              </li>
            ))}
          </ul>

          {selectError && (
            <p className="text-sm font-medium text-destructive" role="alert">
              {selectError}
            </p>
          )}
          {hasNoMatches && (
            <p className="text-sm font-medium text-destructive">Sin coincidencias</p>
          )}
          {options.length === 0 && (
            <p className="text-sm text-muted-foreground">
              La columna no tiene opciones configuradas.
            </p>
          )}
        </div>
      );
    }

    return (
      <Input
        ref={inputRef}
        type={inputType}
        inputMode={
          current.type === "int"
            ? "numeric"
            : current.type === "float"
              ? "decimal"
              : undefined
        }
        step={current.type === "float" ? "0.01" : undefined}
        value={draft === null ? "" : String(draft)}
        onChange={(event) => {
          setDraft(event.target.value);
          clearSaveError();
        }}
        onFocus={(event) => {
          try {
            event.currentTarget.select();
          } catch {
            // Los tipos nativos number/date no admiten selección programática
          }
        }}
        readOnly={saving}
        aria-label={current.columnName}
        className="h-16 text-2xl"
      />
    );
  };

  const renderSearchView = () => (
    <div className="w-full space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            type="text"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={searchResults.length > 0}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Buscar por nombre de fila o valor…"
            aria-label="Buscar registros"
            aria-controls="review-search-results"
            aria-activedescendant={
              searchResults[searchHighlighted]
                ? `review-search-option-${searchResults[searchHighlighted].item.rowId}`
                : undefined
            }
            autoComplete="off"
            className="h-12 pl-9 text-base md:text-base"
          />
        </div>
        <span
          aria-live="polite"
          className="text-sm tabular-nums text-muted-foreground"
        >
          {searchResults.length} de {visibleItems.length}
        </span>
      </div>

      {searchResults.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-md border border-dashed px-4 py-10 text-center">
          <Search className="h-6 w-6 text-muted-foreground" />
          <p className="text-base font-medium">Sin coincidencias</p>
          <p className="text-sm text-muted-foreground">
            Prueba con otro nombre de fila o valor.
          </p>
        </div>
      ) : (
        <ul
          id="review-search-results"
          role="listbox"
          aria-label="Resultados de búsqueda"
          className="max-h-[50vh] space-y-1 overflow-y-auto"
        >
          {searchResults.map((result, position) => (
            <li
              key={result.item.rowId}
              id={`review-search-option-${result.item.rowId}`}
              role="option"
              aria-selected={position === searchHighlighted}
              ref={(element) => {
                if (position === searchHighlighted) {
                  highlightedResultRef.current = element;
                }
              }}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => void openSearchResult(position)}
              className={cn(
                "flex cursor-pointer items-center justify-between gap-4 rounded-md px-4 py-3 text-lg transition-colors",
                position === searchHighlighted
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-muted/60"
              )}
            >
              <span className="min-w-0 flex-1 truncate">
                {result.item.rowName}
              </span>
              <span
                className={cn(
                  "shrink-0 truncate text-sm",
                  position === searchHighlighted
                    ? "text-accent-foreground/80"
                    : "text-muted-foreground"
                )}
              >
                {formatReviewValue(result.item.type, result.item.value)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const renderSortBar = () => (
    <div
      ref={sortBarRef}
      className="flex w-full flex-wrap items-end gap-3"
      role="group"
      aria-label="Orden de los registros"
    >
      <div className="min-w-[12rem] flex-1 space-y-1">
        <Label htmlFor="review-sort-key" className="text-xs text-muted-foreground">
          Ordenar por
        </Label>
        <Select
          value={sortKey}
          onValueChange={(value) => void changeSort(value, sortDirection)}
          disabled={saving || sortLoading}
        >
          <SelectTrigger id="review-sort-key" aria-label="Ordenar por">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="original">Orden original</SelectItem>
            <SelectItem value="row-name">Nombre de fila</SelectItem>
            {columns.map((column) => (
              <SelectItem key={column.id} value={column.id}>
                {column.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button
        type="button"
        variant="outline"
        onClick={toggleSortDirection}
        disabled={sortKey === "original" || saving || sortLoading}
        title={
          sortDirection === "asc"
            ? "Orden ascendente: pulsa para descendente"
            : "Orden descendente: pulsa para ascendente"
        }
        aria-label={`Dirección del orden: ${
          sortDirection === "asc" ? "ascendente" : "descendente"
        }`}
      >
        {sortDirection === "asc" ? (
          <ArrowUpAZ className="h-4 w-4" />
        ) : (
          <ArrowDownAZ className="h-4 w-4" />
        )}
        {sortDirection === "asc" ? "Ascendente" : "Descendente"}
      </Button>

      <Button
        type="button"
        variant="outline"
        onClick={() => void reorder()}
        disabled={saving || sortLoading}
        title="Recalcular el orden con los valores actuales"
        aria-label="Reordenar con los valores actuales"
      >
        {sortLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <RefreshCw className="h-4 w-4" />
        )}
        Reordenar
      </Button>
    </div>
  );

  const content = () => {
    if (isLoading) {
      return (
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p>Cargando registros…</p>
        </div>
      );
    }

    if (loadError) {
      return (
        <div className="flex flex-col items-center gap-4 text-center" role="alert">
          <AlertCircle className="h-10 w-10 text-destructive" />
          <p className="text-lg font-medium">{loadError}</p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setReloadToken((token) => token + 1)}
            >
              Reintentar
            </Button>
            <Button variant="ghost" onClick={onClose}>
              Cerrar
            </Button>
          </div>
        </div>
      );
    }

    if (completed) {
      return (
        <div className="flex flex-col items-center gap-4 text-center">
          <CheckCircle2 className="h-12 w-12 text-primary" />
          <p className="text-2xl font-semibold">Revisión completada</p>
          <p className="text-muted-foreground">
            Se recorrieron {visibleItems.length}{" "}
            {visibleItems.length === 1 ? "registro" : "registros"}.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={restart}>
              Revisar de nuevo
            </Button>
            <Button onClick={onClose}>Cerrar</Button>
          </div>
        </div>
      );
    }

    if (visibleItems.length === 0) {
      return (
        <div className="flex flex-col items-center gap-4 text-center">
          <AlertCircle className="h-10 w-10 text-muted-foreground" />
          <p className="text-lg font-medium">No hay registros para revisar.</p>
          <Button variant="outline" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      );
    }

    if (isSearchList) {
      return renderSearchView();
    }

    return (
      <div className="w-full space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            {axis === "column" ? "Fila" : "Columna"}:{" "}
            <span className="font-medium text-foreground">
              {axis === "column" ? current?.rowName : current?.columnName}
            </span>
          </p>
          {isSearchEditor && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void exitSearchEditor("list")}
              disabled={saving}
            >
              <MoveLeft className="h-4 w-4" />
              Volver a resultados
            </Button>
          )}
        </div>

        <div className="space-y-3">
          {renderEditor()}
          {saving && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Guardando…
            </p>
          )}
          {saveError && !saving && (
            <div
              role="alert"
              className="flex flex-col gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <p className="flex items-start gap-2 text-sm font-medium text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{saveError}</span>
              </p>
              <div className="flex shrink-0 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleRetry()}
                >
                  Reintentar
                </Button>
                <Button variant="ghost" size="sm" onClick={onClose}>
                  Salir sin guardar
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const showSortBar =
    isColumnAxis &&
    viewMode === "order" &&
    !isLoading &&
    !loadError &&
    !completed &&
    visibleItems.length > 0;

  const showNavigation =
    !isLoading &&
    !loadError &&
    !completed &&
    visibleItems.length > 0 &&
    !(isColumnAxis && viewMode === "search");

  const subtitle = [
    typeLabel ? `Tipo: ${typeLabel}` : "Cargando…",
    typeLabel === TYPE_LABELS.select && optionCount > 0
      ? `${optionCount} ${optionCount === 1 ? "opción" : "opciones"}`
      : null,
    isColumnAxis && viewMode === "order" && !isLoading && !loadError
      ? `Ordenado por: ${sortKeyLabel}${
          sortKey === "original"
            ? ""
            : ` · ${sortDirection === "asc" ? "Ascendente" : "Descendente"}`
        }`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return createPortal(
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="review-mode-title"
      aria-busy={saving || sortLoading}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="fixed inset-0 z-50 flex flex-col bg-background outline-none"
    >
      <header className="flex items-start justify-between gap-4 border-b px-4 py-4 sm:px-6">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          {isColumnAxis ? (
            <div
              className="flex shrink-0 items-center gap-1"
              role="group"
              aria-label="Modo de revisión"
            >
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-pressed={viewMode === "order"}
                aria-label="Modo orden"
                title="Modo orden"
                onClick={() => void switchViewMode("order")}
                disabled={saving || sortLoading}
                className={cn(
                  "[&_svg]:size-5",
                  viewMode === "order" &&
                    "bg-accent text-accent-foreground hover:bg-accent"
                )}
              >
                <ArrowDownAZ className="h-5 w-5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-pressed={viewMode === "search"}
                aria-label="Modo búsqueda"
                title="Modo búsqueda"
                onClick={() => void switchViewMode("search")}
                disabled={saving || sortLoading}
                className={cn(
                  "[&_svg]:size-5",
                  viewMode === "search" &&
                    "bg-accent text-accent-foreground hover:bg-accent"
                )}
              >
                <Search className="h-5 w-5" />
              </Button>
            </div>
          ) : (
            <ScanLine className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          )}

          <div className="min-w-0">
            <h2
              id="review-mode-title"
              className="truncate text-lg font-semibold sm:text-xl"
            >
              {title}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <span
            aria-live="polite"
            className="text-sm tabular-nums text-muted-foreground"
          >
            {visibleItems.length > 0 && !isLoading
              ? `${Math.min(index + 1, visibleItems.length)} / ${visibleItems.length}`
              : ""}
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => void handleClose()}
            disabled={saving}
            aria-label="Cerrar modo revisión"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-8 sm:px-6">
        <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center gap-6">
          {showSortBar && renderSortBar()}
          {content()}
        </div>
      </div>

      <footer className="border-t px-4 py-3 sm:px-6">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
            {keyHints.map((hint) => (
              <span
                key={`${hint.label}-${hint.keys.join("-")}`}
                className="flex items-center gap-1"
              >
                {hint.keys.map((key) => (
                  <kbd
                    key={key}
                    className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground"
                  >
                    {key}
                  </kbd>
                ))}
                <span>{hint.label}</span>
              </span>
            ))}
          </div>

          {showNavigation && (
            <div className="flex shrink-0 items-center gap-2">
              <Button
                variant="outline"
                onClick={() => void navigate(-1)}
                disabled={saving || index === 0}
              >
                <MoveLeft className="h-4 w-4" />
                Anterior
              </Button>
              <Button onClick={() => void navigate(1)} disabled={saving}>
                {index === visibleItems.length - 1 ? "Terminar" : "Siguiente"}
                <MoveRight className="h-4 w-4" />
              </Button>
              <Button variant="ghost" onClick={() => void handleClose()} disabled={saving}>
                Cerrar
              </Button>
            </div>
          )}
        </div>
      </footer>
    </div>,
    document.body
  );
};
