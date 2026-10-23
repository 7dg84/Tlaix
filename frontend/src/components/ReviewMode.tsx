import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  MoveLeft,
  MoveRight,
  ScanLine,
  X,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { reviewService } from "@/api";
import type { ColumnType } from "@/components/AddColumnDialog";
import {
  buildColumnReviewItems,
  buildRowReviewItems,
  draftToValue,
  filterOptions,
  isSameCellValue,
  parseOptionNumber,
  valueToDraft,
} from "@/lib/review";
import type { ReviewAxis, ReviewDraftValue, ReviewItem } from "@/lib/review";

interface ReviewModeProps {
  axis: ReviewAxis;
  tableId: string;
  targetId: string;
  targetLabel: string;
  /** Pestaña activa: solo aplica al revisar una fila. */
  tabId?: string;
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

export const ReviewMode = ({
  axis,
  tableId,
  targetId,
  targetLabel,
  tabId,
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

  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const checkboxRef = useRef<HTMLDivElement | null>(null);
  const highlightedOptionRef = useRef<HTMLLIElement | null>(null);
  // Ref sincronizada: bloquea el avance en cuanto arranca el PUT, sin esperar al render
  const savingRef = useRef(false);
  // Código HTTP del último fallo de guardado (401 cierra el overlay)
  const saveErrorStatusRef = useRef<number | null>(null);
  // Valor y destino del guardado fallido, para reintentarlo desde el panel de error
  const failedSaveRef = useRef<{
    value: unknown;
    advance: number | "close";
  } | null>(null);

  const current = items[index];
  const isSelect = current?.type === "select";
  const listOptions = useMemo(
    () => (Array.isArray(current?.options) ? current.options : []),
    [current]
  );
  const options = useMemo(
    () => (current?.type === "select" ? listOptions : []),
    [current, listOptions]
  );

  // ---------------------------------------------------------------- carga
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setIsLoading(true);
    setLoadError(null);
    setItems([]);
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
          setItems(buildRowReviewItems(response));
          setTargetName(response.target.name || targetLabel);
        } else {
          const response = await reviewService.getColumnCellValues(
            tableId,
            targetId,
            controller.signal
          );
          if (cancelled || controller.signal.aborted) return;
          setItems(buildColumnReviewItems(response));
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
  }, [index, items.length, current?.rowId, current?.columnId, current?.type]);

  // Foco automático en cada iteración: la lista filtra escribiendo (sin selección),
  // la casilla enfoca su contenedor y el resto selecciona el texto completo.
  useEffect(() => {
    if (isLoading || loadError || completed || !current) return;

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
    items.length,
    isLoading,
    loadError,
    completed,
    current?.rowId,
    current?.columnId,
    current?.type,
  ]);

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

