import { Link, useNavigate } from "react-router-dom";
import { Database, Users, Package, FileText, Settings, BarChart3 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CreateTableDialog } from "@/components/CreateTableDialog";
import { useState, useEffect } from "react";
import { Header } from "@/components/Header";
import { toast } from "react-hot-toast";
import { getTables, createTable } from '../api/tables';
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
    console.log(tableData)
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

      toast(`La tabla "${newTable.name}" se creó exitosamente`);
      // navigate(`/table/${newTable.id}`);
    } catch (error) {
      console.error("Error al crear tabla:", error);
      manageError(error);
      return;
    }

    // Save rows via API (if any)
    try {
      for (const row of tableData.rows) {
        console.log(row);
      }
      toast(`Se crearon ${tableData.rows.length} filas para la tabla "${newTable.name}"`);
    } catch (error) {
      console.error("Error al crear filas:", error);
      toast("No se pudieron crear las filas. Verifica la conexión con la API.");
    }

    // Save tabs via API (if any)
    try {
      for (const tab of tableData.tabs) {
        console.log(tab)
      }
      toast(`Se crearon ${tableData.tabs.length} columnas para la tabla "${newTable.name}"`);
    } catch (error) {
      console.error("Error al crear columnas:", error);
      toast("No se pudieron crear las columnas. Verifica la conexión con la API.");
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
