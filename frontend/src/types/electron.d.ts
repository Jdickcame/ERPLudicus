export interface CompanyConfig {
  name: string;
  shortName: string;
  ruc: string;
}

export interface BranchData {
  name: string;
  address: string;
  phone: string;
}

export interface ElectronAPI {
  printTicket: (base64Pdf: string) => void;
  printLocalTicket: (data: TicketData) => void;
  printReport: (data: ReportData) => void;
  getCompanyConfig: () => Promise<CompanyConfig>;
}

export interface TicketData {
  branch?: BranchData | null;
  isCourtesy?: boolean;
  invoiceTypeLabel?: string;
  invoiceNumber?: string;
  date?: string;
  customer?: string;
  customerDoc?: string;
  address?: string;
  items?: Array<{
    qty: number;
    name: string;
    price: number;
    subtotal: number;
  }>;
  opGravada?: number;
  igv?: number;
  total?: number;
  payments?: Array<{
    method: string;
    amount: number;
  }>;
}

export interface ReportData {
  type: "HOURLY" | "PMIX" | "COURTESIES" | "Z_REPORT";
  status?: "OPEN" | "CLOSED";
  branch?: BranchData | null;
  hours?: Array<{
    timeLabel: string;
    count: number;
    net: number;
    gross: number;
  }>;
  items?: Array<{
    name: string;
    qty: number;
  }>;
  totalTickets?: number;
  totalGross?: number;
  totalCost?: number;
  cashierName?: string;
  registerName?: string;
  openedAt?: string;
  closedAt?: string;
  initialFund?: number;
  expectedCash?: number;
  expectedCard?: number;
  expectedTransfer?: number;
  declaredCash?: number;
  declaredCard?: number;
  declaredTransfer?: number;
  declaredTotal?: number;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
