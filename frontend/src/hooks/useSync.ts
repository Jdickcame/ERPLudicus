import { useCallback, useEffect, useState } from "react";
import api from "../api/axios"; // Ajusta esta ruta a tu axios
import { db } from "../db/database"; // Ajusta esta ruta a tu database.ts

export const useSync = (branchId: number | undefined) => {
  const [isSyncing, setIsSyncing] = useState(false);

  // 1. DESCARGAR LA NUBE AL DISCO DURO (PULL)
  const downloadData = useCallback(async () => {
    if (!branchId || !navigator.onLine) return;

    try {
      setIsSyncing(true);
      // Hacemos las peticiones en paralelo para no hacer esperar al cajero
      const [prodRes, custRes, usersRes, branchesRes] = await Promise.all([
        api.get(`/inventory/products/?branch_id=${branchId}&for_pos=true`),
        api.get("/sales/customers/"),
        api.get("/users/pos-users/"),
        api.get("/branches/"),
      ]);

      const products = prodRes.data.results || prodRes.data;
      const customers = custRes.data.results || custRes.data;
      const users = usersRes.data.results || usersRes.data;
      const branches = branchesRes.data.results || branchesRes.data;

      // bulkPut inserta los nuevos y actualiza los que ya existen
      await db.products.bulkPut(products);
      await db.customers.bulkPut(customers);
      await db.users.bulkPut(users);
      await db.branches.bulkPut(branches);
    } catch (error) {
      console.error("⚠️ Error descargando catálogo a Dexie:", error);
    } finally {
      setIsSyncing(false);
    }
  }, [branchId]);

  // 2. SUBIR VENTAS LOCALES A LA NUBE (PUSH)
  const uploadPendingSales = useCallback(async () => {
    if (!navigator.onLine) return; // Si no hay internet, ni lo intenta

    // Buscamos solo las ventas que faltan subir
    const pendingSales = await db.sales
      .where("sync_status")
      .equals("PENDING")
      .toArray();
    if (pendingSales.length === 0) return;

    for (const sale of pendingSales) {
      try {
        // Le mandamos a Django el payload exacto de la venta
        await api.post("/sales/sales/", sale.payload);

        // ¡Éxito! Marcamos la venta como sincronizada en Dexie
        await db.sales.update(sale.uuid, { sync_status: "SYNCED" });
      } catch (error: any) {
        // Si Django rechaza la venta (Ej: PIN incorrecto o error 400), la marcamos como ERROR para no trabar el ciclo
        if (
          error.response &&
          error.response.status >= 400 &&
          error.response.status < 500
        ) {
          await db.sales.update(sale.uuid, { sync_status: "ERROR" });
          console.error(
            `Venta ${sale.local_invoice_number} rechazada por el servidor.`,
          );
        }
      }
    }
  }, []);

  // 3. EL CICLO DE VIDA (Trabajador Automático)
  useEffect(() => {
    if (!branchId) return;

    // Al entrar al sistema, descarga todo el catálogo
    downloadData();

    // Y cada 30 segundos, intenta subir ventas pendientes (si las hay)
    const interval = setInterval(() => {
      uploadPendingSales();
    }, 30000);

    return () => clearInterval(interval);
  }, [branchId, downloadData, uploadPendingSales]);

  return { isSyncing, downloadData, uploadPendingSales };
};
