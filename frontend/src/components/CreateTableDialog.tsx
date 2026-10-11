import { useState } from "react";
import { Plus, Upload, Type, ChevronLeft, ChevronRight, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import Papa from "papaparse";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type RowImportMethod = "file" | "text" | "manual";

export interface Tab {
  id: string;
  name: string;
}

interface CreateTableDialogProps {
  onCreateTable: (data: {
    name: string;
    description: string;
    rows: string[];
    tabs: Tab[];
  }) => void;
}

export const CreateTableDialog = ({ onCreateTable }: CreateTableDialogProps) => {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [tableName, setTableName] = useState("");
  const [tableDescription, setTableDescription] = useState("");
  const [importMethod, setImportMethod] = useState<RowImportMethod>("text");
  const [rows, setRows] = useState<string[]>([]);
  const [textInput, setTextInput] = useState("");
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [showAddRowModal, setShowAddRowModal] = useState(false);
  const [newRowName, setNewRowName] = useState("");
  const [showAddTabModal, setShowAddTabModal] = useState(false);
  const [newTabName, setNewTabName] = useState("");

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      complete: (results) => {
        const rowNames = results.data
          .flat()
          .filter((item) => item && String(item).trim() !== "");
        setRows(rowNames as string[]);
      },
      header: false,
    });
  };

  const handleTextImport = () => {
    const rowNames = textInput
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "");
    setRows(rowNames);
  };

  const handleAddRow = () => {
    if (newRowName.trim()) {
      setRows([...rows, newRowName.trim()]);
      setNewRowName("");
      setShowAddRowModal(false);
    }
  };

  const handleRemoveRow = (index: number) => {
    setRows(rows.filter((_, i) => i !== index));
  };

  const handleAddTab = () => {
    if (newTabName.trim()) {
      const newTab: Tab = {
        id: Date.now().toString(),
        name: newTabName.trim(),
      };
      setTabs([...tabs, newTab]);
      setNewTabName("");
      setShowAddTabModal(false);
    }
  };

  const handleRemoveTab = (tabId: string) => {
    setTabs(tabs.filter((t) => t.id !== tabId));
  };

  const handleCreate = () => {
    onCreateTable({
      name: tableName,
      description: tableDescription,
      rows,
      tabs,
    });
    setOpen(false);
    resetForm();
  };

  const resetForm = () => {
    setStep(0);
    setTableName("");
    setTableDescription("");
    setRows([]);
    setTextInput("");
    setTabs([]);
  };

  const canProceedStep0 = tableName.trim() !== "";
  const canProceedStep1 = rows.length > 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Card className="group hover:shadow-[var(--shadow-hover)] transition-all duration-300 cursor-pointer border-dashed border-2 border-border/50 hover:border-primary/50">
          <div className="h-2 bg-gradient-to-r from-cyan-500 to-blue-600" />
          <CardContent className="flex flex-col items-center justify-center min-h-[200px] p-6">
            <div className="p-4 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 text-white mb-4 group-hover:scale-110 transition-transform">
              <Plus className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-semibold mb-2 group-hover:text-primary transition-colors">
              Crear Nueva Tabla
            </h3>
            <p className="text-sm text-muted-foreground text-center">
              Haz clic para crear una tabla personalizada
            </p>
          </CardContent>
        </Card>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === 0 && "Información de la Tabla"}
            {step === 1 && "Agregar Filas"}
            {step === 2 && "Vista Previa y Pestañas"}
          </DialogTitle>
          <DialogDescription>
            {step === 0 && "Define el nombre y descripción de tu tabla"}
            {step === 1 && "Elige cómo importar las filas de tu tabla"}
            {step === 2 && "Revisa las filas y configura las pestañas"}
          </DialogDescription>
        </DialogHeader>

        {/* Step 0: Basic Info */}
        {step === 0 && (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="table-name">Nombre de la Tabla</Label>
              <Input
                id="table-name"
                value={tableName}
                onChange={(e) => setTableName(e.target.value)}
                placeholder="Ej: Inventario de Productos"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="table-description">Descripción</Label>
              <Textarea
                id="table-description"
                value={tableDescription}
                onChange={(e) => setTableDescription(e.target.value)}
                placeholder="Describe para qué usarás esta tabla"
                rows={3}
              />
            </div>
          </div>
        )}

        {/* Step 1: Import Rows */}
        {step === 1 && (
          <div className="space-y-6 py-4">
            {/* Method Selector Carousel */}
            <div className="flex items-center justify-between gap-4">
              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  if (importMethod === "file") setImportMethod("manual");
                  else if (importMethod === "text") setImportMethod("file");
                  else setImportMethod("text");
                }}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>

              <Card className="flex-1 border-primary/20">
                <CardContent className="p-6">
                  {importMethod === "manual" && (
                    <div className="text-center space-y-4">
                      <Plus className="w-12 h-12 mx-auto text-primary" />
                      <h3 className="font-semibold text-lg">Agregar manualmente</h3>
                      <p className="text-sm text-muted-foreground">
                        Agrega filas una por una
                      </p>
                      <Button
                        onClick={() => setShowAddRowModal(true)}
                        className="w-full"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Agregar Fila
                      </Button>
                    </div>
                  )}

                  {importMethod === "file" && (
                    <div className="text-center space-y-4">
                      <Upload className="w-12 h-12 mx-auto text-primary" />
                      <h3 className="font-semibold text-lg">
                        Importar desde archivo
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Sube un archivo CSV o Excel con las filas
                      </p>
                      <Input
                        type="file"
                        accept=".csv,.xlsx,.xls"
                        onChange={handleFileUpload}
                        className="cursor-pointer"
                      />
                    </div>
                  )}

                  {importMethod === "text" && (
                    <div className="text-center space-y-4">
                      <Type className="w-12 h-12 mx-auto text-primary" />
                      <h3 className="font-semibold text-lg">Texto separado</h3>
                      <p className="text-sm text-muted-foreground">
                        Escribe las filas, una por línea
                      </p>
                      <Textarea
                        value={textInput}
                        onChange={(e) => setTextInput(e.target.value)}
                        placeholder="Producto 1&#10;Producto 2&#10;Producto 3"
                        rows={5}
                      />
                      <Button onClick={handleTextImport} className="w-full">
                        Importar Filas
                      </Button>
                    </div>
                  )}

                  
                </CardContent>
              </Card>

              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  if (importMethod === "file") setImportMethod("text");
                  else if (importMethod === "text") setImportMethod("manual");
                  else setImportMethod("file");
                }}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>

            {/* Current Rows */}
            {rows.length > 0 && (
              <div className="space-y-2">
                <Label>Filas agregadas ({rows.length})</Label>
                <div className="max-h-40 overflow-y-auto space-y-1 border rounded-md p-2">
                  {rows.map((row, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-2 bg-muted/50 rounded"
                    >
                      <span className="text-sm">{row}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveRow(index)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Preview & Columns */}
        {step === 2 && (
          <div className="space-y-6 py-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Pestañas de la Tabla</Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAddTabModal(true)}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Agregar Pestaña
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {tabs.map((tab) => (
                  <Card key={tab.id} className="p-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="font-medium text-sm">{tab.name}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => handleRemoveTab(tab.id)}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
              {tabs.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  (Opcional) Si no agregas pestañas, se creará una pestaña "General" automáticamente.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Vista Previa de Filas ({rows.length})</Label>
              <div className="max-h-40 overflow-y-auto border rounded-md p-2 space-y-1">
                {rows.map((row, index) => (
                  <div
                    key={index}
                    className="p-2 bg-muted/30 rounded text-sm"
                  >
                    {row}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Navigation Buttons */}
        <div className="flex justify-between pt-4 border-t">
          <Button
            variant="outline"
            onClick={() => setStep(Math.max(0, step - 1))}
            disabled={step === 0}
          >
            <ChevronLeft className="w-4 h-4 mr-2" />
            Anterior
          </Button>
          {step < 2 ? (
            <Button
              onClick={() => setStep(step + 1)}
              disabled={
                (step === 0 && !canProceedStep0) ||
                (step === 1 && !canProceedStep1)
              }
            >
              Siguiente
              <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button onClick={handleCreate}>Crear Tabla</Button>
          )}
        </div>

        {/* Add Row Modal */}
        {showAddRowModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <Card className="w-96 p-6 space-y-4">
              <h3 className="font-semibold text-lg">Agregar Fila</h3>
              <div className="space-y-2">
                <Label htmlFor="row-name">Nombre de la Fila</Label>
                <Input
                  id="row-name"
                  value={newRowName}
                  onChange={(e) => setNewRowName(e.target.value)}
                  placeholder="Nombre de la fila"
                  onKeyDown={(e) => e.key === "Enter" && handleAddRow()}
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleAddRow} className="flex-1">
                  Agregar
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowAddRowModal(false);
                    setNewRowName("");
                  }}
                  className="flex-1"
                >
                  Cancelar
                </Button>
              </div>
            </Card>
          </div>
        )}

        {/* Add Tab Modal */}
        {showAddTabModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <Card className="w-96 p-6 space-y-4">
              <h3 className="font-semibold text-lg">Agregar Pestaña</h3>
              <div className="space-y-2">
                <Label htmlFor="tab-name">Nombre de la Pestaña</Label>
                <Input
                  id="tab-name"
                  value={newTabName}
                  onChange={(e) => setNewTabName(e.target.value)}
                  placeholder="Ej: General, Asistencia, Tareas"
                  onKeyDown={(e) => e.key === "Enter" && handleAddTab()}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleAddTab}
                  className="flex-1"
                  disabled={!newTabName.trim()}
                >
                  Agregar
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowAddTabModal(false);
                    setNewTabName("");
                  }}
                  className="flex-1"
                >
                  Cancelar
                </Button>
              </div>
            </Card>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
