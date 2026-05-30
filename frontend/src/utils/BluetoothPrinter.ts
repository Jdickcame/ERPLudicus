export class BluetoothPrinter {
  static isEnabled(): Promise<boolean> {
    return new Promise((resolve) => {
      if (!(window as any).bluetoothSerial) resolve(false);
      (window as any).bluetoothSerial.isEnabled(
        () => resolve(true),
        () => resolve(false),
      );
    });
  }

  static isDeviceConnected(): Promise<boolean> {
    return new Promise((resolve) => {
      if (!(window as any).bluetoothSerial) resolve(false);
      (window as any).bluetoothSerial.isConnected(
        () => resolve(true),
        () => resolve(false),
      );
    });
  }

  static listDevices(): Promise<any[]> {
    return new Promise((resolve, reject) => {
      if (!(window as any).bluetoothSerial) reject("Bluetooth no disponible");
      (window as any).bluetoothSerial.list(
        (devices: any[]) => resolve(devices),
        (err: any) => reject(err),
      );
    });
  }

  static connect(macAddress: string): Promise<void> {
    return new Promise((resolve, reject) => {
      (window as any).bluetoothSerial.connect(
        macAddress,
        () => {
          setTimeout(() => resolve(), 500);
        },
        (err: any) => reject(err),
      );
    });
  }

  static disconnect(): Promise<void> {
    return new Promise((resolve, reject) => {
      (window as any).bluetoothSerial.disconnect(
        () => resolve(),
        (err: any) => reject(err),
      );
    });
  }

  // ========================================================
  // EL MOTOR DE RENDERIZADO IDÉNTICO A ELECTRON (PDF -> ESC/POS)
  // ========================================================
  static async printTicketESC(data: any): Promise<void> {
    // ESTILOS ESC/POS BÁSICOS
    const ESC_INIT = [0x1b, 0x40];
    const ALIGN_LEFT = [0x1b, 0x61, 0x00];
    const ALIGN_CENTER = [0x1b, 0x61, 0x01];
    const ALIGN_RIGHT = [0x1b, 0x61, 0x02];
    const BOLD_ON = [0x1b, 0x45, 0x01];
    const BOLD_OFF = [0x1b, 0x45, 0x00];
    const TEXT_NORMAL = [0x1d, 0x21, 0x00];
    const TEXT_DOUBLE_H = [0x1d, 0x21, 0x01];
    const CUT_PAPER = [0x1d, 0x56, 0x41, 0x10];

    const MAX_CHARS = 48; // Estándar 80mm

    let bytesArray: number[] = [];

    const appendCommand = (cmd: number[]) => {
      bytesArray = bytesArray.concat(cmd);
    };

    const appendText = (text: string) => {
      if (!text) return;
      const cleanText = text
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/ñ/g, "n")
        .replace(/Ñ/g, "N");
      for (let i = 0; i < cleanText.length; i++) {
        bytesArray.push(cleanText.charCodeAt(i));
      }
    };

    const drawLine = () => appendText("-".repeat(MAX_CHARS) + "\n");
    const padRight = (str: string, length: number) =>
      (str || "").substring(0, length).padEnd(length, " ");
    const padLeft = (str: string, length: number) =>
      (str || "").substring(0, length).padStart(length, " ");

    const printRow = (
      qty: string,
      desc: string,
      price: string,
      total: string,
    ) => {
      const cQty = padRight(qty, 5);
      const cDesc = padRight(desc, 22);
      const cPrice = padLeft(price, 9);
      const cTotal = padLeft(total, 12);
      appendText(`${cQty}${cDesc}${cPrice}${cTotal}\n`);
    };

    const printTotalLine = (
      label: string,
      value: string,
      isBold: boolean = false,
    ) => {
      if (isBold) appendCommand(BOLD_ON);
      const cLabel = padLeft(label, 34);
      const cValue = padLeft(value, 14);
      appendText(`${cLabel}${cValue}\n`);
      if (isBold) appendCommand(BOLD_OFF);
    };

    try {
      appendCommand(ESC_INIT);

      // ========================================================
      // MAGIA TIPO ELECTRON: Jalar datos globales de la empresa
      // ========================================================
      // 1. Datos de la Sede (Vienen del PointOfSale a través del parámetro 'data')
      const branchName = data.branch?.name || "";
      const address = data.branch?.address || "Dirección no disponible";
      const phone = data.branch?.phone ? `Telf. ${data.branch.phone}` : "";

      // 2. Datos de la Empresa Principal (Buscamos en localStorage)
      const companyName =
        localStorage.getItem("company_name") || "EMPRESA S.A.";
      const companyRuc = localStorage.getItem("company_ruc") || "20000000000";

      // CABECERA DEL TICKET
      appendCommand(ALIGN_CENTER);
      appendCommand(BOLD_ON);
      appendCommand(TEXT_DOUBLE_H);
      appendText(`${companyName}\n`); // Imprime el nombre de la empresa
      appendCommand(TEXT_NORMAL);

      // Imprimimos el nombre de la sede solo si es diferente al de la empresa
      if (
        branchName &&
        branchName.toUpperCase() !== companyName.toUpperCase()
      ) {
        appendText(`${branchName}\n`);
      }

      appendCommand(BOLD_OFF);

      appendText(`RUC: ${companyRuc}\n`);
      appendText(`${address}\n`);
      if (phone) appendText(`${phone}\n`);
      drawLine();

      // 2. TIPO DE COMPROBANTE
      const isCourtesy = data.isCourtesy || false;
      const titleLbl = isCourtesy
        ? "TICKET DE CORTESIA"
        : data.invoiceTypeLabel || "BOLETA DE VENTA";
      const seriesNum = data.invoiceNumber || "OFFLINE";

      appendCommand(BOLD_ON);
      appendText(`${titleLbl}\n`);
      appendCommand(BOLD_OFF);
      appendText(`${seriesNum}\n`);
      drawLine();

      // 3. DATOS DEL CLIENTE
      appendCommand(ALIGN_LEFT);
      appendText(`Fecha   : ${data.date || "-"}\n`);
      appendText(`Cliente : ${data.customer || "PUBLICO GENERAL"}\n`);
      const docClient =
        data.customerDoc && data.customerDoc !== "-"
          ? data.customerDoc
          : "00000000";
      appendText(`RUC/DNI : ${docClient}\n`);
      appendText(`Direcc. : ${data.address?.substring(0, 35) || "-"}\n`);
      drawLine();

      // 4. TABLA DE PRODUCTOS
      appendCommand(BOLD_ON);
      printRow("CANT", "DESCRIPCION", "PRECIO", "TOTAL");
      appendCommand(BOLD_OFF);
      drawLine();

      if (data.items && Array.isArray(data.items)) {
        data.items.forEach((item: any) => {
          printRow(
            String(item.qty),
            String(item.name),
            Number(item.price || 0).toFixed(2),
            Number(item.subtotal || 0).toFixed(2),
          );
        });
      }
      drawLine();

      // 5. TOTALES Y PAGOS
      appendCommand(ALIGN_RIGHT);

      // Recuperamos todas las variables
      const subtotalBrutoVal = Number(data.subtotalBruto || 0).toFixed(2);
      const descGlobalVal = Number(data.descuentoGlobal || 0).toFixed(2);
      const opGravadaVal = Number(data.opGravada || 0).toFixed(2);
      const igvVal = Number(data.igv || 0).toFixed(2);
      const totalVal = Number(data.total || 0).toFixed(2);

      // Imprimimos descuento solo si existe
      if (Number(descGlobalVal) > 0 && !isCourtesy) {
        printTotalLine("Subtotal: S/", subtotalBrutoVal);
        appendCommand(BOLD_ON);
        printTotalLine("Dscto. Global: -S/", descGlobalVal);
        appendCommand(BOLD_OFF);
      }

      printTotalLine("Op. Gravada: S/", opGravadaVal);
      printTotalLine("IGV (18%): S/", igvVal);

      appendCommand(TEXT_DOUBLE_H);
      printTotalLine("TOTAL: S/", totalVal, true);
      appendCommand(TEXT_NORMAL);
      drawLine();

      // 👇 RECUPERAMOS LOS VUELTOS 👇
      if (
        data.tenderedAmount !== undefined &&
        data.changeAmount !== undefined
      ) {
        printTotalLine("Recibido: S/", Number(data.tenderedAmount).toFixed(2));
        printTotalLine("Vuelto: S/", Number(data.changeAmount).toFixed(2));
        drawLine();
      }

      // 6. MONTO EN LETRAS
      appendCommand(ALIGN_LEFT);
      appendText(`SON: ${data.amountInWords}\n`);
      drawLine();

      if (data.payments && Array.isArray(data.payments)) {
        data.payments.forEach((p: any) => {
          appendText(
            `PAGO: ${p.method || "EFECTIVO"} ---- S/ ${Number(p.amount || 0).toFixed(2)}\n`,
          );
        });
      }
      drawLine();

      // 7. QR DE SUNAT (Dinamizado con el RUC de la empresa)
      if (!isCourtesy) {
        // Obtenemos el código exacto que mandamos desde React (01, 03, 07 o 00)
        const codigoExacto = data.invoiceTypeCode || "03";

        // Si ES 00 (Nota de Venta / Devolución Interna), NO lleva QR de SUNAT
        if (codigoExacto === "00") {
          appendCommand(ALIGN_CENTER);
          appendText(
            "\nEste documento es un comprobante interno.\nNo valido para efectos tributarios.\n",
          );
        }
        // Si es Factura(01), Boleta(03) o Nota de Crédito(07), SÍ lleva QR y texto de SUNAT
        else {
          const fechaAimp = data.date || "-";
          const fechaSoloDia = fechaAimp.split(",")[0] || "";

          const serieSplit = seriesNum.split("-");
          const serieSunat = serieSplit[0] || "B001";
          const numeroSunat = serieSplit[1] || "00000000";
          const tipoDocClienteSunat = docClient.length === 11 ? "6" : "1";

          // Generación del QR
          const qrText = `${companyRuc}|${codigoExacto}|${serieSunat}|${numeroSunat}|${igvVal}|${totalVal}|${fechaSoloDia.replace(/\//g, "-")}|${tipoDocClienteSunat}|${docClient}|`;

          const qrLength = qrText.length + 3;
          const pL = qrLength % 256;
          const pH = Math.floor(qrLength / 256);

          appendCommand(ALIGN_CENTER);
          appendCommand([0x1d, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00]);
          appendCommand([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 0x06]);
          appendCommand([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x30]);
          appendCommand([0x1d, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30]);
          appendText(qrText);
          appendCommand([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30]);
          appendText("\n");

          // Textos exactos según el código de SUNAT
          let tipoD = "BOLETA DE VENTA";
          if (codigoExacto === "01") tipoD = "FACTURA DE VENTA";
          if (codigoExacto === "07") tipoD = "NOTA DE CREDITO";

          appendText(`Representacion impresa de la\n${tipoD} electronica\n`);
          appendText("Consulte su validez en la SUNAT\n");
        }
      }

      appendCommand(ALIGN_CENTER);
      appendCommand(BOLD_ON);
      appendText(
        `\n${isCourtesy ? "CORTESIA APROBADA" : "GRACIAS POR SU COMPRA!"}\n`,
      );
      appendCommand(BOLD_OFF);

      appendText("\n\n\n\n");
      appendCommand(CUT_PAPER);

      // MOTOR DE ENVÍO POR CHUNKS (Cucharadas)
      const payload = new Uint8Array(bytesArray);
      const chunkSize = 256;
      await new Promise((resolve) => setTimeout(resolve, 500));

      for (let i = 0; i < payload.length; i += chunkSize) {
        const chunk = payload.slice(i, i + chunkSize);
        await new Promise<void>((resolveWrite, rejectWrite) => {
          (window as any).bluetoothSerial.write(
            chunk.buffer,
            () => setTimeout(resolveWrite, 150),
            (err: any) => rejectWrite(err),
          );
        });
      }
      await new Promise((resolve) => setTimeout(resolve, 800));
    } catch (error) {
      throw error;
    }
  }

  // ========================================================
  // MOTOR DE REPORTES PARA BLUETOOTH (X, Z, PMIX, HOURLY)
  // ========================================================
  static async printPosReportESC(data: any): Promise<void> {
    const ESC_INIT = [0x1b, 0x40];
    const ALIGN_LEFT = [0x1b, 0x61, 0x00];
    const ALIGN_CENTER = [0x1b, 0x61, 0x01];
    //const ALIGN_RIGHT = [0x1b, 0x61, 0x02];
    const BOLD_ON = [0x1b, 0x45, 0x01];
    const BOLD_OFF = [0x1b, 0x45, 0x00];
    const TEXT_NORMAL = [0x1d, 0x21, 0x00];
    const TEXT_DOUBLE_H = [0x1d, 0x21, 0x01];
    const CUT_PAPER = [0x1d, 0x56, 0x41, 0x10];
    const MAX_CHARS = 48; // Estándar 80mm

    let bytesArray: number[] = [];

    const appendCommand = (cmd: number[]) => {
      bytesArray = bytesArray.concat(cmd);
    };
    const appendText = (text: string) => {
      if (!text) return;
      const cleanText = text
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/ñ/g, "n")
        .replace(/Ñ/g, "N");
      for (let i = 0; i < cleanText.length; i++) {
        bytesArray.push(cleanText.charCodeAt(i));
      }
    };

    const drawLine = () => appendText("-".repeat(MAX_CHARS) + "\n");
    const padRight = (str: string, length: number) =>
      (str || "").substring(0, length).padEnd(length, " ");
    const padLeft = (str: string, length: number) =>
      (str || "").substring(0, length).padStart(length, " ");

    try {
      appendCommand(ESC_INIT);

      // --- CABECERA COMÚN ---
      const branch = data.branch || {};
      const companyShortName =
        localStorage.getItem("company_short_name") || "EMPRESA";

      appendCommand(ALIGN_CENTER);
      appendCommand(BOLD_ON);
      appendCommand(TEXT_DOUBLE_H);
      appendText(`${branch.name || companyShortName}\n`);
      appendCommand(TEXT_NORMAL);
      appendCommand(BOLD_OFF);

      if (branch.address) appendText(`${branch.address}\n`);
      appendText(`REPORTE LOCAL DE CAJA\n`);
      drawLine();

      // --- TÍTULO DEL REPORTE ---
      let tituloReporte = "REPORTE";
      if (data.type === "HOURLY") tituloReporte = "DESGLOSE POR HORA";
      if (data.type === "PMIX") tituloReporte = "MIX DE PRODUCTOS (PMIX)";
      if (data.type === "COURTESIES") tituloReporte = "CORTESIAS Y CONSUMOS";
      if (data.type === "Z_REPORT") {
        tituloReporte =
          data.status === "OPEN"
            ? "LECTURA X (PRE-CIERRE)"
            : "REPORTE DE CIERRE Z";
      }

      appendCommand(BOLD_ON);
      appendText(`${tituloReporte}\n`);
      appendCommand(BOLD_OFF);
      drawLine();

      // --- DATOS DE TIEMPO ---
      appendCommand(ALIGN_LEFT);
      appendText(`Apertura : ${data.openedAt || "-"}\n`);
      appendText(`Impresion: ${new Date().toLocaleString("es-PE")}\n`);
      drawLine();

      // ==========================================
      // CASO 1: REPORTES POR HORA
      // ==========================================
      if (data.type === "HOURLY") {
        appendCommand(BOLD_ON);
        // Formato: RANGO (16) | CANT (6) | NETO (11) | BRUTO (15)
        appendText(
          `${padRight("RANGO", 16)}${padRight("CANT", 6)}${padLeft("NETO", 11)}${padLeft("BRUTO", 15)}\n`,
        );
        appendCommand(BOLD_OFF);
        drawLine();

        if (data.hours && data.hours.length > 0) {
          data.hours.forEach((h: any) => {
            const timeL = padRight(h.timeLabel, 16);
            const cnt = padRight(h.count.toString(), 6);
            const net = padLeft(Number(h.net).toFixed(2), 11);
            const grs = padLeft(Number(h.gross).toFixed(2), 15);
            appendText(`${timeL}${cnt}${net}${grs}\n`);
          });
        } else {
          appendCommand(ALIGN_CENTER);
          appendText("\nSin transacciones registradas.\n\n");
          appendCommand(ALIGN_LEFT);
        }

        drawLine();
        appendCommand(BOLD_ON);
        appendText(
          `TOTALES:        ${padRight(String(data.totalTickets || 0), 6)}${padLeft("S/", 11)}${padLeft(Number(data.totalGross || 0).toFixed(2), 15)}\n`,
        );
        appendCommand(BOLD_OFF);
      }

      // ==========================================
      // CASO 2: PMIX Y CORTESÍAS
      // ==========================================
      else if (data.type === "PMIX" || data.type === "COURTESIES") {
        appendCommand(BOLD_ON);
        appendText(`${padRight("PRODUCTO", 40)}${padLeft("CANT", 8)}\n`);
        appendCommand(BOLD_OFF);
        drawLine();

        if (data.items && data.items.length > 0) {
          data.items.forEach((item: any) => {
            appendText(
              `${padRight(String(item.name).substring(0, 38), 40)}${padLeft(Number(item.qty).toString(), 8)}\n`,
            );
          });
        } else {
          appendCommand(ALIGN_CENTER);
          appendText("\nNo hay productos registrados.\n\n");
          appendCommand(ALIGN_LEFT);
        }

        if (data.type === "COURTESIES") {
          drawLine();
          appendCommand(BOLD_ON);
          appendText(
            `${padRight("VALOR ASUMIDO:", 30)}${padLeft("S/ " + Number(data.totalCost || 0).toFixed(2), 18)}\n`,
          );
          appendCommand(BOLD_OFF);
        }
      }

      // ==========================================
      // CASO 3: CIERRE Z / LECTURA X
      // ==========================================
      else if (data.type === "Z_REPORT") {
        const isX = data.status === "OPEN";

        appendCommand(ALIGN_CENTER);
        appendCommand(BOLD_ON);
        appendText("\nDATOS DEL TURNO\n");
        appendCommand(BOLD_OFF);
        drawLine();

        appendCommand(ALIGN_LEFT);
        appendText(`Cajero: ${data.cashierName || "-"}\n`);
        appendText(`Caja  : ${data.registerName || "-"}\n`);
        if (!isX) appendText(`Cierre: ${data.closedAt || "-"}\n`);

        appendCommand(ALIGN_CENTER);
        appendCommand(BOLD_ON);
        appendText("\nVALORES DEL SISTEMA\n");
        appendCommand(BOLD_OFF);
        drawLine();

        appendCommand(ALIGN_LEFT);
        appendText(
          `${padRight("Fondo Inicial:", 28)}${padLeft("S/ " + Number(data.initialFund || 0).toFixed(2), 20)}\n`,
        );
        appendText(
          `${padRight("Efectivo Ventas:", 28)}${padLeft("S/ " + Number(data.expectedCash || 0).toFixed(2), 20)}\n`,
        );
        appendText(
          `${padRight("Visa / Yape:", 28)}${padLeft("S/ " + Number(data.expectedCard || 0).toFixed(2), 20)}\n`,
        );
        appendText(
          `${padRight("Transferencias:", 28)}${padLeft("S/ " + Number(data.expectedTransfer || 0).toFixed(2), 20)}\n`,
        );
        appendText("\n");

        const totalSist =
          Number(data.expectedCash || 0) +
          Number(data.expectedCard || 0) +
          Number(data.expectedTransfer || 0);
        appendCommand(BOLD_ON);
        appendText(
          `${padRight("TOTAL ESPERADO:", 28)}${padLeft("S/ " + totalSist.toFixed(2), 20)}\n`,
        );
        appendCommand(BOLD_OFF);

        if (!isX) {
          appendCommand(ALIGN_CENTER);
          appendCommand(BOLD_ON);
          appendText("\nDECLARACION DEL CAJERO\n");
          appendCommand(BOLD_OFF);
          drawLine();

          appendCommand(ALIGN_LEFT);
          appendText(
            `${padRight("Efectivo:", 28)}${padLeft("S/ " + Number(data.declaredCash || 0).toFixed(2), 20)}\n`,
          );
          appendText(
            `${padRight("Visa / Yape:", 28)}${padLeft("S/ " + Number(data.declaredCard || 0).toFixed(2), 20)}\n`,
          );
          appendText(
            `${padRight("Transferencias:", 28)}${padLeft("S/ " + Number(data.declaredTransfer || 0).toFixed(2), 20)}\n`,
          );
          appendText("\n");

          appendCommand(BOLD_ON);
          appendText(
            `${padRight("TOTAL DECLARADO:", 28)}${padLeft("S/ " + Number(data.declaredTotal || 0).toFixed(2), 20)}\n`,
          );
          appendCommand(BOLD_OFF);
          drawLine();

          const diff = Number(data.declaredTotal || 0) - totalSist;
          let diffText = "CUADRE PERFECTO";
          let diffVal = "S/ 0.00";
          if (diff > 0.1) {
            diffText = "SOBRANTE EN CAJA:";
            diffVal = `+ S/ ${diff.toFixed(2)}`;
          } else if (diff < -0.1) {
            diffText = "FALTANTE EN CAJA:";
            diffVal = `- S/ ${Math.abs(diff).toFixed(2)}`;
          }

          appendText(`${padRight(diffText, 28)}${padLeft(diffVal, 20)}\n`);
        }

        appendText("\n\n\n");
        appendCommand(ALIGN_CENTER);
        appendText("_________________________\n");
        appendText(isX ? "Firma del Cajero\n" : "Firma Cajero / Arqueo\n");
      }

      // --- PIE DE REPORTE ---
      appendText("\n");
      drawLine();
      appendCommand(ALIGN_CENTER);
      appendText("--- FIN DEL REPORTE ---\n");
      appendText("\n\n\n\n");
      appendCommand(CUT_PAPER);

      // --- ENVÍO A LA IMPRESORA ---
      const payload = new Uint8Array(bytesArray);
      const chunkSize = 256;
      await new Promise((resolve) => setTimeout(resolve, 500));

      for (let i = 0; i < payload.length; i += chunkSize) {
        const chunk = payload.slice(i, i + chunkSize);
        await new Promise<void>((resolveWrite, rejectWrite) => {
          (window as any).bluetoothSerial.write(
            chunk.buffer,
            () => setTimeout(resolveWrite, 100), // En reportes largos es mejor un delay corto
            (err: any) => rejectWrite(err),
          );
        });
      }
      await new Promise((resolve) => setTimeout(resolve, 800));
    } catch (error) {
      console.error("Error imprimiendo reporte Bluetooth:", error);
      throw error;
    }
  }
}
