import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Trash2 } from "lucide-react";
import { rowService, columnService, tabService, tableService, cellService, manageError } from "@/api";
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
import { Header } from "@/components/Header";

interface TableRow {
  id: string;
  name: string;
  [key: string]: any;
}

const TableView = () => {
  const { tableId } = useParams();

  const [columns, setColumns] = useState<ColumnDefinition[]>([]);
  const [rows, setRows] = useState<TableRow[]>([]);
  const [tabs, setTabs] = useState<TabDefinition[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [tablename, setTableName] = useState("");

  // Cargar datos al montar el componente
  useEffect(() => {
    if (tableId) {
      loadTableData();
    }
  }, [tableId]);

  const loadTabContent = async (tId: string, tabId: string) => {
    setIsLoading(true);
    try {
      const data = await tableService.getTabView(tId, tabId);

      if (data.columns) {
        setColumns(data.columns.map((col: any) => ({
          id: col.id.toString(),
          name: col.name,
          type: col.type as any,
          options: col.options || [],
        })));
      }

      if (data.rows) {
        setRows(data.rows.map((row: any) => ({
          id: row.id.toString(),
          name: row.name,
          ...row.cells, // Desestructurar las celdas directamente en el objeto de la fila
        })));
      }
      toast.success("Contenido de pestaña cargado");
    } catch (error) {
      manageError(error);
      console.error("Error cargando contenido de pestaña:", error);
      toast.error("No se pudo cargar el contenido de la pestaña.");
    } finally {
      setIsLoading(false);
    }
  };

  const loadTableData = async () => {
    if (!tableId) return;

    setIsLoading(true);
    try {
      const [tabsData, table] = await Promise.all([
        tabService.getAll(tableId),
        tableService.getById(tableId),
      ]);

      if (table) {
        document.title = `Tabla - ${table.name}`;
        setTableName(table.name);
      }

      if (tabsData.length > 0) {
        const formattedTabs = tabsData.map((tab: any) => ({
          id: tab.id.toString(),
          name: tab.name,
          label: tab.label || tab.name,
        }));
        setTabs(formattedTabs);

        const firstTab = formattedTabs[0];
        setActiveTabId(firstTab.id);
        await loadTabContent(tableId, firstTab.id);
      } else {
        toast.error("Esta tabla no tiene pestañas configuradas.");
      }
    } catch (error) {
      manageError(error);
      console.error("Error cargando datos:", error);
      toast.error("No se pudo conectar con la API.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleTabChange = async (tabId: string) => {
    if (tableId) {
      setActiveTabId(tabId);
      await loadTabContent(tableId, tabId);
    }
  };

  const handleAddRow = async (name: string) => {
    const newRowData: any = { name };

    if (tableId) {
      try {
        const createdRow = await rowService.create(tableId, {
          table_id: tableId,
          name,
          data: {},
        });

        const newRow: TableRow = {
          id: createdRow.id.toString(),
          name: createdRow.name,
          ...createdRow.data,
        };

        setRows([...rows, newRow]);
        toast.success("Fila creada correctamente");
      } catch (error) {
        manageError(error);
        console.error("Error creando fila:", error);
        toast.error("Error al guardar en la API. Agregando localmente.");
      }
    }
  };

  const handleAddColumn = async (column: ColumnDefinition) => {
    if (tableId) {
      try {
        const createdColumn = await columnService.create(tableId, {
          table_id: tableId,
          tab_id: activeTabId,
          name: column.name,
          type: column.type,
          options: column.options || [],
          order: columns.length,
        });

        const newColumn: ColumnDefinition = {
          id: createdColumn.id.toString(),
          name: createdColumn.name,
          type: createdColumn.type as any,
          options: createdColumn.options,
        };

        setColumns([...columns, newColumn]);

        setRows(rows.map((row) => ({
          ...row,
          [newColumn.id]: newColumn.type === "checkbox" ? false : "",
        })));

        toast.success("Columna creada correctamente");
      } catch (error) {
        manageError(error);
        console.error("Error creando columna:", error);
        toast.error("Error al guardar en la API. Agregando localmente.");
      }
    }
  };

  const handleAddTab = async (tab: TabDefinition) => {
    if (tableId) {
      try {
        const createdTab = await tabService.create(tableId, {
          table_id: tableId,
          name: tab.name,
          label: tab.label,
          order: tabs.length,
        });

        const newTab: TabDefinition = {
          id: createdTab.id.toString(),
          name: createdTab.name,
          label: createdTab.name,
        };

        setTabs([...tabs, newTab]);
        toast.success("Pestaña creada correctamente");
      } catch (error) {
        manageError(error);
        console.error("Error creando pestaña:", error);
        toast.error("Error al guardar en la API. Agregando localmente.");
        // setTabs([...tabs, tab]);
      }
    }
  };

  const deleteRow = async (id: string) => {
    if (tableId) {
      try {
        await rowService.delete(tableId, id);
        setRows(rows.filter((row) => row.id !== id));
        toast.success("Fila eliminada correctamente");
      } catch (error) {
        manageError(error);
        console.error("Error eliminando fila:", error);
        // setRows(rows.filter((row) => row.id !== id));
      }
    }
  };

  const updateCellValue = async (rowId: string, columnId: string, value: any) => {
    const column = columns.find((col) => col.id === columnId);
    let parsedValue = value;
    if (column) {
      if (column.type === "checkbox") {
        parsedValue = value === true || value === "true";
      } else if (column.type === "int") {
        parsedValue = parseInt(value, 10);
        if (isNaN(parsedValue)) parsedValue = null;
      } else if (column.type === "float") {
        parsedValue = parseFloat(value);
        if (isNaN(parsedValue)) parsedValue = null;
      }
    }

    const updatedRows = rows.map((row) =>
      row.id === rowId ? { ...row, [columnId]: parsedValue } : row
    );
    setRows(updatedRows);

    if (tableId) {
      try {
        await cellService.update(tableId, columnId, rowId, parsedValue);
      } catch (error) {
        manageError(error);
        console.error("Error actualizando celda:", error);
        toast.error("Error al guardar cambios en la API");
      }
    }
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


  return (
    <div className="min-h-screen bg-background">
      <Header title={tablename} showBackLink />

      <main className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <div className="flex gap-2">
            <AddColumnDialog onAddColumn={handleAddColumn} />
            <AddRowDialog onAddRow={handleAddRow} />
          </div>
          <AddTabDialog onAddTab={handleAddTab} />
        </div>

        <Tabs value={activeTabId} onValueChange={handleTabChange} className="w-full">
          <TabsList className={`grid w-full mb-8`} style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
            {
              tabs.length === 0 ?

                <div className="text-center text-muted-foreground col-span-full">
                  No hay pestañas disponibles. Agrega una nueva pestaña para comenzar.
                </div>
                :
                tabs.map((tab) => (
                  <TabsTrigger key={tab.id} value={tab.id}>
                    {tab.label}
                  </TabsTrigger>
                ))
            }
          </TabsList>

          {tabs.map((tab) => (
            <TabsContent key={tab.id} value={tab.id} className="space-y-6">
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
