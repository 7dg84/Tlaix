import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { toast } from "sonner";
import { AddColumnDialog, ColumnDefinition } from "@/components/AddColumnDialog";
import { AddRowDialog } from "@/components/AddRowDialog";
import { AddTabDialog, TabDefinition } from "@/components/AddTabDialog";

interface TableRow {
  id: string;
  name: string;
  [key: string]: any;
}

const TableView = () => {
  const { tableId } = useParams();
  
  const [columns, setColumns] = useState<ColumnDefinition[]>([
    { id: "1", name: "Completado", type: "checkbox" },
    { id: "2", name: "Prioritario", type: "checkbox" },
    { id: "3", name: "Notas", type: "text" },
  ]);

  const [rows, setRows] = useState<TableRow[]>([
    { id: "1", name: "Elemento 1", "1": false, "2": true, "3": "Notas ejemplo" },
    { id: "2", name: "Elemento 2", "1": true, "2": false, "3": "" },
  ]);

  const [tabs, setTabs] = useState<TabDefinition[]>([
    { id: "all", name: "all", label: "Todos" },
    { id: "active", name: "active", label: "Activos" },
    { id: "completed", name: "completed", label: "Completados" },
  ]);

  const handleAddRow = (name: string) => {
    const newRow: TableRow = {
      id: Date.now().toString(),
      name: name,
    };

    columns.forEach((col) => {
      if (col.type === "checkbox") {
        newRow[col.id] = false;
      } else {
        newRow[col.id] = "";
      }
    });

    setRows([...rows, newRow]);
  };

  const handleAddColumn = (column: ColumnDefinition) => {
    setColumns([...columns, column]);
    
    setRows(rows.map((row) => ({
      ...row,
      [column.id]: column.type === "checkbox" ? false : "",
    })));
  };

  const handleAddTab = (tab: TabDefinition) => {
    setTabs([...tabs, tab]);
  };

  const deleteRow = (id: string) => {
    setRows(rows.filter((row) => row.id !== id));
    toast.success("Fila eliminada");
  };

  const updateCellValue = (rowId: string, columnId: string, value: any) => {
    setRows(
      rows.map((row) =>
        row.id === rowId ? { ...row, [columnId]: value } : row
      )
    );
  };

  const renderCell = (row: TableRow, column: ColumnDefinition) => {
    const value = row[column.id];

    switch (column.type) {
      case "checkbox":
        return (
          <Checkbox
            checked={value || false}
            onCheckedChange={(checked) => updateCellValue(row.id, column.id, checked)}
          />
        );
      case "int":
      case "float":
        return (
          <Input
            type="number"
            step={column.type === "float" ? "0.01" : "1"}
            value={value || ""}
            onChange={(e) => updateCellValue(row.id, column.id, e.target.value)}
            className="max-w-[150px]"
          />
        );
      case "select":
        return (
          <Select value={value || ""} onValueChange={(val) => updateCellValue(row.id, column.id, val)}>
            <SelectTrigger className="max-w-[200px]">
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
      case "text":
      default:
        return (
          <Input
            type="text"
            value={value || ""}
            onChange={(e) => updateCellValue(row.id, column.id, e.target.value)}
            className="max-w-[250px]"
          />
        );
    }
  };

  const tableName = tableId?.charAt(0).toUpperCase() + tableId?.slice(1) || "Tabla";

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-6">
          <Link to="/" className="inline-flex items-center text-muted-foreground hover:text-primary transition-colors mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Volver al menú
          </Link>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            {tableName}
          </h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <div className="flex gap-2">
            <AddColumnDialog onAddColumn={handleAddColumn} />
            <AddRowDialog onAddRow={handleAddRow} />
          </div>
          <AddTabDialog onAddTab={handleAddTab} />
        </div>

        <Tabs defaultValue={tabs[0]?.name || "all"} className="w-full">
          <TabsList className={`grid w-full mb-8`} style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
            {tabs.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.name}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="all" className="space-y-6">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-4 font-semibold">Nombre</th>
                    {columns.map((column) => (
                      <th key={column.id} className="text-left p-4 font-semibold">
                        {column.name}
                      </th>
                    ))}
                    <th className="text-left p-4 font-semibold">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b hover:bg-muted/30 transition-colors"
                    >
                      <td className="p-4 font-medium">{row.name}</td>
                      {columns.map((column) => (
                        <td key={column.id} className="p-4">
                          {renderCell(row, column)}
                        </td>
                      ))}
                      <td className="p-4">
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => deleteRow(row.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="active" className="space-y-6">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-4 font-semibold">Nombre</th>
                    {columns.map((column) => (
                      <th key={column.id} className="text-left p-4 font-semibold">
                        {column.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows
                    .filter((row) => !row["1"])
                    .map((row) => (
                      <tr
                        key={row.id}
                        className="border-b hover:bg-muted/30 transition-colors"
                      >
                        <td className="p-4 font-medium">{row.name}</td>
                        {columns.map((column) => (
                          <td key={column.id} className="p-4">
                            {renderCell(row, column)}
                          </td>
                        ))}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="completed" className="space-y-6">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-4 font-semibold">Nombre</th>
                    {columns.map((column) => (
                      <th key={column.id} className="text-left p-4 font-semibold">
                        {column.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows
                    .filter((row) => row["1"])
                    .map((row) => (
                      <tr
                        key={row.id}
                        className="border-b hover:bg-muted/30 transition-colors"
                      >
                        <td className="p-4 font-medium">{row.name}</td>
                        {columns.map((column) => (
                          <td key={column.id} className="p-4">
                            {column.type === "checkbox" ? (
                              <Checkbox checked={row[column.id] || false} disabled />
                            ) : (
                              <span className="text-muted-foreground">{row[column.id] || "-"}</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </TabsContent>

          {tabs.slice(3).map((tab) => (
            <TabsContent key={tab.id} value={tab.name} className="space-y-6">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-4 font-semibold">Nombre</th>
                      {columns.map((column) => (
                        <th key={column.id} className="text-left p-4 font-semibold">
                          {column.name}
                        </th>
                      ))}
                      <th className="text-left p-4 font-semibold">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr
                        key={row.id}
                        className="border-b hover:bg-muted/30 transition-colors"
                      >
                        <td className="p-4 font-medium">{row.name}</td>
                        {columns.map((column) => (
                          <td key={column.id} className="p-4">
                            {renderCell(row, column)}
                          </td>
                        ))}
                        <td className="p-4">
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => deleteRow(row.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </main>
    </div>
  );
};

export default TableView;