import { Link, useNavigate } from "react-router-dom";
import { Database, Users, Package, FileText, Settings, BarChart3 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CreateTableDialog } from "@/components/CreateTableDialog";
import { useState } from "react";

const tables = [
  {
    id: "inventory",
    name: "Inventario",
    description: "Gestión de productos y stock",
    icon: Package,
    color: "from-blue-500 to-purple-600",
  },
  {
    id: "clients",
    name: "Clientes",
    description: "Base de datos de clientes",
    icon: Users,
    color: "from-purple-500 to-pink-600",
  },
  {
    id: "reports",
    name: "Reportes",
    description: "Informes y análisis",
    icon: BarChart3,
    color: "from-pink-500 to-orange-600",
  },
  {
    id: "documents",
    name: "Documentos",
    description: "Archivos y registros",
    icon: FileText,
    color: "from-orange-500 to-yellow-600",
  },
  {
    id: "settings",
    name: "Configuración",
    description: "Ajustes del sistema",
    icon: Settings,
    color: "from-green-500 to-teal-600",
  },
  {
    id: "database",
    name: "Base de Datos",
    description: "Datos generales",
    icon: Database,
    color: "from-teal-500 to-blue-600",
  },
];

const Index = () => {
  const navigate = useNavigate();
  const [customTables, setCustomTables] = useState<any[]>([]);

  const handleCreateTable = (tableData: any) => {
    const newTable = {
      id: `custom-${Date.now()}`,
      name: tableData.name,
      description: tableData.description,
      icon: Database,
      color: "from-indigo-500 to-purple-600",
      rows: tableData.rows,
      columns: tableData.columns,
    };
    setCustomTables([...customTables, newTable]);
    navigate(`/table/${newTable.id}`);
  };

  const allTables = [...tables, ...customTables];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-6">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            Gestor de Tablas
          </h1>
          <p className="text-muted-foreground mt-2">
            Selecciona una tabla para comenzar
          </p>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <CreateTableDialog onCreateTable={handleCreateTable} />
          {allTables.map((table) => {
            const Icon = table.icon;
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
