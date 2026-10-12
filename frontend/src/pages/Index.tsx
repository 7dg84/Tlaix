import { Link, useNavigate } from "react-router-dom";
import { Database, Users, Package, FileText, Settings, BarChart3 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CreateTableDialog } from "@/components/CreateTableDialog";
import { useState, useEffect } from "react";
import { Header } from "@/components/Header";
import { toast } from "react-hot-toast";
import { getTables, createTable, tableService, tabService, rowService } from '../api';
import { manageError } from '../api/manageErrors';

const Index = () => {
  const navigate = useNavigate();
  const [customTables, setCustomTables] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [tables, setTables] = useState<any[]>([]);

  // API
  const loadTables = async () => {
    try {
      const res = await getTables();
      console.log(res.data);
      setTables(res.data);
    } catch (error) {
      console.error("Error loading tables:", error);
      manageError(error);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadTables();
  }, []);

  const handleCreateTable = async (tableData: any) => {
    console.log(tableData);
    let newTable = null;
    // Save table via API
    try {
      const resTable = await createTable({
        name: tableData.name,
        description: tableData.description,
        icon: "Database",
      });
      console.log("Tabla creada:", resTable.data);
      newTable = resTable.data;

      if (resTable.status === 201) {
        setTables((prev) => [...prev, newTable]);
      }

      toast.success(`La tabla "${newTable.name}" se creó exitosamente`);
    } catch (error) {
      console.error("Error al crear tabla:", error);
      manageError(error);
      return;
    }

    // Save tabs and rows via bulk API in a single transaction
    try {
      const tabsToCreate = (tableData.tabs && tableData.tabs.length > 0)
        ? tableData.tabs.map((tab: any, idx: number) => ({
            name: tab.name,
            label: tab.name,
            order: idx,
          }))
        : [{ name: "General", label: "General", order: 0 }];

      const rowsToCreate = (tableData.rows && tableData.rows.length > 0)
        ? tableData.rows.map((rowName: string, idx: number) => ({
            name: rowName,
            order: idx,
          }))
        : [];

      const bulkRes = await tableService.bulkUpload(newTable.id, {
        tabs: tabsToCreate,
        rows: rowsToCreate,
      });

      console.log("Carga masiva completada:", bulkRes);
      if (rowsToCreate.length > 0) {
        toast.success(`Se crearon ${bulkRes.rows_count} filas y ${bulkRes.tabs_count} pestañas para "${newTable.name}"`);
      }
    } catch (error) {
      console.error("Error al crear pestañas y filas en lote:", error);
      manageError(error);
      toast.error("Hubo un problema al crear las pestañas o filas iniciales.");
    }
  };


  const allTables = [...tables, ...customTables];

  return (
    <div className="min-h-screen bg-background">
      <Header title="Gestor de Tablas" subtitle="Selecciona una tabla para comenzar" />

      <main className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <CreateTableDialog onCreateTable={handleCreateTable} />
          {tables.map((table) => {
            const Icon = table.icon || Database;
            return (
              <Link key={table.id} to={`/table/${table.id}`}>
                <Card className="group hover:shadow-[var(--shadow-hover)] transition-all duration-300 cursor-pointer border-border/50 hover:border-primary/50 overflow-hidden">
                  <div className={`h-2 bg-gradient-to-r ${table.color}`} />
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-xl group-hover:text-primary transition-colors">
                          {table.name}
                        </CardTitle>
                        <CardDescription className="mt-2">
                          {table.description}
                        </CardDescription>
                      </div>
                      <div className={`p-3 rounded-lg bg-gradient-to-br ${table.color} text-white group-hover:scale-110 transition-transform duration-300`}>
                        <Icon className="w-6 h-6" />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center text-sm text-muted-foreground">
                      <span className="group-hover:text-primary transition-colors">
                        Ver detalles →
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </main>
    </div>
  );
};

export default Index;
