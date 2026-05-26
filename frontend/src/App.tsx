import { type JSX } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/layout/Layout";
import Dashboard from "./pages/dashboard/Dashboard";
import Login from "./pages/Login";

// Inventario
import InventoryPage from "./pages/inventory/InventoryPage";
import NewAdjustment from "./pages/inventory/NewAdjustment";
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
import SupplierStatement from "./pages/purchases/SupplierStatement";

// Tesorería (¡Las nuevas rutas!)
import AccountsPayable from "./pages/treasury/AccountsPayable";
import Budgets from "./pages/treasury/Budgets";

// Ventas
import PointOfSale from "./pages/pos/PointOfSale";
import PosHistory from "./pages/pos/PosHistory";
import PosReports from "./pages/pos/PosReports";
import SaleList from "./pages/sales/SaleList";

// Caja
import CashPage from "./pages/cash/CashPage";

// Autenticación y Contextos
import { AuthProvider } from "./context/AuthContext";
import { BranchProvider } from "./context/BranchContext";
import PosLogin from "./pages/auth/PosLogin";
import UserList from "./pages/users/UserList";

// Core / Seguridad
import PermissionRoute from "./components/routes/PermissionRoute";
import ExchangeRates from "./pages/core/ExchangeRates";

// --- COMPONENTE DE PROTECCIÓN BÁSICA ---
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
      <AuthProvider>
        <BranchProvider>
          <Routes>
            {/* RUTAS PÚBLICAS */}
            <Route path="/login" element={<Login />} />
            <Route path="/pos-login" element={<PosLogin />} />

            {/* RUTAS PROTEGIDAS */}
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

              <Route element={<PermissionRoute module="sales" />}>
                <Route path="/sales" element={<SaleList />} />
                <Route path="/pos" element={<PointOfSale />} />
                <Route path="/pos/history" element={<PosHistory />} />
                <Route path="/pos/reports" element={<PosReports />} />
              </Route>

              <Route element={<PermissionRoute module="cash" />}>
                <Route path="/cash" element={<CashPage />} />
                <Route path="/pos/cash" element={<CashPage />} />
              </Route>

              {/* ZONA COMPRAS Y TESORERÍA */}
              <Route element={<PermissionRoute module="purchases" />}>
                {/* 🔵 Compras */}
                <Route path="/purchases" element={<PurchaseList />} />
                <Route path="/purchases/new" element={<NewPurchase />} />
                <Route path="/purchases/edit/:id" element={<EditPurchase />} />
                <Route path="/purchases/suppliers" element={<Suppliers />} />
                <Route
                  path="/purchases/suppliers/:id/statement"
                  element={<SupplierStatement />}
                />

                {/* 🏦 Tesorería */}
                <Route
                  path="/treasury/payables"
                  element={<AccountsPayable />}
                />
                <Route path="/treasury/budgets" element={<Budgets />} />
              </Route>

              <Route element={<PermissionRoute module="inventory" />}>
                <Route path="/inventory/products" element={<Products />} />
                <Route path="/inventory/new" element={<ProductForm />} />
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

            {/* Redirecciones por defecto */}
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BranchProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
