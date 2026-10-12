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
import { CellEditor } from "@/components/CellEditor";


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
        // Si la tabla no tiene pestañas, creamos una pestaña "General" por defecto automáticamente
        try {
          const defaultTab = await tabService.create(tableId, {
            table_id: tableId,
            name: "General",
            label: "General",
            order: 0,
          });
          const formatted = [{
            id: defaultTab.id.toString(),
            name: defaultTab.name,
            label: defaultTab.label || defaultTab.name,
          }];
          setTabs(formatted);
          setActiveTabId(defaultTab.id.toString());
          await loadTabContent(tableId, defaultTab.id.toString());
        } catch (tabErr) {
          console.error("Error creando pestaña por defecto:", tabErr);
          toast.error("Esta tabla no tiene pestañas configuradas.");
        }
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
    if (!name.trim()) return;

    if (tableId) {
      try {
        const createdRow = await rowService.create(tableId, {
          table_id: tableId,
          name: name.trim(),
          data: {},
        });

        // Inicializar las celdas con las columnas actuales de la pestaña
        const cells: Record<string, any> = {};
        columns.forEach((col) => {
          cells[col.id] = col.type === "checkbox" ? false : null;
        });

        const newRow: TableRow = {
          id: createdRow.id.toString(),
          name: createdRow.name,
          ...cells,
          ...(createdRow.data || {}),
        };

        setRows((prev) => [...prev, newRow]);
        toast.success("Fila creada correctamente");
      } catch (error) {
        manageError(error);
        console.error("Error creando fila:", error);
        toast.error("Error al guardar la fila en la API.");
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
          label: createdTab.label || createdTab.name,
        };

        setTabs((prev) => [...prev, newTab]);
        toast.success("Pestaña creada correctamente");

        // Si no había ninguna pestaña activa, activamos la nueva y cargamos su contenido
        if (!activeTabId) {
          setActiveTabId(newTab.id);
          await loadTabContent(tableId, newTab.id);
        }
      } catch (error) {
        manageError(error);
        console.error("Error creando pestaña:", error);
        toast.error("Error al guardar en la API. Agregando localmente.");
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

  const updateCellValue = async (rowId: string, columnId: string, parsedValue: any) => {
    setRows((prev) =>
      prev.map((row) =>
        row.id === rowId ? { ...row, [columnId]: parsedValue } : row
      )
    );

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
                            <CellEditor
                              key={`${row.id}-${column.id}`}
                              rowId={row.id}
                              column={column}
                              value={row[column.id]}
                              onSave={updateCellValue}
                            />
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
