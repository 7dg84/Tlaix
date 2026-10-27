import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CalendarDays, Plus, X } from "lucide-react";
import { toast } from "react-hot-toast";
import {
  DateNameMode,
  describeDateNameMode,
  formatDateName,
  nextDateNameMode,
} from "@/lib/date-name";

export type ColumnType = "text" | "checkbox" | "int" | "float" | "select" | "date";

export interface ColumnDefinition {
  id: string;
  name: string;
  type: ColumnType;
  options?: string[];
}

interface AddColumnDialogProps {
  /** Crea la columna; devuelve `true` solo si la API la guardó. */
  onAddColumn: (column: ColumnDefinition) => Promise<boolean> | boolean;
  /** Nombres ya existentes en la pestaña, para avisar de duplicados. */
  existingNames?: string[];
}

export const AddColumnDialog = ({
  onAddColumn,
  existingNames = [],
}: AddColumnDialogProps) => {
  const [open, setOpen] = useState(false);
  const [columnName, setColumnName] = useState("");
  const [columnType, setColumnType] = useState<ColumnType>("text");
  const [selectOptions, setSelectOptions] = useState<string[]>([]);
  const [newOption, setNewOption] = useState("");
  // Modo actual del ciclo del icono de calendario
  const [dateNameMode, setDateNameMode] = useState<DateNameMode>("full");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const nameInputRef = useRef<HTMLInputElement>(null);

  // Nombres ya usados en la pestaña: el backend tiene unique_together (tab, name)
  const trimmedName = columnName.trim();
  const isDuplicate =
    trimmedName !== "" && existingNames.some((name) => name === trimmedName);

  const resetForm = () => {
    setColumnName("");
    setColumnType("text");
    setSelectOptions([]);
    setNewOption("");
    setDateNameMode("full");
  };

  const handleOpenChange = (nextOpen: boolean) => {
    // El ciclo siempre arranca por la fecha completa al abrir o cerrar el diálogo
    setDateNameMode("full");
    setOpen(nextOpen);
  };

  const handleDateName = () => {
    const nextName = formatDateName(dateNameMode, new Date());
    setColumnName(nextName);
    setDateNameMode(nextDateNameMode(dateNameMode));

    // Devolver el foco al campo con el caret al final, tras el repintado
    requestAnimationFrame(() => {
      const input = nameInputRef.current;
      if (!input) return;
      input.focus();
      input.setSelectionRange(nextName.length, nextName.length);
    });
  };

  const handleAddOption = () => {
    if (!newOption.trim()) {
      toast.error("La opción no puede estar vacía");
      return;
    }
    setSelectOptions([...selectOptions, newOption.trim()]);
    setNewOption("");
  };

  const handleRemoveOption = (index: number) => {
    setSelectOptions(selectOptions.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;

    if (!columnName.trim()) {
      toast.error("El nombre de la columna es requerido");
      return;
    }

    if (columnType === "select" && selectOptions.length === 0) {
      toast.error("Debe agregar al menos una opción para el select");
      return;
    }

    const column: ColumnDefinition = {
      id: Date.now().toString(),
      name: columnName.trim(),
      type: columnType,
      options: columnType === "select" ? selectOptions : undefined,
    };

    setIsSubmitting(true);
    try {
      const created = await onAddColumn(column);
      // Si la API falla, el diálogo sigue abierto para reintentar sin perder datos
      if (!created) return;
      setOpen(false);
      resetForm();
    } catch {
      // El padre ya informa del error; conservamos el formulario
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Plus className="w-4 h-4 mr-2" />
          Agregar Columna
        </Button>
      </DialogTrigger>
      <DialogContent
        className="sm:max-w-[500px]"
        onOpenAutoFocus={(event) => {
          // El botón del calendario va antes que el input: al abrir enfocamos el nombre
          event.preventDefault();
          nameInputRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Agregar Nueva Columna</DialogTitle>
          <DialogDescription>
            Define el nombre y tipo de la nueva columna
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="column-name">Nombre de la Columna *</Label>
              <button
                type="button"
                onClick={handleDateName}
                title={describeDateNameMode(dateNameMode, new Date())}
                aria-label={describeDateNameMode(dateNameMode, new Date())}
                className="text-muted-foreground hover:text-foreground rounded-full p-1 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <CalendarDays className="w-4 h-4" />
              </button>
            </div>
            <Input
              id="column-name"
              ref={nameInputRef}
              value={columnName}
              onChange={(e) => {
                setColumnName(e.target.value);
                // Edición manual: el siguiente clic empieza por la fecha completa
                setDateNameMode("full");
              }}
              placeholder="Ej: Estado, Cantidad, Precio"
              maxLength={100}
              aria-describedby={isDuplicate ? "column-name-duplicate" : undefined}
            />
            {isDuplicate && (
              <p
                id="column-name-duplicate"
                role="status"
                className="text-xs text-amber-600"
              >
                Ya existe una columna llamada "{trimmedName}" en esta pestaña.
                Edita el nombre o elige otro valor.
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="column-type">Tipo de Columna *</Label>
            <Select value={columnType} onValueChange={(value) => setColumnType(value as ColumnType)}>
              <SelectTrigger id="column-type">
                <SelectValue placeholder="Selecciona un tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="text">Texto</SelectItem>
                <SelectItem value="checkbox">Checkbox</SelectItem>
                <SelectItem value="int">Número Entero</SelectItem>
                <SelectItem value="float">Número Decimal</SelectItem>
                <SelectItem value="select">Lista Desplegable</SelectItem>
                <SelectItem value="date">Fecha</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {columnType === "select" && (
            <div className="space-y-2">
              <Label>Opciones del Select</Label>
              <div className="flex gap-2">
                <Input
                  value={newOption}
                  onChange={(e) => setNewOption(e.target.value)}
                  placeholder="Nueva opción"
                  onKeyPress={(e) => e.key === "Enter" && handleAddOption()}
                />
                <Button type="button" onClick={handleAddOption} size="sm">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              {selectOptions.length > 0 && (
                <div className="space-y-2 mt-2">
                  {selectOptions.map((option, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between bg-muted p-2 rounded-md"
                    >
                      <span className="text-sm">{option}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveOption(index)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? "Agregando..." : "Agregar Columna"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
