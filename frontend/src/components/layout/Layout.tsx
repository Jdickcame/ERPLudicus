import { Menu } from "lucide-react";
import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";

const Layout = () => {
  const location = useLocation();
  const isPosScreen = location.pathname.startsWith("/pos");

  // ESTADO PARA CONTROLAR EL MENÚ EN MÓVIL
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // UX PRO: Cerramos el menú automáticamente cuando cambiamos de página
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  return (
    <div className="flex h-screen bg-slate-100 font-sans overflow-hidden">
      {/* 1. OVERLAY OSCURO PARA MÓVIL (Al hacer clic afuera, se cierra el menú) */}
      {!isPosScreen && isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* 2. SIDEBAR (Le pasamos el estado para saber si abrirse o no) */}
      {!isPosScreen && (
        <Sidebar isOpen={isMobileMenuOpen} setIsOpen={setIsMobileMenuOpen} />
      )}

      {/* 3. CONTENIDO PRINCIPAL */}
      <main className="flex-1 flex flex-col overflow-hidden bg-slate-50">
        {/* BARRA SUPERIOR PARA MÓVILES (Solo visible en pantallas pequeñas y si no es POS) */}
        {!isPosScreen && (
          <div className="md:hidden bg-slate-900 text-white p-4 flex justify-between items-center shadow-md z-30">
            <span className="font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-blue-600">
              KENSIS
            </span>
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-1 hover:bg-slate-800 rounded transition-colors focus:outline-none"
            >
              <Menu size={24} />
            </button>
          </div>
        )}

        {/* 4. CONTENEDOR DE LA VISTA (Hereda el espacio restante y hace scroll) */}
        <div
          className={`flex-1 overflow-auto ${
            isPosScreen
              ? "h-full w-full"
              : "p-4 md:p-8 max-w-7xl mx-auto w-full"
          }`}
        >
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default Layout;