  /**
   * Persiste el valor. `advance` describe el destino que se intentaba alcanzar,
   * para poder reintentar la acción completa desde el panel de error.
   */
  const commitValue = async (
    value: unknown,
    advance: number | "close" = 1
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
      setItems((previous) =>
        previous.map((item, itemIndex) =>
          itemIndex === index ? { ...item, value } : item
        )
      );
      setDraft(valueToDraft(current.type, value));
      clearSaveError();
      return true;
    } catch (error) {
      // El valor no se guardó: se revierte el editor y se ofrece reintentar o salir
      saveErrorStatusRef.current = errorStatus(error);
      failedSaveRef.current = { value, advance };
      setDraft(valueToDraft(current.type, current.value));
      setSaveError(describeSaveError(error));
      toast.error(describeSaveError(error));
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

  const goTo = (nextIndex: number) => {
    if (nextIndex >= items.length) {
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
    if (completed || !current) {
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
    // Sesión expirada: no tiene sentido quedarse bloqueado dentro del overlay
    if (saveErrorStatusRef.current === 401) {
      toast.error("Tu sesión expiró. Vuelve a iniciar sesión.");
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
    goTo(index + failed.advance);
  };

  const restart = () => {
    setCompleted(false);
    setIndex(0);
    const first = items[0];
    setDraft(first ? valueToDraft(first.type, first.value) : null);
    setFilter("");
    setNumberBuffer("");
    setHighlighted(0);
    setSelectError(null);
    clearSaveError();
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

  const handleCheckboxKey = async (event: ReactKeyboardEvent<HTMLDivElement>) => {
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
      await navigate(-1);
      return;
    }
    if (event.key === "ArrowRight" || event.key === "Enter") {
      event.preventDefault();
      await navigate(1);
    }
  };

  const handleSelectKey = async (event: ReactKeyboardEvent<HTMLDivElement>) => {
    // Shift+flechas: se deja la selección nativa del texto del filtro
    if (
      event.shiftKey &&
      (event.key === "ArrowLeft" || event.key === "ArrowRight")
    ) {
      return;
    }

    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      await navigate(event.key === "ArrowLeft" ? -1 : 1);
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
        await commitAndAdvance(target.value, 1);
        return;
      }

      if (hasNoMatches) return;
      const entry = selectEntries[Math.min(highlighted, selectEntries.length - 1)];
      if (!entry) return;
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
    if (event.ctrlKey || event.metaKey) return;

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
    if (!current) return [];
    if (current.type === "checkbox") {
      return [
        { keys: ["Espacio"], label: "Alternar" },
        { keys: ["1", "t"], label: "Sí" },
        { keys: ["0", "f"], label: "No" },
        { keys: ["←", "→"], label: "Guardar y mover" },
        { keys: ["Enter"], label: "Guardar y seguir" },
        { keys: ["Esc"], label: "Guardar y salir" },
      ];
    }
    if (current.type === "select") {
      return [
        { keys: ["1..N", "Enter"], label: "Elegir por número" },
        { keys: ["A-Z"], label: "Filtrar" },
        { keys: ["↑", "↓"], label: "Resaltar" },
        { keys: ["Enter"], label: "Elegir y seguir" },
        {
          keys: ["Esc"],
          label: filter || numberBuffer ? "Limpiar filtro" : "Guardar y salir",
        },
      ];
    }
    return [
      { keys: ["←", "→"], label: "Guardar y mover" },
      { keys: ["Enter"], label: "Guardar y seguir" },
      { keys: ["Ctrl+←/→"], label: "Mover cursor" },
      { keys: ["Esc"], label: "Guardar y salir" },
    ];
  }, [current, filter, numberBuffer]);

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
                onClick={() => void commitAndAdvance(entry.value, 1)}
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
            Se recorrieron {items.length} {items.length === 1 ? "registro" : "registros"}.
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

    if (items.length === 0) {
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

    return (
      <div className="w-full space-y-8">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">
            {axis === "column" ? "Fila" : "Columna"}:{" "}
            <span className="font-medium text-foreground">
              {axis === "column" ? current?.rowName : current?.columnName}
            </span>
          </p>
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

  const showNavigation = !isLoading && !loadError && !completed && items.length > 0;

  return createPortal(
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="review-mode-title"
      aria-busy={saving}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="fixed inset-0 z-50 flex flex-col bg-background outline-none"
    >
      <header className="flex items-start justify-between gap-4 border-b px-4 py-4 sm:px-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <ScanLine className="h-5 w-5 shrink-0 text-primary" />
            <h2
              id="review-mode-title"
              className="truncate text-lg font-semibold sm:text-xl"
            >
              {title}
            </h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {typeLabel ? `Tipo: ${typeLabel}` : "Cargando…"}
            {typeLabel === TYPE_LABELS.select && optionCount > 0
              ? ` · ${optionCount} ${optionCount === 1 ? "opción" : "opciones"}`
              : ""}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <span
            aria-live="polite"
            className="text-sm tabular-nums text-muted-foreground"
          >
            {items.length > 0 && !isLoading
              ? `${Math.min(index + 1, items.length)} / ${items.length}`
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
        <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center">
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
                {index === items.length - 1 ? "Terminar" : "Siguiente"}
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
