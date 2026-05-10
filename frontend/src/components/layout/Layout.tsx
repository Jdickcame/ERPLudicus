import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar"; // 👈 Importamos el componente limpio

const Layout = () => {
  const location = useLocation();

  // 👇 1. Detectamos si estamos en la pantalla del Punto de Venta
  const isPosScreen = location.pathname.startsWith("/pos");

  return (
    <div className="flex h-screen bg-slate-100 font-sans overflow-hidden">
      {/* 👇 2. Solo dibujamos el Sidebar si NO estamos en el POS */}
      {!isPosScreen && <Sidebar />}

      {/* Contenido Principal */}
      <main className="flex-1 overflow-auto bg-slate-50">
        {/* 👇 3. Si es POS, usamos 100% del espacio. Si es el ERP normal, le damos los márgenes. */}
        <div
          className={
            isPosScreen ? "h-full w-full" : "p-6 md:p-8 max-w-7xl mx-auto"
          }
        >
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default Layout;
