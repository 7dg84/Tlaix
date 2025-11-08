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

export interface TabDefinition {
  id: string;
  name: string;
  label: string;
}

interface AddTabDialogProps {
  onAddTab: (tab: TabDefinition) => void;
}

export const AddTabDialog = ({ onAddTab }: AddTabDialogProps) => {
  const [open, setOpen] = useState(false);
  const [tabName, setTabName] = useState("");

  const handleSubmit = () => {
    if (!tabName.trim()) {
      toast.error("El nombre de la pestaña es requerido");
      return;
    }

    const tab: TabDefinition = {
      id: `tab-${Date.now()}`,
      name: tabName.trim().toLowerCase().replace(/\s+/g, "-"),
      label: tabName.trim(),
    };

    onAddTab(tab);
    setOpen(false);
    setTabName("");
    toast.success("Pestaña creada correctamente");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="w-4 h-4 mr-2" />
          Nueva Pestaña
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Crear Nueva Pestaña</DialogTitle>
          <DialogDescription>
            Ingresa el nombre de la nueva pestaña
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="tab-name">Nombre de la Pestaña *</Label>
            <Input
              id="tab-name"
              value={tabName}
              onChange={(e) => setTabName(e.target.value)}
              placeholder="Ej: Pendientes, Urgentes, Archivados"
              onKeyPress={(e) => e.key === "Enter" && handleSubmit()}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit}>Crear Pestaña</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
