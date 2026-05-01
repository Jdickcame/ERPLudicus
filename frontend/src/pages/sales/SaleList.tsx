import { Calendar, FileText, Plus, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/axios";
import BranchSelector from "../../components/common/BranchSelector";
import { useBranch } from "../../context/BranchContext";

// 👇 1. AGREGAMOS EL CAMPO sunat_pdf_url A LA INTERFAZ
interface Sale {
  id: number;
  customer_name: string;
  total: string;
  date: string;
  document_type: string;
  series: string;
  number: string;
  sunat_pdf_url?: string; // <--- NUEVO
}

const SaleList = () => {
  const { currentBranch } = useBranch();
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (!currentBranch) return;
    setLoading(true);
    api
      .get(`/sales/sales/?branch_id=${currentBranch.id}`)
      .then((res) => {
        setSales(Array.isArray(res.data) ? res.data : res.data.results);
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, [currentBranch]);

  // 👇 2. FUNCIÓN DE DESCARGA HÍBRIDA (INTELIGENTE)
  const downloadPDF = async (sale: Sale) => {
    // CASO A: SI YA TENEMOS EL PDF OFICIAL DE SUNAT
    if (sale.sunat_pdf_url) {
      // Abrimos el link directo de ApisPeru (Es público, no requiere token)
      window.open(sale.sunat_pdf_url, "_blank");
      return;
    }

    // CASO B: SI NO HAY LINK, DESCARGAMOS EL PDF INTERNO (Respaldo)
    try {
      // Usamos API (Axios) porque sí tiene el Token para evitar el error 401
      const response = await api.get(`/sales/sales/${sale.id}/pdf/`, {
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `venta_${sale.series}-${sale.number}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove(); // Limpieza
    } catch (error) {
      console.error("Error descargando PDF interno", error);
      alert("❌ No se pudo generar el PDF de esta venta.");
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-800">
              Historial de Ventas
            </h1>
            <BranchSelector />
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Transacciones en <strong>{currentBranch?.name}</strong>
          </p>
        </div>
        <button
          onClick={() => navigate("/pos")} // Verifica que la ruta sea la de tu POS
          className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700 transition shadow-sm"
        >
          <Plus size={20} /> Nueva Venta
        </button>
      </div>

      <div className="bg-white rounded-xl shadow border border-slate-200 overflow-hidden">
        <table className="w-full text-left text-sm text-slate-600">
          <thead className="bg-slate-50 border-b font-semibold uppercase text-xs text-slate-700">
            <tr>
              <th className="p-4"># Doc</th>
              <th className="p-4">Fecha</th>
              <th className="p-4">Cliente</th>
              <th className="p-4">Total</th>
              <th className="p-4 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-slate-400">
                  Cargando...
                </td>
              </tr>
            ) : sales.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-slate-400">
                  <div className="flex flex-col items-center gap-2">
                    <Search size={32} className="opacity-20" />
                    <p>No hay ventas registradas.</p>
                  </div>
                </td>
              </tr>
            ) : (
              sales.map((sale) => (
                <tr key={sale.id} className="hover:bg-slate-50 transition">
                  <td className="p-4 font-mono text-slate-500">
                    <span
                      className={`font-bold px-1.5 py-0.5 rounded text-[10px] mr-2 ${
                        sale.document_type === "FACTURA" ||
                        sale.series.startsWith("F")
                          ? "bg-purple-100 text-purple-700"
                          : "bg-blue-100 text-blue-700"
                      }`}
                    >
                      {sale.series.startsWith("F") ? "FAC" : "BOL"}
                    </span>
                    {sale.series}-{sale.number}
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <Calendar size={14} className="text-slate-400" />
                      {new Date(sale.date).toLocaleDateString()}
                      <span className="text-xs text-slate-300">
                        {new Date(sale.date).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  </td>
                  <td className="p-4 font-medium text-slate-800">
                    {sale.customer_name || "Cliente General"}
                  </td>
                  <td className="p-4 font-bold text-green-600">
                    S/ {parseFloat(sale.total).toFixed(2)}
                  </td>
                  <td className="p-4 text-right">
                    {/* 👇 3. PASAMOS EL OBJETO ENTERO */}
                    <button
                      onClick={() => downloadPDF(sale)}
                      className={`flex items-center gap-1 ml-auto transition px-3 py-1 rounded border ${
                        sale.sunat_pdf_url
                          ? "bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100" // Estilo si es Oficial
                          : "bg-slate-50 text-slate-500 hover:bg-slate-100 border-slate-200" // Estilo si es Interno
                      }`}
                      title={
                        sale.sunat_pdf_url
                          ? "Ver comprobante SUNAT"
                          : "Ver Ticket Interno"
                      }
                    >
                      <FileText size={16} /> PDF
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default SaleList;
