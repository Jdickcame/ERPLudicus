import { Capacitor } from "@capacitor/core";
import { type JSX } from "react";
import { Toaster } from "react-hot-toast";
import {
  HashRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";

import { AuthProvider } from "./context/AuthContext";
import { BranchProvider } from "./context/BranchContext";

// --- PÁGINAS ---
import Layout from "./components/layout/Layout";
import PosLogin from "./pages/auth/PosLogin";
import Dashboard from "./pages/dashboard/Dashboard";
import Login from "./pages/Login";

// Inventario
import InventoryPage from "./pages/inventory/InventoryPage";
import NewAdjustment from "./pages/inventory/NewAdjustment";
import PhysicalInventory from "./pages/inventory/PhysicalInventory";
import ProductForm from "./pages/inventory/ProductForm";
import ProductKardex from "./pages/inventory/ProductKardex";
import Products from "./pages/inventory/Products";
import RecipeManager from "./pages/inventory/RecipeManager";
import TransfersPage from "./pages/inventory/TransfersPage";

// Compras
import EditPurchase from "./pages/purchases/EditPurchase";
import NewPurchase from "./pages/purchases/NewPurchase";
import PurchaseList from "./pages/purchases/PurchaseList";
import Suppliers from "./pages/purchases/Suppliers";
// 👇 NUEVAS IMPORTACIONES DE OC 👇
import NewPurchaseOrder from "./pages/purchases/NewPurchaseOrder";
import PurchaseOrderList from "./pages/purchases/PurchaseOrderList";

// Tesorería
import AccountsPayable from "./pages/treasury/AccountsPayable";
import Budgets from "./pages/treasury/Budgets";
import SupplierStatement from "./pages/treasury/SupplierStatement";

// Ventas
import PointOfSale from "./pages/pos/PointOfSale";
import PosHistory from "./pages/pos/PosHistory";
import PosReports from "./pages/pos/PosReports";
import NewWebSale from "./pages/sales/NewWebSale";
import SaleList from "./pages/sales/SaleList";

// Eventos
import EventCreatePage from "./pages/events/EventCreatePage";
import EventListPage from "./pages/events/EventListPage";
import EventTaquillaPage from "./pages/events/EventTaquillaPage";
import NewRegistrationPage from "./pages/events/NewRegistrationPage";

// Caja
import AdminCashAudit from "./pages/cash/AdminCashAudit";
import CashPage from "./pages/cash/CashPage";
import CashRegistersPage from "./pages/cash/CashRegistersPage";

// Usuarios y Core
import PermissionRoute from "./components/routes/PermissionRoute";
import ExchangeRates from "./pages/core/ExchangeRates";
import EventEditPage from "./pages/events/EventEditPage";
import AdminMonitor from "./pages/pos/AdminMonitor";
import MermasReport from "./pages/reports/MermasReport";
import ProductSalesReport from "./pages/reports/ProductSalesReport";
import UserList from "./pages/users/UserList";

// ======================================================================
// 1. EL CEREBRO: DETECTOR DE HARDWARE
// ======================================================================
const isNativePos = () => {
  return Capacitor.isNativePlatform();
};

// ======================================================================
// 2. EL GUARDIÁN PRINCIPAL
// ======================================================================
const ProtectedRoute = ({ children }: { children: JSX.Element }) => {
  const token = localStorage.getItem("access_token");
  const location = useLocation();

  if (!token) {
    if (isNativePos() || location.pathname.startsWith("/pos")) {
      return <Navigate to="/pos-login" state={{ from: location }} replace />;
    }
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (isNativePos() && !location.pathname.startsWith("/pos")) {
    return <Navigate to="/pos" replace />;
  }

  return children;
};

// ======================================================================
// 3. EL ENRUTADOR INTELIGENTE
// ======================================================================
const SmartRootRedirect = () => {
  const token = localStorage.getItem("access_token");

  if (!token) {
    return isNativePos() ? (
      <Navigate to="/pos-login" replace />
    ) : (
      <Navigate to="/login" replace />
    );
  } else {
    return isNativePos() ? (
      <Navigate to="/pos" replace />
    ) : (
      <Navigate to="/dashboard" replace />
    );
  }
};

function App() {
  return (
    <HashRouter>
      <AuthProvider>
        <BranchProvider>
          <Toaster position="top-right" reverseOrder={false} />

          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/pos-login" element={<PosLogin />} />
            <Route path="/" element={<SmartRootRedirect />} />

            <Route
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route path="/dashboard" element={<Dashboard />} />

              <Route element={<PermissionRoute module="users" />}>
                <Route path="/users" element={<UserList />} />
              </Route>

              {/* ZONA DE VENTAS */}
              <Route element={<PermissionRoute module="sales" />}>
                <Route path="/sales" element={<SaleList />} />
                <Route path="/sales/new" element={<NewWebSale />} />

                <Route path="/pos" element={<PointOfSale />} />
                <Route path="/pos/history" element={<PosHistory />} />
                <Route path="/pos/reports" element={<PosReports />} />
                <Route path="/pos/cash" element={<CashPage />} />
                <Route path="/pos/monitor" element={<AdminMonitor />} />
              </Route>

              {/* ZONA CAJA */}
              <Route element={<PermissionRoute module="cash" />}>
                <Route path="/cash" element={<CashPage />} />
                <Route path="/cash/audit" element={<AdminCashAudit />} />
                <Route path="/cash/registers" element={<CashRegistersPage />} />
              </Route>

              {/* ZONA COMPRAS Y TESORERÍA */}
              <Route element={<PermissionRoute module="purchases" />}>
                <Route path="/purchases" element={<PurchaseList />} />
                <Route path="/purchases/new" element={<NewPurchase />} />
                <Route path="/purchases/edit/:id" element={<EditPurchase />} />
                <Route path="/purchases/suppliers" element={<Suppliers />} />

                {/* 👇 NUEVAS RUTAS DE ÓRDENES DE COMPRA 👇 */}
                <Route
                  path="/purchases/orders"
                  element={<PurchaseOrderList />}
                />
                <Route
                  path="/purchases/orders/new"
                  element={<NewPurchaseOrder />}
                />

                <Route
                  path="/treasury/payables"
                  element={<AccountsPayable />}
                />
                <Route
                  path="/treasury/payables/:id/statement"
                  element={<SupplierStatement />}
                />
                <Route path="/treasury/budgets" element={<Budgets />} />
              </Route>

              {/* ZONA INVENTARIO */}
              <Route element={<PermissionRoute module="inventory" />}>
                <Route path="/inventory/products" element={<Products />} />
                <Route path="/inventory/new" element={<ProductForm />} />
                <Route path="/inventory/edit/:id" element={<ProductForm />} />
                <Route path="/inventory" element={<InventoryPage />} />
                <Route path="/inventory/recipes" element={<RecipeManager />} />
                <Route
                  path="/inventory/audit"
                  element={<PhysicalInventory />}
                />
                <Route
                  path="/inventory/adjustments/new"
                  element={<NewAdjustment />}
                />
                <Route
                  path="/inventory/kardex/:id"
                  element={<ProductKardex />}
                />
                <Route
                  path="/inventory/transfers"
                  element={<TransfersPage />}
                />
                <Route
                  path="/reports/product-sales"
                  element={<ProductSalesReport />}
                />
                <Route path="/reports/mermas" element={<MermasReport />} />
              </Route>

              {/* ZONA EVENTOS */}
              <Route path="/events" element={<EventListPage />} />
              <Route path="/events/create" element={<EventCreatePage />} />
              <Route path="/events/:eventId/edit" element={<EventEditPage />} />
              <Route
                path="/events/:eventId/taquilla"
                element={<EventTaquillaPage />}
              />
              <Route path="/events/new" element={<NewRegistrationPage />} />

              <Route
                path="/config/exchange-rates"
                element={<ExchangeRates />}
              />
            </Route>

            <Route path="*" element={<SmartRootRedirect />} />
          </Routes>
        </BranchProvider>
      </AuthProvider>
    </HashRouter>
  );
}

export default App;
