import React, { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ColumnDefinition } from "@/components/AddColumnDialog";

interface CellEditorProps {
  rowId: string;
  column: ColumnDefinition;
  value: any;
  onSave: (rowId: string, columnId: string, value: any) => Promise<void> | void;
}

export const CellEditor: React.FC<CellEditorProps> = ({
  rowId,
  column,
  value,
  onSave,
}) => {
  const [localValue, setLocalValue] = useState<any>(
    value ?? (column.type === "checkbox" ? false : "")
  );
  const lastSavedValueRef = useRef<any>(value);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const isPendingRef = useRef<boolean>(false);

  // Sincronizar valor local cuando cambian las props externas si no hay edición pendiente
  useEffect(() => {
    if (!isPendingRef.current) {
      setLocalValue(value ?? (column.type === "checkbox" ? false : ""));
      lastSavedValueRef.current = value;
    }
  }, [value, column.type]);

  // Limpiar timer pendiente al desmontar
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const triggerSave = (valToSave: any) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    let parsed = valToSave;
    if (column.type === "checkbox") {
      parsed = Boolean(valToSave);
    } else if (column.type === "int") {
      if (valToSave === "" || valToSave === null || valToSave === undefined) {
        parsed = null;
      } else {
        const num = parseInt(valToSave, 10);
        parsed = isNaN(num) ? null : num;
      }
    } else if (column.type === "float") {
      if (valToSave === "" || valToSave === null || valToSave === undefined) {
        parsed = null;
      } else {
        const num = parseFloat(valToSave);
        parsed = isNaN(num) ? null : num;
      }
    } else if (column.type === "text") {
      parsed = valToSave === null || valToSave === undefined ? "" : String(valToSave);
    }

    // Evitar llamadas innecesarias a la API si el valor no cambió respecto al guardado
    if (parsed === lastSavedValueRef.current) {
      isPendingRef.current = false;
      return;
    }

    lastSavedValueRef.current = parsed;
    isPendingRef.current = false;
    onSave(rowId, column.id, parsed);
  };

  const handleChange = (newVal: any) => {
    setLocalValue(newVal);
    isPendingRef.current = true;

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    // Guardar automáticamente 1 segundo (1000ms) después de la última modificación
    timerRef.current = setTimeout(() => {
      triggerSave(newVal);
    }, 1000);
  };

  const handleBlur = () => {
    // Cuando el elemento deja de estar seleccionado, guardar inmediatamente si hay cambios
    if (isPendingRef.current || localValue !== lastSavedValueRef.current) {
      triggerSave(localValue);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      // Disparar blur para guardar de inmediato
      e.currentTarget.blur();
    }
  };

  switch (column.type) {
    case "checkbox":
      return (
        <Checkbox
          checked={Boolean(localValue)}
          onCheckedChange={(checked) => {
            const nextVal = Boolean(checked);
            handleChange(nextVal);
          }}
          onBlur={handleBlur}
        />
      );

    case "int":
    case "float":
      return (
        <Input
          type="number"
          step={column.type === "float" ? "0.01" : "1"}
          value={localValue === null || localValue === undefined ? "" : localValue}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className="max-w-[150px]"
        />
      );

    case "select":
      return (
        <Select
          value={localValue ? String(localValue) : ""}
          onValueChange={(val) => {
            setLocalValue(val);
            triggerSave(val);
          }}
        >
          <SelectTrigger className="max-w-[200px]" onBlur={handleBlur}>
            <SelectValue placeholder="Seleccionar" />
          </SelectTrigger>
          <SelectContent>
            {column.options?.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );

    case "date":
      return (
        <Input
          type="date"
          value={localValue || ""}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className="max-w-[160px]"
        />
      );

    case "text":
    default:
      return (
        <Input
          type="text"
          value={localValue === null || localValue === undefined ? "" : localValue}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className="max-w-[250px]"
        />
      );
  }
};
