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
import { Plus } from "lucide-react";
import { toast } from "sonner";

interface AddRowDialogProps {
  onAddRow: (name: string) => void;
}

export const AddRowDialog = ({ onAddRow }: AddRowDialogProps) => {
  const [open, setOpen] = useState(false);
  const [rowName, setRowName] = useState("");

  const handleSubmit = () => {
    if (!rowName.trim()) {
      toast.error("El nombre de la fila es requerido");
      return;
    }

    onAddRow(rowName.trim());
    setOpen(false);
    setRowName("");
    toast.success("Fila agregada correctamente");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          Agregar Fila
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Agregar Nueva Fila</DialogTitle>
          <DialogDescription>
            Ingresa el nombre de la nueva fila
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="row-name">Nombre *</Label>
            <Input
              id="row-name"
              value={rowName}
              onChange={(e) => setRowName(e.target.value)}
              placeholder="Ingrese el nombre"
              onKeyPress={(e) => e.key === "Enter" && handleSubmit()}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit}>Agregar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
