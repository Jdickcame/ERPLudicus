import { useEffect } from "react";
import api from "../../../api/axios";
import { db } from "../../../db/database";

const SyncWorker = () => {
  useEffect(() => {
    // Esta función hace el trabajo pesado sin interrumpir al cajero
    const syncPendingData = async () => {
      // 1. Si no hay internet, no hacemos nada
      if (!navigator.onLine) return;

      try {
        // --- A. SINCRONIZAR VENTAS PENDIENTES ---
        const pendingSales = await db.sales
          .where("sync_status")
          .equals("PENDING")
          .toArray();

        if (pendingSales.length > 0) {
          console.log(
            `🚀 Sincronizando ${pendingSales.length} ventas locales a SUNAT/Django...`,
          );

          const payloads = pendingSales.map((s) => s.payload);

          const res = await api.post("/sales/sales/bulk_sync/", payloads);

          if (res.status === 200 || res.status === 201) {
            // 👇 EL DETECTIVE DE FANTASMAS EN ACCIÓN 👇
            // Django nos devolvió 200 OK, pero debemos leer el JSON para ver cuáles pasaron y cuáles fallaron.

            let syncedUuids: string[] = [];
            let backendErrors: any[] = [];

            // Caso 1: Django devuelve { successes: [...], errors: [...] }
            if (res.data && res.data.successes) {
              syncedUuids = res.data.successes.map((s: any) =>
                typeof s === "object" ? s.uuid : s,
              );
              backendErrors = res.data.errors || [];
            }
            // Caso 2: Django devuelve un array con las ventas creadas (DRF Estándar)
            else if (Array.isArray(res.data)) {
              syncedUuids = res.data.map((s: any) => s.uuid).filter(Boolean);
            }
            // Caso 3: Django devuelve explícitamente { errors: [...] }
            else if (res.data && res.data.errors) {
              const errorUuids = res.data.errors.map((e: any) => e.uuid);
              // Filtramos: Las que NO están en la lista de errores, asumimos que pasaron
              syncedUuids = pendingSales
                .map((s) => s.uuid)
                .filter((id) => !errorUuids.includes(id));
              backendErrors = res.data.errors;
            }
            // Caso Extremo: Respuesta indescifrable
            else {
              console.warn(
                "⚠️ Respuesta de bulk_sync desconocida. No se borrarán ventas por seguridad:",
                res.data,
              );
            }

            if (syncedUuids.length > 0) {
              // 🌟 LA REGLA DE ORO: ACTUALIZAMOS SÓLO LAS VERDADERAMENTE EXITOSAS 🌟
              await db.sales
                .where("uuid")
                .anyOf(syncedUuids)
                .modify({ sync_status: "SYNCED" });

              console.log(
                `✅ ${syncedUuids.length} ventas confirmadas por Django y marcadas como SYNCED.`,
              );
            }

            if (backendErrors.length > 0) {
              console.error(
                `🛑 Atención: Django rechazó ${backendErrors.length} ventas locales en el bulk. Se quedarán como PENDING:`,
                backendErrors,
              );
            }
          }
        }

        // --- B. SINCRONIZAR MOVIMIENTOS DE CAJA PENDIENTES ---
        if (db.pending_movements) {
          const pendingMovements = await db.pending_movements.toArray();
          if (pendingMovements.length > 0) {
            console.log(
              `🚀 Sincronizando ${pendingMovements.length} movimientos de caja locales...`,
            );

            const res = await api.post(
              "/cash/movements/bulk_sync/",
              pendingMovements,
            );

            if (res.status === 200 || res.status === 201) {
              // Aplicamos la misma lógica por seguridad para no perder movimientos de caja
              let syncedUuids: string[] = [];
              if (res.data && res.data.successes) {
                syncedUuids = res.data.successes.map((s: any) => s.uuid || s);
              } else if (Array.isArray(res.data)) {
                syncedUuids = res.data.map((m: any) => m.uuid).filter(Boolean);
              } else {
                syncedUuids = pendingMovements.map((m) => m.uuid);
              }

              if (syncedUuids.length > 0) {
                await db.pending_movements.bulkDelete(syncedUuids);
                console.log(
                  `✅ ${syncedUuids.length} movimientos de caja sincronizados con éxito.`,
                );
              }
            }
          }
        }
      } catch (error: any) {
        console.error(
          "⚠️ Sincronización en segundo plano interrumpida. Se reintentará luego:",
          error.message || error,
        );
      }
    };

    // 2. Ejecutar al cargar la pantalla por primera vez
    syncPendingData();

    // 3. Ejecutar automáticamente cada 30 segundos
    const interval = setInterval(syncPendingData, 30000);

    // 4. Ejecutar INSTANTÁNEAMENTE cuando la computadora recupere el WiFi
    window.addEventListener("online", syncPendingData);

    return () => {
      clearInterval(interval);
      window.removeEventListener("online", syncPendingData);
    };
  }, []);

  return null;
};

export default SyncWorker;
