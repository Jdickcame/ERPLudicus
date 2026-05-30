import {
    Activity,
    Bluetooth,
    CheckCircle,
    Play,
    Printer,
    Save,
    Search,
} from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { BluetoothPrinter } from "../../../utils/BluetoothPrinter";

const PrinterConfig = () => {
  const [devices, setDevices] = useState<any[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<any | null>(null);

  // Estados de conexión
  const [status, setStatus] = useState<
    "Desconectado" | "Conectando..." | "Conectado"
  >("Desconectado");
  const [savedMac, setSavedMac] = useState<string | null>(null);

  useEffect(() => {
    const mac = localStorage.getItem("impresora_mac");
    const name = localStorage.getItem("impresora_nombre");

    if (mac) {
      setSavedMac(mac);
      setSelectedDevice({ name: name || "Impresora Guardada", address: mac });

      // Le preguntamos a la antena Bluetooth si sigue conectada
      if ((window as any).bluetoothSerial) {
        (window as any).bluetoothSerial.isConnected(
          () => setStatus("Conectado"), // Si la antena dice que sí, pintamos verde
          () => setStatus("Desconectado"), // Si dice que no, pintamos rojo
        );
      }
    }
  }, []);

  const handleScan = async () => {
    setIsScanning(true);
    setDevices([]);
    try {
      const isEnabled = await BluetoothPrinter.isEnabled();
      if (!isEnabled) {
        toast.error("Por favor, enciende el Bluetooth de la tablet.");
        setIsScanning(false);
        return;
      }

      const foundDevices = await BluetoothPrinter.listDevices();
      setDevices(foundDevices);

      if (foundDevices.length === 0) {
        toast.error(
          "No se encontraron impresoras. Verifica que esté vinculada en los ajustes de Android.",
        );
      } else {
        toast.success(`${foundDevices.length} dispositivos encontrados`);
      }
    } catch (error) {
      toast.error("Error al escanear Bluetooth.");
      console.error(error);
    } finally {
      setIsScanning(false);
    }
  };

  const handleConnect = async () => {
    if (!selectedDevice)
      return toast.error("Selecciona una impresora de la lista.");

    setStatus("Conectando...");
    try {
      await BluetoothPrinter.connect(selectedDevice.address);
      setStatus("Conectado");
      toast.success("¡Impresora conectada exitosamente!");
    } catch (error) {
      setStatus("Desconectado");
      toast.error(
        "No se pudo conectar. Verifica que la impresora esté encendida.",
      );
      console.error(error);
    }
  };

  const handleTestPrint = async () => {
    if (status !== "Conectado")
      return toast.error("Debes conectar la impresora primero.");

    const testTicket = {
      invoiceTypeLabel: "TICKET DE PRUEBA",
      invoiceNumber: "TEST-00000001",
      date: new Date().toLocaleString("es-PE"),
      customer: "SISTEMA KENSIS POS",
      items: [{ qty: 1, name: "CONFIG. EXITOSA", subtotal: 0.0 }],
      total: 0.0,
      amountInWords: "CERO SOLES",
    };

    try {
      toast.success("Enviando impresión...");
      await BluetoothPrinter.printTicketESC(testTicket);

      // Opcional: Desconectamos después de probar para liberar el Bluetooth
      //   await BluetoothPrinter.disconnect();
      //   setStatus("Desconectado");
      toast.success("¡Prueba finalizada!");
    } catch (error) {
      toast.error("Error al imprimir el ticket de prueba.");
      console.error(error);
    }
  };

  const handleSaveConfig = () => {
    if (!selectedDevice)
      return toast.error("No hay ninguna impresora seleccionada.");

    // 👇 ESTO GUARDA LA CONFIGURACIÓN PARA SIEMPRE 👇
    localStorage.setItem("impresora_mac", selectedDevice.address);
    localStorage.setItem("impresora_nombre", selectedDevice.name);
    setSavedMac(selectedDevice.address);

    toast.success("¡Configuración guardada para siempre!");
  };

  return (
    <div className="bg-slate-900 text-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-700 overflow-hidden flex flex-col h-[600px]">
      {/* HEADER DEL WIDGET */}
      <div className="bg-slate-800 p-5 border-b border-slate-700">
        <h2 className="text-xl font-black flex items-center gap-2 text-cyan-400">
          <Printer size={24} /> Configuración de Impresora
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Conecta y prueba tu impresora Bluetooth ESC/POS
        </p>
      </div>

      <div className="flex-1 p-5 overflow-y-auto custom-scrollbar flex flex-col gap-5">
        {/* PANEL DE ESTADO */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-800 p-3 rounded-xl border border-slate-700 flex flex-col justify-center items-center text-center">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">
              ESTADO
            </span>
            <div
              className={`flex items-center gap-1.5 font-bold text-sm ${status === "Conectado" ? "text-green-400" : status === "Conectando..." ? "text-yellow-400" : "text-red-400"}`}
            >
              <Activity
                size={14}
                className={status === "Conectando..." ? "animate-pulse" : ""}
              />
              {status}
            </div>
          </div>
          <div className="bg-slate-800 p-3 rounded-xl border border-slate-700 flex flex-col justify-center items-center text-center">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">
              BLUETOOTH
            </span>
            <div
              className={`flex items-center gap-1.5 font-bold text-sm ${isScanning ? "text-cyan-400" : "text-slate-300"}`}
            >
              <Search size={14} className={isScanning ? "animate-spin" : ""} />
              {isScanning ? "Buscando..." : "Inactivo"}
            </div>
          </div>
        </div>

        {/* ÁREA DE SELECCIÓN */}
        <div className="flex flex-col gap-2 flex-1">
          <div className="flex justify-between items-end mb-1">
            <span className="text-xs font-bold text-slate-400 uppercase">
              Dispositivos Vinculados
            </span>
            <button
              onClick={handleScan}
              disabled={isScanning}
              className="text-xs bg-cyan-600 hover:bg-cyan-500 text-white px-3 py-1.5 rounded-lg font-bold transition disabled:opacity-50 flex items-center gap-1.5"
            >
              <Search size={12} /> Escanear
            </button>
          </div>

          <div className="bg-slate-800 rounded-xl border border-slate-700 flex-1 overflow-y-auto p-2 min-h-[150px]">
            {devices.length === 0 && !selectedDevice && (
              <div className="h-full flex flex-col justify-center items-center text-slate-500 opacity-50">
                <Bluetooth size={32} className="mb-2" />
                <p className="text-xs text-center px-4">
                  Presiona "Escanear" para buscar impresoras cercanas
                </p>
              </div>
            )}

            {/* Muestra el dispositivo guardado si aún no se ha escaneado nada */}
            {devices.length === 0 && selectedDevice && !isScanning && (
              <div className="bg-cyan-900/30 border border-cyan-700 p-3 rounded-lg flex justify-between items-center cursor-pointer">
                <div>
                  <p className="text-sm font-bold text-cyan-300 flex items-center gap-2">
                    <Bluetooth size={14} /> {selectedDevice.name}
                  </p>
                  <p className="text-[10px] text-cyan-500/70 font-mono mt-0.5">
                    {selectedDevice.address}
                  </p>
                </div>
                <CheckCircle size={18} className="text-cyan-400" />
              </div>
            )}

            {/* Lista de dispositivos escaneados */}
            {devices.map((device, index) => (
              <div
                key={index}
                onClick={() => {
                  setSelectedDevice(device);
                  setStatus("Desconectado"); // Reseteamos el estado si cambia de impresora
                }}
                className={`p-3 rounded-lg flex justify-between items-center cursor-pointer transition-all mb-1.5 ${selectedDevice?.address === device.address ? "bg-cyan-600 border border-cyan-500" : "bg-slate-700/50 border border-transparent hover:bg-slate-700"}`}
              >
                <div>
                  <p
                    className={`text-sm font-bold flex items-center gap-2 ${selectedDevice?.address === device.address ? "text-white" : "text-slate-300"}`}
                  >
                    <Bluetooth size={14} />{" "}
                    {device.name || "Impresora Desconocida"}
                  </p>
                  <p
                    className={`text-[10px] font-mono mt-0.5 ${selectedDevice?.address === device.address ? "text-cyan-100" : "text-slate-500"}`}
                  >
                    {device.address}
                  </p>
                </div>
                {savedMac === device.address &&
                  selectedDevice?.address !== device.address && (
                    <span className="text-[9px] bg-slate-600 text-slate-300 px-1.5 py-0.5 rounded font-bold">
                      GUARDADA
                    </span>
                  )}
                {selectedDevice?.address === device.address && (
                  <CheckCircle size={18} className="text-white" />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* BOTONERA DE ACCIONES INFERIOR */}
      <div className="bg-slate-800 p-4 border-t border-slate-700 flex flex-col gap-2.5">
        <div className="flex gap-2.5">
          <button
            onClick={handleConnect}
            disabled={!selectedDevice || status === "Conectado"}
            className="flex-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2.5 rounded-xl font-bold text-sm transition flex items-center justify-center gap-2"
          >
            <Bluetooth size={16} /> Conectar
          </button>

          <button
            onClick={handleTestPrint}
            disabled={status !== "Conectado"}
            className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white py-2.5 rounded-xl font-bold text-sm transition flex items-center justify-center gap-2"
          >
            <Play size={16} /> Probar Ticket
          </button>
        </div>

        <button
          onClick={handleSaveConfig}
          disabled={!selectedDevice}
          className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 rounded-xl font-black transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/20"
        >
          <Save size={18} /> GUARDAR CONFIGURACIÓN
        </button>
      </div>
    </div>
  );
};

export default PrinterConfig;
