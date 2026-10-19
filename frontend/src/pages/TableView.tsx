import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Loader2, Trash2, X } from "lucide-react";
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
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";


interface TableRow {
  id: string;
  name: string;
  [key: string]: any;
}

// Tamaño de bloque para la carga incremental de filas
const ROW_PAGE_SIZE = 50;

const TableView = () => {
  const { tableId } = useParams();

  const [columns, setColumns] = useState<ColumnDefinition[]>([]);
  const [rows, setRows] = useState<TableRow[]>([]);
  const [tabs, setTabs] = useState<TabDefinition[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [tablename, setTableName] = useState("");
  const [tabToDelete, setTabToDelete] = useState<TabDefinition | null>(null);
  const [columnToDelete, setColumnToDelete] = useState<ColumnDefinition | null>(null);

  // Estado de paginación (carga por bloques)
  const [hasMoreRows, setHasMoreRows] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Refs: centinela del observer, recuento de filas cargadas y guardas anti-duplicado
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const rowsCountRef = useRef(0);
  const hasMoreRowsRef = useRef(false);
  const isLoadingMoreRef = useRef(false);
  const isInitialLoadRef = useRef(false);
  // Pestaña activa actual: permite validar el resultado de una carga ya iniciada
  const activeTabIdRef = useRef(activeTabId);

  // Cargar datos al montar el componente
  useEffect(() => {
    if (tableId) {
      loadTableData();
    }
  }, [tableId]);

  // Mantener la ref de pestaña activa al día para invalidar cargas en vuelo
  useEffect(() => {
    activeTabIdRef.current = activeTabId;
  }, [activeTabId]);

  // Mantener el recuento de filas sincronizado con lo renderizado: se usa como row_offset.
  // Depende de `rows.length` para reflejar también altas y bajas de filas.
  useEffect(() => {
    rowsCountRef.current = rows.length;
  }, [rows.length]);

  const loadTabContent = async (tId: string, tabId: string) => {
    setIsLoading(true);
    // Evita que el centinela dispare una carga extra mientras llega el primer bloque
    isInitialLoadRef.current = true;
    // Resetear el estado de paginación al cambiar de pestaña
    hasMoreRowsRef.current = false;
    isLoadingMoreRef.current = false;
    setHasMoreRows(false);
    setIsLoadingMore(false);

    try {
      const data = await tableService.getTabView(tId, tabId, {
        row_limit: ROW_PAGE_SIZE,
        row_offset: 0,
      });

      if (data.columns) {
        setColumns(data.columns.map((col: any) => ({
          id: col.id.toString(),
          name: col.name,
          type: col.type as any,
          options: col.options || [],
        })));
      }

      if (data.rows) {
        const mappedRows = data.rows.map((row: any) => ({
          id: row.id.toString(),
          name: row.name,
          ...row.cells, // Desestructurar las celdas directamente en el objeto de la fila
        }));
        setRows(mappedRows);
      }

      // Si no viene el bloque de paginación, asumimos que no hay más filas
      const more = data.pagination ? !!data.pagination.has_more_rows : false;
      hasMoreRowsRef.current = more;
      setHasMoreRows(more);

      toast.success("Contenido de pestaña cargado");
    } catch (error) {
      manageError(error);
      console.error("Error cargando contenido de pestaña:", error);
      toast.error("No se pudo cargar el contenido de la pestaña.");
      // Sin offset válido, no reintentamos cargas incrementales
      hasMoreRowsRef.current = false;
      setHasMoreRows(false);
    } finally {
      isInitialLoadRef.current = false;
      setIsLoading(false);
    }
  };

  const loadMoreRows = useCallback(async () => {
    if (!tableId || !activeTabId) return;
    if (isInitialLoadRef.current) return;
    if (!hasMoreRowsRef.current || isLoadingMoreRef.current) return;

    // Pestaña a la que pertenece este bloque: si el usuario cambia de pestaña
    // mientras la petición está en vuelo, el resultado ya no es válido
    const requestedTabId = activeTabId;

    isLoadingMoreRef.current = true;
    setIsLoadingMore(true);

    try {
      const offset = rowsCountRef.current;
      const data = await tableService.getTabView(tableId, requestedTabId, {
        row_limit: ROW_PAGE_SIZE,
        row_offset: offset,
      });

      // Descartar el bloque si la pestaña activa cambió durante la carga:
      // sus filas pertenecen a otra pestaña y no deben contaminar la actual
      if (requestedTabId !== activeTabIdRef.current) return;

      const newRows: TableRow[] = (data.rows || []).map((row: any) => ({
        id: row.id.toString(),
        name: row.name,
        ...row.cells, // Desestructurar las celdas directamente en el objeto de la fila
      }));

      setRows((prev) => {
        const existingIds = new Set(prev.map((row) => row.id));
        const uniqueNewRows = newRows.filter((row) => !existingIds.has(row.id));
        return [...prev, ...uniqueNewRows];
      });

      const more = data.pagination ? !!data.pagination.has_more_rows : false;
      hasMoreRowsRef.current = more;
      setHasMoreRows(more);
    } catch (error) {
      manageError(error);
      console.error("Error cargando más filas:", error);
      toast.error("No se pudieron cargar más filas.");
    } finally {
      isLoadingMoreRef.current = false;
      setIsLoadingMore(false);
    }
  }, [tableId, activeTabId]);

  // Carga por bloques al hacer scroll: observamos un centinela al final de la tabla
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          loadMoreRows();
        }
      },
      { root: null, rootMargin: "200px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMoreRows, activeTabId, tabs.length]);

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

  const handleConfirmDeleteTab = async () => {
    if (!tableId || !tabToDelete) return;
    try {
      await tabService.delete(tableId, tabToDelete.id);
      const remainingTabs = tabs.filter((t) => t.id !== tabToDelete.id);
      setTabs(remainingTabs);

      if (activeTabId === tabToDelete.id) {
        if (remainingTabs.length > 0) {
          const nextTab = remainingTabs[0];
          setActiveTabId(nextTab.id);
          await loadTabContent(tableId, nextTab.id);
        } else {
          setActiveTabId("");
          setColumns([]);
          setRows([]);
        }
      }
      toast.success("Pestaña eliminada correctamente");
    } catch (error) {
      manageError(error);
      console.error("Error eliminando pestaña:", error);
      toast.error("Error al eliminar la pestaña.");
    } finally {
      setTabToDelete(null);
    }
  };

  const handleConfirmDeleteColumn = async () => {
    if (!tableId || !columnToDelete) return;
    try {
      await columnService.delete(tableId, columnToDelete.id);
      const deletedColumnId = columnToDelete.id;
      setColumns((prev) => prev.filter((col) => col.id !== deletedColumnId));
      setRows((prev) =>
        prev.map((row) => {
          const updatedRow = { ...row };
          delete updatedRow[deletedColumnId];
          return updatedRow;
        })
      );
      toast.success("Columna eliminada correctamente");
    } catch (error) {
      manageError(error);
      console.error("Error eliminando columna:", error);
      toast.error("Error al eliminar la columna.");
    } finally {
      setColumnToDelete(null);
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
          <TabsList
            className="grid w-full mb-8"
            style={{
              gridTemplateColumns:
                tabs.length > 0
                  ? `repeat(${tabs.length}, minmax(0, 1fr))`
                  : undefined,
            }}
          >
            {tabs.length === 0 ? (
              <div className="text-center text-muted-foreground col-span-full">
                No hay pestañas disponibles. Agrega una nueva pestaña para comenzar.
              </div>
            ) : (
              tabs.map((tab) => (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className="flex items-center justify-center group"
                >
                  <span>{tab.label}</span>
                  <X
                    className="w-3.5 h-3.5 ml-2 hover:text-destructive hover:bg-destructive/10 rounded-full p-0.5 transition-colors cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      setTabToDelete(tab);
                    }}
                  />
                </TabsTrigger>
              ))
            )}
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
                          <div className="flex items-center justify-between gap-2">
                            <span>{column.name}</span>
                            <button
                              type="button"
                              onClick={() => setColumnToDelete(column)}
                              className="hover:text-destructive hover:bg-destructive/10 rounded-full p-0.5 transition-colors text-muted-foreground"
                              title="Eliminar columna"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
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

                {/* Centinela para el IntersectionObserver de la carga por bloques */}
                <div ref={sentinelRef} aria-hidden="true" className="h-px w-full" />

                {isLoadingMore && (
                  <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Cargando más filas...</span>
                  </div>
                )}
              </div>
            </TabsContent>
          ))}
        </Tabs>

        <ConfirmDeleteDialog
          open={!!tabToDelete}
          onOpenChange={(open) => {
            if (!open) setTabToDelete(null);
          }}
          title="Eliminar pestaña"
          description={`¿Estás seguro de que deseas eliminar la pestaña "${tabToDelete?.label || ""}"? Se eliminarán las columnas asociadas.`}
          onConfirm={handleConfirmDeleteTab}
        />

        <ConfirmDeleteDialog
          open={!!columnToDelete}
          onOpenChange={(open) => {
            if (!open) setColumnToDelete(null);
          }}
          title="Eliminar columna"
          description={`¿Estás seguro de que deseas eliminar la columna "${columnToDelete?.name || ""}"? Los datos de esta columna se perderán.`}
          onConfirm={handleConfirmDeleteColumn}
        />
      </main>
    </div>
  );
};

export default TableView;
