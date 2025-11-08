import { useState } from "react";
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
import { Plus, X } from "lucide-react";
import { toast } from "sonner";

export type ColumnType = "text" | "checkbox" | "int" | "float" | "select";

export interface ColumnDefinition {
  id: string;
  name: string;
  type: ColumnType;
  options?: string[];
}

interface AddColumnDialogProps {
  onAddColumn: (column: ColumnDefinition) => void;
}

export const AddColumnDialog = ({ onAddColumn }: AddColumnDialogProps) => {
  const [open, setOpen] = useState(false);
  const [columnName, setColumnName] = useState("");
  const [columnType, setColumnType] = useState<ColumnType>("text");
  const [selectOptions, setSelectOptions] = useState<string[]>([]);
  const [newOption, setNewOption] = useState("");

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

  const handleSubmit = () => {
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

    onAddColumn(column);
    setOpen(false);
    setColumnName("");
    setColumnType("text");
    setSelectOptions([]);
    setNewOption("");
    toast.success("Columna agregada correctamente");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Plus className="w-4 h-4 mr-2" />
          Agregar Columna
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Agregar Nueva Columna</DialogTitle>
          <DialogDescription>
            Define el nombre y tipo de la nueva columna
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="column-name">Nombre de la Columna *</Label>
            <Input
              id="column-name"
              value={columnName}
              onChange={(e) => setColumnName(e.target.value)}
              placeholder="Ej: Estado, Cantidad, Precio"
            />
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
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit}>Agregar Columna</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
