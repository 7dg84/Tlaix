import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { normalizeRename, shouldSubmitRename } from "@/lib/rename";

interface InlineRenameProps {
  /** Texto visible actual. */
  value: string;
  /** Persiste el nombre ya normalizado. Debe relanzar el error si la API falla. */
  onRename: (name: string) => Promise<void>;
  /** Nombre del elemento con su valor, p. ej. "columna Total". */
  label: string;
  /** Longitud máxima permitida por el backend para este elemento. */
  maxLength?: number;
  className?: string;
  inputClassName?: string;
  disabled?: boolean;
  /** Si es `false`, el lápiz lo dibuja el padre (modo controlado de las tablas). */
  showButton?: boolean;
  /**
   * Elemento del disparador del lápiz. `"span"` evita anidar botones dentro de
   * la pestaña de Radix (que ya renderiza un `<button>`).
   */
  buttonElement?: "button" | "span";
  /** Modo controlado: el padre decide cuándo se edita. */
  editing?: boolean;
  onEditingChange?: (editing: boolean) => void;
}

/**
 * Sustituye un texto por un input en el mismo lugar.
 * - Enter o blur guardan solo si el nombre cambió y no está vacío.
 * - Escape cancela sin llamar a la API.
 * - Si la API falla, la edición sigue abierta y el input recupera el foco.
 */
export const InlineRename = ({
  value,
  onRename,
  label,
  maxLength,
  className,
  inputClassName,
  disabled = false,
  showButton = true,
  buttonElement = "button",
  editing,
  onEditingChange,
}: InlineRenameProps) => {
  // `editing` presente = modo controlado (tablas); ausente = estado interno.
  const isControlled = editing !== undefined;
  const [internalEditing, setInternalEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  const inputRef = useRef<HTMLInputElement | null>(null);
  // Refs para evitar envíos duplicados y el guardado posterior a Escape
  const savingRef = useRef(false);
  const skipBlurRef = useRef(false);
  // Último valor recibido, para inicializar el borrador solo al entrar en edición
  const valueRef = useRef(value);

  // Mantiene el último valor sin reiniciar el efecto que enfoca el input
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const isEditing = isControlled ? !!editing : internalEditing;

  const setEditing = useCallback(
    (next: boolean) => {
      if (isControlled) {
        onEditingChange?.(next);
      } else {
        setInternalEditing(next);
      }
    },
    [isControlled, onEditingChange]
  );

  // Al entrar en edición se copia el valor actual y se selecciona para escribir encima
  useEffect(() => {
    if (!isEditing) return;

    skipBlurRef.current = false;
    setDraft(valueRef.current);

    const input = inputRef.current;
    input?.focus();
    input?.select();
  }, [isEditing]);

  const commit = useCallback(async () => {
    if (savingRef.current) return;

    if (!shouldSubmitRename(value, draft)) {
      // Vacío o sin cambios: se restaura el nombre original sin tocar la API
      skipBlurRef.current = true;
      setEditing(false);
      return;
    }

    savingRef.current = true;
    setSaving(true);

    try {
      await onRename(normalizeRename(draft));
      // Evita que un blur de desmontaje repita la petición
      skipBlurRef.current = true;
      setEditing(false);
    } catch {
      // El padre ya mostró el error: se mantiene la edición para corregir o reintentar
      inputRef.current?.focus();
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [draft, onRename, setEditing, value]);

  const beginEditing = () => {
    if (disabled) return;

    setDraft(value);
    setEditing(true);
  };

  const startEditing = (event: React.MouseEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    beginEditing();
  };

  // Soporte de teclado cuando el disparador no es un <button> nativo
  const handleTriggerKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Enter" && event.key !== " " && event.key !== "Spacebar") {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    beginEditing();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    // Evita que las flechas muevan el foco entre pestañas mientras se escribe
    event.stopPropagation();

    if (event.key === "Enter") {
      event.preventDefault();
      void commit();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      if (savingRef.current) return;

      skipBlurRef.current = true;
      setDraft(value);
      setEditing(false);
    }
  };

  const handleBlur = () => {
    // Escape ya cerró la edición: el blur posterior no debe guardar
    if (skipBlurRef.current) {
      skipBlurRef.current = false;
      return;
    }
    void commit();
  };

  const triggerClassName =
    "inline-flex shrink-0 items-center justify-center rounded-full p-0.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <span
      className={cn("inline-flex min-w-0 items-center gap-1", className)}
      // Dentro de una pestaña, el foco del lápiz o del input no debe activarla
      onFocus={(event) => event.stopPropagation()}
    >
      {isEditing ? (
        <Input
          ref={inputRef}
          value={draft}
          maxLength={maxLength}
          readOnly={saving}
          aria-label={`Nuevo nombre de ${label}`}
          aria-busy={saving}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          onClick={(event) => {
            // No navegar dentro del <Link> de la tarjeta
            event.preventDefault();
            event.stopPropagation();
          }}
          onMouseDown={(event) => event.stopPropagation()}
          className={cn("h-7 px-2 py-0 text-sm", inputClassName)}
        />
      ) : (
        <span>{value}</span>
      )}

      {showButton && !isEditing && (
        buttonElement === "span" ? (
          <span
            role="button"
            tabIndex={disabled ? -1 : 0}
            aria-disabled={disabled}
            onClick={startEditing}
            onMouseDown={(event) => event.stopPropagation()}
            onKeyDown={handleTriggerKeyDown}
            className={cn(triggerClassName, disabled && "cursor-not-allowed opacity-50")}
            title={`Renombrar ${label}`}
            aria-label={`Renombrar ${label}`}
          >
            <Pencil className="h-3.5 w-3.5" />
          </span>
        ) : (
          <button
            type="button"
            disabled={disabled}
            onClick={startEditing}
            onMouseDown={(event) => event.stopPropagation()}
            className={triggerClassName}
            title={`Renombrar ${label}`}
            aria-label={`Renombrar ${label}`}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )
      )}
    </span>
  );
};
