// src/types/index.ts

// --- GENERALES ---
export interface Option {
  value: string | number;
  label: string;
}

// --- SEDES Y USUARIOS ---
export interface Branch {
  id: number;
  name: string;
  code: string;
}

export interface User {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  branch?: number;

  // 👇 PERMISOS ADMINISTRATIVOS
  can_view_users?: boolean;

  // 👇 PERMISOS VENTAS
  can_view_pos?: boolean;
  can_view_sales_list?: boolean;

  // 👇 PERMISOS INVENTARIO
  can_view_products_list?: boolean;
  can_view_products_create?: boolean;

  // 👇 PERMISOS COMPRAS (NUEVOS)
  can_view_purchases_create?: boolean;
  can_view_purchases_list?: boolean;
  can_view_purchases_payable?: boolean;
  can_view_purchases_balances?: boolean;
  can_view_purchases_suppliers?: boolean;
  can_view_purchases_budgets?: boolean;

  // (Opcional) Los campos viejos por si acaso quedó algo pendiente,
  // aunque lo ideal es borrarlos si ya no los usas en el backend.
  can_view_sales?: boolean;
  can_view_inventory?: boolean;
  can_view_purchases?: boolean;
}

export interface Customer {
  id: number;
  name: string;
  tax_id: string; // RUC o DNI
  email?: string;
  phone?: string;
  address?: string;
}

// --- INVENTARIO Y PRODUCTOS ---
export interface Category {
  id: number;
  name: string;
}

export interface Product {
  id: number;
  name: string;
  sku: string;
  description?: string;
  category?: number; // ID de categoría
  price: string | number; // A veces el backend manda string "10.00"

  // Estos campos dependen del endpoint (si es /products/ o /stocks/)
  stock?: number;
  is_sellable?: boolean;
}

// Interfaz específica para cuando listas el inventario de una sede (tabla Stocks)
export interface StockItem {
  id: number;
  product: number; // ID del producto real
  product_name: string;
  product_sku: string;
  category_name: string;
  quantity: number; // Stock real en esa sede
  price: number;
}

// --- COMPRAS Y PROVEEDORES ---
export interface Supplier {
  id: number;
  name: string;
  tax_id: string;
  email?: string;
  phone?: string;
  balance?: string; // Saldo a favor
}

export interface ExpenseCategory {
  id: number;
  name: string;
}

export interface Purchase {
  id: number;
  supplier_name: string;
  branch_id: number;
  document_type: string;
  series: string;
  number: string;
  issue_date: string;
  total: number;
  payment_status: "PAID" | "PENDING";
  category_name: string;
}

export interface PurchaseDetail {
  product_id: number | null;
  description: string;
  quantity: number;
  unit_value: number;
  total_value: number;
}

export interface BudgetStatus {
  id?: number;
  area: string;
  area_label: string;
  limit: number;
  spent: number;
  remaining: number;
  is_negative: boolean;
  percentage: number;
}

// --- VENTAS (POS) ---
export interface Sale {
  id: number;
  customer_name: string;
  total: string;
  date: string;
  document_type: string;
  series: string;
  number: string;
  payment_method?: string;
}

// Útil para el carrito de compras
export interface CartItem extends Product {
  quantity: number;
}
