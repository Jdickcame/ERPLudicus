import Dexie, { type Table } from "dexie";

// --- INTERFACES (Estructura de los datos) ---

export interface LocalProductStock {
  quantity: number;
  selling_price: number | null;
  price: number;
  average_cost: number;
  stock_id: number;
  is_enabled: boolean;
}

export interface LocalProduct {
  id: number;
  name: string;
  sku: string;
  price: string | number;
  stock: LocalProductStock | number;
  category_name?: string;
  product_type: string;
  manage_stock: boolean;
  is_sellable: boolean;
  colab_price?: string | number | null;
  is_group?: boolean;
  parent?: number | null;
  parent_name?: string | null;
  has_variants?: boolean;
}

export interface LocalCustomer {
  id: number;
  name: string;
  tax_id: string; // RUC o DNI
  document_type: string;
  address?: string;
}

// Tabla para autorizaciones Offline (PIN de Supervisores)
export interface LocalUser {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  role: string; // "ADMIN", "MANAGER", "CASHIER"
  pin: string; // El PIN de 4 o 6 dígitos para validar offline
  can_authorize_voids?: boolean; // Permiso para autorizaciones
}

// Tabla para sedes (disponible offline)
export interface LocalBranch {
  id: number;
  name: string;
  code: string;
  address: string;
  phone: string;
}

// Tabla de ventas local
export interface LocalSale {
  uuid: string; // Universal Unique ID (Generado por React)
  id?: number;
  local_invoice_number: string;
  date: string;
  total: number;
  sync_status: "PENDING" | "SYNCED" | "ERROR";
  payload: any;
}

export interface LocalShift {
  id: number | string;
  opened_at: string;
  initial_balance: number;
  status: "OPEN" | "CLOSED";
  branch_id: number;
}

export interface PendingMovement {
  uuid: string;
  [key: string]: any;
}

// --- CLASE DE BASE DE DATOS DEXIE ---
export class PosDatabase extends Dexie {
  products!: Table<LocalProduct, number>;
  customers!: Table<LocalCustomer, number>;
  users!: Table<LocalUser, number>;
  sales!: Table<LocalSale, string>; // PK es un string (UUID)
  shifts!: Table<LocalShift, number | string>;

  pending_movements!: Table<PendingMovement, string>;
  branches!: Table<LocalBranch, number>;

  constructor() {
    super("KensisPOSDatabase");

    // DEFINICIÓN DE ESQUEMA E ÍNDICES DE BÚSQUEDA RÁPIDA
    // El primer valor es la Primary Key. Los siguientes son los que usaremos para buscar.
    this.version(5).stores({
      products: "id, sku, name",
      customers: "id, tax_id, name",
      users: "id, role, pin",
      sales: "uuid, local_invoice_number, sync_status, date",
      shifts: "id, status, branch_id",
      branches: "id, code, name",
      pending_movements: "uuid, sync_status",
    });
  }
}

// Exportamos la instancia única lista para usarse en todo React
export const db = new PosDatabase();
