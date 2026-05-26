import {
  AlertCircle,
  Banknote,
  ChefHat,
  ChevronDown,
  ChevronRight,
  CreditCard,
  FileText,
  LayoutDashboard,
  LayoutList,
  LogOut,
  Package,
  PlusCircle,
  ShoppingBag,
  ShoppingCart,
  Target,
  Truck,
  Users,
  Wallet,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import ExchangeRateWidget from "../common/ExchangeRateWidget";

// --- SUB-COMPONENTES ---

const SidebarItem = ({ to, icon: Icon, label, exact = false }: any) => {
  const location = useLocation();
  const isActive = exact
    ? location.pathname === to
    : location.pathname.startsWith(to);

  return (
    <Link
      to={to}
      className={`flex items-center space-x-3 p-2.5 rounded-lg transition-all text-sm mb-1 ml-2 ${
        isActive
          ? "bg-blue-600 text-white shadow-md font-medium translate-x-1"
          : "text-slate-400 hover:text-white hover:bg-slate-800"
      }`}
    >
      <Icon size={18} />
      <span>{label}</span>
    </Link>
  );
};

const SidebarGroup = ({ label, icon: Icon, children, basePath }: any) => {
  const location = useLocation();

  // Ya no necesitamos Array, volvimos a la simplicidad
  const isActiveGroup = location.pathname.startsWith(basePath);

  const [isOpen, setIsOpen] = useState(isActiveGroup);

  useEffect(() => {
    if (isActiveGroup) setIsOpen(true);
  }, [location.pathname, isActiveGroup]);

  return (
    <div className="mb-2">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between p-3 rounded-lg transition-colors text-sm font-medium ${
          isActiveGroup
            ? "text-blue-400 bg-slate-800/50"
            : "text-slate-300 hover:bg-slate-800"
        }`}
      >
        <div className="flex items-center gap-3">
          <Icon size={20} />
          <span>{label}</span>
        </div>
        {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      </button>

      <div
        className={`overflow-hidden transition-all duration-300 ${
          isOpen ? "max-h-96 opacity-100 mt-1" : "max-h-0 opacity-0"
        }`}
      >
        <div className="border-l-2 border-slate-700 ml-4 pl-2 space-y-1">
          {children}
        </div>
      </div>
    </div>
  );
};

// --- COMPONENTE PRINCIPAL SIDEBAR ---

const Sidebar = () => {
  const { user, logout } = useAuth();

  const check = (module: string, submodule?: string) => {
    if (!user) return false;
    if (user.role === "ADMIN" || user.is_superuser) return true;
    if (!user.permissions) return false;
    const perms = user.permissions as any;
    if (submodule) {
      return perms[module]?.[submodule] === true;
    } else {
      return perms[module] === true;
    }
  };

  const showSalesGroup =
    check("sales", "pos") || check("sales", "list") || check("cash");

  const showInventoryGroup =
    check("inventory", "list") || check("inventory", "create");

  // 1. Logística y Compras (Ya no incluye finanzas)
  const showPurchasesGroup =
    check("purchases", "create") ||
    check("purchases", "list") ||
    check("purchases", "suppliers");

  // 2. Tesorería
  const showTreasuryGroup =
    check("purchases", "payable") || check("purchases", "budgets");

  return (
    <aside className="w-64 bg-slate-900 text-white flex flex-col shadow-2xl z-20 h-screen sticky top-0">
      {/* Cabecera */}
      <div className="p-6 border-b border-slate-800 bg-slate-900">
        <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-blue-600 tracking-tight">
          KENSIS System
        </h2>
        <div className="mt-2 text-xs text-slate-500">
          <p className="font-bold text-slate-400 truncate">{user?.email}</p>
          <span className="uppercase bg-slate-800 px-2 py-0.5 rounded text-[10px] tracking-wider text-blue-400">
            {user?.role}
          </span>
        </div>
      </div>

      {/* Navegación */}
      <nav className="flex-1 p-4 overflow-y-auto custom-scrollbar space-y-1">
        <div className="mb-4">
          <p className="px-3 mb-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            General
          </p>
          <SidebarItem
            to="/dashboard"
            icon={LayoutDashboard}
            label="Dashboard"
            exact={true}
          />
          {check("users") && (
            <SidebarItem to="/users" icon={Users} label="Usuarios" />
          )}
        </div>

        <p className="px-3 mb-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
          Módulos Operativos
        </p>

        {showSalesGroup && (
          <SidebarGroup label="Ventas" icon={ShoppingCart} basePath="/sales">
            {check("sales", "pos") && (
              <SidebarItem to="/pos" icon={CreditCard} label="Punto de Venta" />
            )}
            {check("sales", "list") && (
              <SidebarItem
                to="/sales"
                icon={FileText}
                label="Historial Ventas"
                exact={true}
              />
            )}
            {check("cash") && (
              <SidebarItem to="/cash" icon={Banknote} label="Gestión de Caja" />
            )}
          </SidebarGroup>
        )}

        {showPurchasesGroup && (
          <SidebarGroup
            label="Logística & Compras"
            icon={ShoppingBag}
            basePath="/purchases"
          >
            {check("purchases", "create") && (
              <SidebarItem
                to="/purchases/new"
                icon={PlusCircle}
                label="Nueva Compra"
              />
            )}
            {check("purchases", "list") && (
              <SidebarItem
                to="/purchases"
                icon={LayoutList}
                label="Historial Compras"
                exact={true}
              />
            )}
            {check("purchases", "suppliers") && (
              <SidebarItem
                to="/purchases/suppliers"
                icon={Truck}
                label="Directorio Proveedores"
              />
            )}
          </SidebarGroup>
        )}

        {showInventoryGroup && (
          <SidebarGroup label="Inventario" icon={Package} basePath="/inventory">
            {check("inventory", "list") && (
              <SidebarItem
                to="/inventory"
                icon={Package}
                label="Inventario Físico"
                exact={true}
              />
            )}
            {check("inventory", "list") && (
              <SidebarItem
                to="/inventory/products"
                icon={LayoutList}
                label="Catálogo General"
              />
            )}
            {check("inventory", "create") && (
              <SidebarItem
                to="/inventory/new"
                icon={PlusCircle}
                label="Nuevo Producto"
              />
            )}
            {check("inventory", "create") && (
              <SidebarItem
                to="/inventory/recipes"
                icon={ChefHat}
                label="Gestor de Recetas"
              />
            )}
          </SidebarGroup>
        )}

        <div className="mt-6 mb-2">
          <p className="px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            Finanzas
          </p>
        </div>

        {showTreasuryGroup && (
          <SidebarGroup
            label="Tesorería"
            icon={Wallet}
            basePath="/treasury" // 👈 Solo necesita esta base
          >
            {check("purchases", "payable") && (
              <SidebarItem
                to="/treasury/payables" // 👈 RUTA CORRECTA
                icon={AlertCircle}
                label="Cuentas por Pagar"
              />
            )}
            {check("purchases", "budgets") && (
              <SidebarItem
                to="/treasury/budgets" // 👈 RUTA CORRECTA
                icon={Target}
                label="Presupuestos"
              />
            )}
          </SidebarGroup>
        )}
      </nav>

      <ExchangeRateWidget />

      {/* Footer */}
      <div className="p-4 border-t border-slate-800 bg-slate-900">
        <button
          onClick={logout}
          className="flex items-center justify-center space-x-2 text-slate-400 hover:text-white hover:bg-red-600/90 w-full p-2.5 rounded-lg transition-all duration-200"
        >
          <LogOut size={18} />
          <span className="font-medium text-sm">Cerrar Sesión</span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
