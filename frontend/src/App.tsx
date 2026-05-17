import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/layout/Layout";
import Dashboard from "./pages/dashboard/Dashboard";
import Login from "./pages/Login";

// Inventario
import InventoryPage from "./pages/inventory/InventoryPage"; // Inventario Físico (Stock + Valorizado)
import NewAdjustment from "./pages/inventory/NewAdjustment";
import ProductForm from "./pages/inventory/ProductForm";
import ProductKardex from "./pages/inventory/ProductKardex";
import Products from "./pages/inventory/Products";
import RecipeManager from "./pages/inventory/RecipeManager";
import TransfersPage from "./pages/inventory/TransfersPage";

// Compras
import AccountsPayable from "./pages/purchases/AccountsPayable";
import Budgets from "./pages/purchases/Budgets";
import NewPurchase from "./pages/purchases/NewPurchase";
import PurchaseList from "./pages/purchases/PurchaseList";
import Suppliers from "./pages/purchases/Suppliers";

// Ventas
import PointOfSale from "./pages/pos/PointOfSale";
import PosHistory from "./pages/pos/PosHistory";
import PosReports from "./pages/pos/PosReports";
import SaleList from "./pages/sales/SaleList";

// Caja
import CashPage from "./pages/cash/CashPage";

import PosLogin from "./pages/auth/PosLogin";

// Usuarios
import type { JSX } from "react";
import { AuthProvider } from "./context/AuthContext";
import { BranchProvider } from "./context/BranchContext";
import UserList from "./pages/users/UserList";

// 👇 IMPORTAMOS EL NUEVO COMPONENTE DE SEGURIDAD
import PermissionRoute from "./components/routes/PermissionRoute";
import ExchangeRates from "./pages/core/ExchangeRates";
import EditPurchase from "./pages/purchases/EditPurchase";
import SupplierStatement from "./pages/purchases/SupplierStatement";

// --- COMPONENTE DE PROTECCIÓN BÁSICA (Solo verifica Token) ---
const ProtectedRoute = ({ children }: { children: JSX.Element }) => {
  const token = localStorage.getItem("access_token");
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return children;
};

function App() {
  return (
    <BrowserRouter>
      {/* 1. Proveer Autenticación */}
      <AuthProvider>
        {/* 2. Proveer Sedes */}
        <BranchProvider>
          <Routes>
            {/* Ruta Pública */}
            <Route path="/login" element={<Login />} />

            <Route path="/pos-login" element={<PosLogin />} />

            {/* RUTAS PROTEGIDAS (Requieren Login + Layout) */}
            <Route
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              {/* 🟢 ZONA LIBRE (Todos los empleados entran) */}
              <Route path="/dashboard" element={<Dashboard />} />

              {/* 🔴 ZONA USUARIOS (Solo permiso 'users' o Admin) */}
              <Route element={<PermissionRoute module="users" />}>
                <Route path="/users" element={<UserList />} />
              </Route>

              {/* 🟠 ZONA VENTAS (Solo permiso 'sales' o Admin) */}
              <Route element={<PermissionRoute module="sales" />}>
                <Route path="/sales" element={<SaleList />} />
                <Route path="/pos" element={<PointOfSale />} />
                <Route path="/pos/history" element={<PosHistory />} />
                <Route path="/pos/reports" element={<PosReports />} />
              </Route>

              {/* 🟢 ZONA DE CAJA */}
              <Route element={<PermissionRoute module="cash" />}>
                <Route path="/cash" element={<CashPage />} />
                <Route path="/pos/cash" element={<CashPage />} />
              </Route>

              {/* 🔵 ZONA COMPRAS (Solo permiso 'purchases' o Admin) */}
              <Route element={<PermissionRoute module="purchases" />}>
                <Route path="/purchases" element={<PurchaseList />} />
                <Route path="/purchases/new" element={<NewPurchase />} />
                <Route path="/purchases/edit/:id" element={<EditPurchase />} />

                {/* 👇 AGREGA ESTA LÍNEA QUE ES LA QUE FALTA 👇 */}
                <Route path="/purchases/suppliers" element={<Suppliers />} />

                <Route
                  path="/purchases/suppliers/:id/statement"
                  element={<SupplierStatement />}
                />
                <Route
                  path="/purchases/payable"
                  element={<AccountsPayable />}
                />
                <Route path="/purchases/budgets" element={<Budgets />} />
              </Route>

              {/* 🟣 ZONA INVENTARIO (ACTUALIZADA) */}
              <Route element={<PermissionRoute module="inventory" />}>
                {/* 1. Gestión de Productos (Catálogo Global) */}
                <Route path="/inventory/products" element={<Products />} />
                <Route path="/inventory/new" element={<ProductForm />} />

                {/* 2. Gestión de Stock Físico (Por Sede) */}
                <Route path="/inventory" element={<InventoryPage />} />

                <Route path="/inventory/recipes" element={<RecipeManager />} />

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
              </Route>

              <Route
                path="/config/exchange-rates"
                element={<ExchangeRates />}
              />
            </Route>

            {/* Redirección por defecto */}
            <Route path="/" element={<Navigate to="/dashboard" replace />} />

            {/* Ruta 404: Cualquier ruta desconocida va al dashboard */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BranchProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
