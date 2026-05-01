import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar"; // 👈 Importamos el componente limpio

const Layout = () => {
  return (
    <div className="flex h-screen bg-slate-100 font-sans">
      {/* Sidebar Separado */}
      <Sidebar />

      {/* Contenido Principal */}
      <main className="flex-1 overflow-auto bg-slate-50">
        <div className="p-6 md:p-8 max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default Layout;
