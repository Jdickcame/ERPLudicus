const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const http = require("http");
const ptp = require("pdf-to-printer");
const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");

let mainWindow;
let companyConfig = {
  name: "EMPRESA S.A.",
  shortName: "EMPRESA",
  ruc: "00000000000",
};

const isDev = process.env.NODE_ENV === "development";
const API_BASE = isDev
  ? "http://localhost:8000"
  : "https://api.ludicuspark.com";

function fetchCompanyConfig() {
  return new Promise((resolve) => {
    try {
      const httpClient = API_BASE.startsWith("https")
        ? require("https")
        : require("http");

      httpClient
        .get(`${API_BASE}/api/company/company/`, (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            try {
              const json = JSON.parse(data);
              const companyData =
                json.results && json.results.length > 0
                  ? json.results[0]
                  : json;
              if (companyData && companyData.name) {
                companyConfig = {
                  name: companyData.name || "EMPRESA S.A.",
                  shortName: companyData.short_name || "EMPRESA",
                  ruc: companyData.ruc || "00000000000",
                };
              }
            } catch (e) {
              console.error("Error parsing company config:", e);
            }
            resolve();
          });
        })
        .on("error", (err) => {
          console.error("Error fetching company config:", err);
          resolve();
        });
    } catch (error) {
      console.error("Error crítico de red:", error);
      resolve();
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 768,
    title: "KENSIS POS",
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "electron", "preload.js"),
    },
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173/#/pos-login");
  } else {
    mainWindow.loadFile(path.join(__dirname, "dist", "index.html"), {
      hash: "pos-login",
    });
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  await fetchCompanyConfig();
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// =========================================================================
// APIs SEGURAS PARA EL FRONTEND
// =========================================================================

ipcMain.handle("get-company-config", async () => {
  return companyConfig;
});

// =========================================================================
// FUNCIÓN MÁGICA: Convierte números a letras
// =========================================================================
function numeroALetras(num) {
  const unidades = [
    "CERO",
    "UNO",
    "DOS",
    "TRES",
    "CUATRO",
    "CINCO",
    "SEIS",
    "SIETE",
    "OCHO",
    "NUEVE",
  ];
  const decenas = [
    "DIEZ",
    "ONCE",
    "DOCE",
    "TRECE",
    "CATORCE",
    "QUINCE",
    "DIECISÉIS",
    "DIECISIETE",
    "DIECIOCHO",
    "DIECINUEVE",
    "VEINTE",
  ];
  const decenas2 = [
    "VEINTI",
    "TREINTA",
    "CUARENTA",
    "CINCUENTA",
    "SESENTA",
    "SETENTA",
    "OCHENTA",
    "NOVENTA",
  ];
  const centenas = [
    "CIEN",
    "CIENTO",
    "DOSCIENTOS",
    "TRESCIENTOS",
    "CUATROCIENTOS",
    "QUINIENTOS",
    "SEISCIENTOS",
    "SETECIENTOS",
    "OCHOCIENTOS",
    "NOVECIENTOS",
  ];

  function convertirGrupo(n) {
    let output = "";
    if (n === 100) return "CIEN";
    if (n > 100) {
      output += centenas[Math.floor(n / 100)] + " ";
      n %= 100;
    }
    if (n >= 10 && n <= 20) {
      output += decenas[n - 10];
      return output;
    }
    if (n > 20 && n < 30) {
      output += "VEINTI" + unidades[n % 10];
      return output;
    }
    if (n >= 30) {
      output += decenas2[Math.floor(n / 10) - 1];
      n %= 10;
      if (n > 0) output += " Y ";
    }
    if (n > 0) output += unidades[n];
    return output.trim();
  }

  const entero = Math.floor(num);
  let centavos = Math.round((num - entero) * 100);
  let strCentavos = centavos < 10 ? "0" + centavos : centavos.toString();

  if (entero === 0) return `CERO CON ${strCentavos}/100 SOLES`;

  let output = "";
  if (entero >= 1000) {
    let miles = Math.floor(entero / 1000);
    if (miles === 1) output += "MIL ";
    else output += convertirGrupo(miles) + " MIL ";
  }
  let resto = entero % 1000;
  if (resto > 0) output += convertirGrupo(resto);

  return `${output.trim()} CON ${strCentavos}/100 SOLES`;
}

// =========================================================================
// 1. MOTOR PDF NATIVO (SUNAT / Django)
// =========================================================================
ipcMain.on("print-ticket", async (event, base64Pdf) => {
  try {
    const base64Data = base64Pdf.replace(/^data:application\/pdf;base64,/, "");
    const tempFilePath = path.join(
      os.tmpdir(),
      `ticket_sunat_${Date.now()}.pdf`,
    );
    fs.writeFileSync(tempFilePath, base64Data, "base64");
    await ptp.print(tempFilePath);
    fs.unlinkSync(tempFilePath);
  } catch (error) {
    console.error("Error al imprimir PDF de SUNAT:", error);
  }
});

// =========================================================================
// 2. MOTOR GENERADOR DE PDF LOCAL (Con código QR offline nativo)
// =========================================================================
ipcMain.on("print-local-ticket", async (event, data) => {
  console.log("=== PRINT LOCAL TICKET ===");
  console.log("Data received:", JSON.stringify(data, null, 2));
  console.log("Company config:", JSON.stringify(companyConfig, null, 2));

  try {
    const tempFilePath = path.join(
      os.tmpdir(),
      `ticket_offline_${Date.now()}.pdf`,
    );

    const company = companyConfig;
    const branch = data.branch || {
      name: companyConfig.shortName,
      address: "Dirección no disponible",
      phone: "000000000",
    };

    console.log("Branch used:", JSON.stringify(branch, null, 2));

    const doc = new PDFDocument({
      size: [215, 800],
      margins: { top: 10, bottom: 10, left: 10, right: 10 },
    });

    const stream = fs.createWriteStream(tempFilePath);
    doc.pipe(stream);

    const drawLine = (espacioArriba = 0.2, espacioAbajo = 0.2) => {
      doc.x = 10;
      if (espacioArriba > 0) doc.moveDown(espacioArriba);

      doc
        .font("Helvetica")
        .fontSize(10)
        .text(
          "-----------------------------------------------------------",
          10,
          doc.y,
          { width: 200, align: "center", lineBreak: false },
        );

      if (espacioAbajo > 0) doc.moveDown(espacioAbajo);
    };

    const colXcant = 10;
    const colWcant = 20;
    const colXdesc = 35;
    const colWdesc = 90;
    const colXpu = 120;
    const colWpu = 35;
    const colXtotal = 160;
    const colWtotal = 45;

    const printRow = (qty, desc, price, total, isBold = false) => {
      doc.font(isBold ? "Helvetica-Bold" : "Helvetica").fontSize(7);
      const startY = doc.y;

      doc.text(qty, colXcant, startY, { width: colWcant, align: "left" });
      doc.text(desc.substring(0, 22), colXdesc, startY, {
        width: colWdesc,
        align: "left",
      });
      doc.text(price, colXpu, startY, { width: colWpu, align: "right" });
      doc.text(total, colXtotal, startY, { width: colWtotal, align: "right" });

      doc.x = 10;
      doc.moveDown(0.1);
    };

    // Logo
    const logoPath = isDev
      ? path.join(__dirname, "public", "logo.png")
      : path.join(__dirname, "dist", "logo.png");

    if (fs.existsSync(logoPath)) {
      try {
        doc.image(logoPath, 32.5, doc.y, { width: 150 });
        doc.y += 110;
      } catch (err) {
        console.error("Error al cargar el logo:", err);
      }
    }

    // --- DIBUJANDO EL TICKET ---
    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .text(company.name, { align: "center", width: 195 });
    doc
      .font("Helvetica")
      .fontSize(9)
      .text(company.shortName, { align: "center", width: 195 });
    doc.text(`RUC: ${company.ruc}`, { align: "center", width: 195 });
    doc.text(branch.address, { align: "center", width: 195 });
    doc.text(`Telf. ${branch.phone}`, { align: "center", width: 195 });

    drawLine();

    const isCourtesy = data.isCourtesy || false;
    const titleLbl = isCourtesy
      ? "TICKET DE CORTESÍA"
      : data.invoiceTypeLabel || "BOLETA DE VENTA";
    const seriesNum = data.invoiceNumber || "OFFLINE";

    doc
      .font("Helvetica-Bold")
      .fontSize(11)
      .text(titleLbl, { align: "center", width: 195 });
    doc.fontSize(10).text(seriesNum, { align: "center", width: 195 });

    drawLine();

    doc.font("Helvetica").fontSize(9);
    doc.x = 10;

    const fechaAimp = data.date || "-";
    const fechaSoloDia = fechaAimp.split(",")[0] || "";

    doc.text(`Fecha: ${fechaAimp}`);
    doc.text(`Cliente: ${data.customer || "PÚBLICO GENERAL"}`);

    const docClient =
      data.customerDoc && data.customerDoc !== "-"
        ? data.customerDoc
        : "00000000";
    doc.text(`RUC/DNI: ${docClient}`);
    doc.text(`Dirección: ${data.address || "-"}`);

    drawLine(0.2, 0);

    printRow("CANT", "DESCRIPCIÓN", "PRECIO", "TOTAL", true);

    doc.y -= 5;
    drawLine(0, 0.2);

    if (data.items && Array.isArray(data.items) && data.items.length > 0) {
      data.items.forEach((item) => {
        printRow(
          `${item.qty || 1}`,
          `${String(item.name || "Producto")}`,
          `${Number(item.price || 0).toFixed(2)}`,
          `${Number(item.subtotal || 0).toFixed(2)}`,
        );
      });
    }

    drawLine();

    // TOTALES
    doc.font("Helvetica").fontSize(9);
    const opGravadaVal = Number(data.opGravada || 0).toFixed(2);
    const igvVal = Number(data.igv || 0).toFixed(2);
    const totalVal = Number(data.total || 0).toFixed(2);
    const descGlobalVal = Number(data.descuentoGlobal || 0).toFixed(2);
    const subtotalBrutoVal = Number(data.subtotalBruto || 0).toFixed(2);

    if (descGlobalVal > 0 && !isCourtesy) {
      let startYBruto = doc.y;
      doc.text("Subtotal:", 50, startYBruto, {
        width: 95,
        align: "right",
      });
      doc.text(`S/ ${subtotalBrutoVal}`, 145, startYBruto, {
        width: 60,
        align: "right",
      });
      doc.x = 10;
      doc.moveDown(0.2);

      doc.font("Helvetica-Bold");
      let startYDesc = doc.y;
      doc.text("Dscto. Global:", 50, startYDesc, { width: 95, align: "right" });
      doc.text(`- S/ ${descGlobalVal}`, 145, startYDesc, {
        width: 60,
        align: "right",
      });
      doc.x = 10;
      doc.font("Helvetica");
      doc.moveDown(0.2);
    }

    let startYopG = doc.y;
    doc.text("Op. Gravada:", 50, startYopG, { width: 95, align: "right" });
    doc.text(`S/ ${opGravadaVal}`, 145, startYopG, {
      width: 60,
      align: "right",
    });
    doc.x = 10;
    doc.moveDown(0.2);

    let startYigv = doc.y;
    doc.text("IGV (18%):", 50, startYigv, { width: 95, align: "right" });
    doc.text(`S/ ${igvVal}`, 145, startYigv, { width: 60, align: "right" });
    doc.x = 10;
    doc.moveDown(0.2);

    doc.font("Helvetica-Bold").fontSize(11);
    let startYtot = doc.y;
    doc.text("TOTAL:", 50, startYtot, { width: 95, align: "right" });
    doc.text(`S/ ${totalVal}`, 145, startYtot, { width: 60, align: "right" });
    doc.x = 10;
    doc.moveDown(0.3);

    drawLine();

    if (data.tenderedAmount !== undefined && data.changeAmount !== undefined) {
      doc.font("Helvetica").fontSize(9);

      let startYRec = doc.y;
      doc.text("Recibido:", 50, startYRec, { width: 95, align: "right" });
      doc.text(`S/ ${Number(data.tenderedAmount).toFixed(2)}`, 145, startYRec, {
        width: 60,
        align: "right",
      });
      doc.x = 10;
      doc.moveDown(0.2);

      let startYChange = doc.y;
      doc.text("Vuelto:", 50, startYChange, { width: 95, align: "right" });
      doc.text(
        `S/ ${Number(data.changeAmount).toFixed(2)}`,
        145,
        startYChange,
        { width: 60, align: "right" },
      );
      doc.x = 10;
      doc.moveDown(0.5);
    }

    drawLine();

    // MONTO EN PALABRAS
    const montoLetras = numeroALetras(Number(data.total || 0));
    doc.font("Helvetica").fontSize(8);
    doc.text(`SON: ${montoLetras}`, 10, doc.y, { width: 195, align: "left" });
    doc.moveDown(0.5);

    drawLine();

    // PAGOS
    doc.font("Helvetica").fontSize(9);
    if (
      data.payments &&
      Array.isArray(data.payments) &&
      data.payments.length > 0
    ) {
      data.payments.forEach((p) => {
        const py = doc.y;
        doc.text(`PAGO: ${p.method || "EFECTIVO"}`, 10, py, {
          width: 110,
          align: "left",
        });
        doc.text(`S/ ${Number(p.amount || 0).toFixed(2)}`, 120, py, {
          width: 85,
          align: "right",
        });
        doc.x = 10;
        doc.moveDown(0.2);
      });
    }

    drawLine();

    if (!isCourtesy) {
      // QR
      const tipoDocSunat = titleLbl.includes("FACTURA") ? "01" : "03";
      const serieSplit = seriesNum.split("-");
      const serieSunat = serieSplit[0] || "B001";
      const numeroSunat = serieSplit[1] || "00000000";
      const tipoDocClienteSunat = docClient.length === 11 ? "6" : "1";

      const qrText = `${
        company.ruc
      }|${tipoDocSunat}|${serieSunat}|${numeroSunat}|${igvVal}|${totalVal}|${fechaSoloDia.replace(
        /\//g,
        "-",
      )}|${tipoDocClienteSunat}|${docClient}|`;

      try {
        const qrBuffer = await QRCode.toBuffer(qrText, {
          margin: 1,
          width: 80,
        });
        doc.image(qrBuffer, 67.5, doc.y, { width: 80 });
        doc.moveDown(7);
      } catch (qrErr) {
        console.error("Error generando QR:", qrErr);
        doc.moveDown(1);
      }

      const tipoD = tipoDocSunat === "01" ? "FACTURA" : "BOLETA";
      doc
        .font("Helvetica")
        .fontSize(8)
        .text(`Representación impresa de la ${tipoD} DE VENTA electrónica`, {
          align: "center",
          width: 195,
        });
      doc.moveDown(0.3);

      doc.text(
        "Consulte la validez de su comprobante en el portal de la SUNAT",
        {
          align: "center",
          width: 195,
        },
      );
      doc.moveDown(1);
    }

    doc
      .font("Helvetica-Bold")
      .fontSize(11)
      .text(isCourtesy ? "CORTESÍA APROBADA" : "¡¡GRACIAS POR SU COMPRA!!", {
        align: "center",
        width: 195,
      });

    if (
      !data.invoiceNumber ||
      String(data.invoiceNumber).includes("PENDIENTE")
    ) {
      doc.moveDown(0.5);
      doc
        .font("Helvetica")
        .fontSize(8)
        .text("* PENDIENTE DE SINCRONIZACIÓN *", {
          align: "center",
          width: 195,
        });
    }

    drawLine();

    doc.end();

    stream.on("finish", async () => {
      try {
        await ptp.print(tempFilePath);
        fs.unlinkSync(tempFilePath);
      } catch (err) {
        console.error("Error al imprimir el PDF local:", err);
      }
    });
  } catch (error) {
    console.error("Error generando PDF local:", error);
  }
});

// =========================================================================
// 3. REPORTES (LECTURA X / CIERRE Z)
// =========================================================================
ipcMain.on("print-pos-report", async (event, data) => {
  try {
    const tempFilePath = path.join(
      os.tmpdir(),
      `report_offline_${Date.now()}.pdf`,
    );

    let dynamicHeight = 300;
    if (data.type === "HOURLY") dynamicHeight += (data.hours?.length || 0) * 20;
    if (data.type === "PMIX" || data.type === "COURTESIES")
      dynamicHeight += (data.items?.length || 0) * 20;
    if (data.type === "Z_REPORT") dynamicHeight += 400;

    const finalHeight = Math.max(600, dynamicHeight);

    const doc = new PDFDocument({
      size: [215, finalHeight],
      margins: { top: 10, bottom: 10, left: 10, right: 10 },
    });

    const stream = fs.createWriteStream(tempFilePath);
    doc.pipe(stream);

    const drawLine = (espacioArriba = 0.2, espacioAbajo = 0.2) => {
      doc.x = 10;
      if (espacioArriba > 0) doc.moveDown(espacioArriba);
      doc
        .font("Helvetica")
        .fontSize(10)
        .text(
          "---------------------------------------------------------",
          10,
          doc.y,
          {
            width: 195,
            align: "center",
            lineBreak: false,
          },
        );
      if (espacioAbajo > 0) doc.moveDown(espacioAbajo);
    };

    // --- CABECERA COMÚN ---
    const branch = data.branch || {};
    doc
      .font("Helvetica-Bold")
      .fontSize(12)
      .text(branch.name || companyConfig.shortName, {
        align: "center",
        width: 195,
      });
    doc.fontSize(9).text(branch.address || "", { align: "center", width: 195 });
    doc
      .fontSize(10)
      .text("REPORTE LOCAL DE CAJA", { align: "center", width: 195 });

    let tituloReporte = "REPORTE";
    if (data.type === "HOURLY") tituloReporte = "DESGLOSE POR HORA";
    if (data.type === "PMIX") tituloReporte = "MIX DE PRODUCTOS (PMIX)";
    if (data.type === "COURTESIES") tituloReporte = "CORTESÍAS Y CONSUMOS";
    if (data.type === "Z_REPORT")
      tituloReporte =
        data.status === "OPEN"
          ? "LECTURA X (PRE-CIERRE)"
          : "REPORTE DE CIERRE Z";

    drawLine(0.2, 0.2);
    doc
      .font("Helvetica-Bold")
      .fontSize(11)
      .text(tituloReporte, { align: "center", width: 195 });
    drawLine(0.2, 0.2);

    doc.font("Helvetica").fontSize(9);
    doc.text(`Apertura Turno: ${data.openedAt}`, {
      align: "center",
      width: 195,
    });
    doc.text(`Impresión: ${new Date().toLocaleString("es-PE")}`, {
      align: "center",
      width: 195,
    });

    drawLine(0.4, 0);

    // REPORTES POR HORA
    if (data.type === "HOURLY") {
      doc.font("Helvetica-Bold").fontSize(9);
      let startY = doc.y;
      doc.text("RANGO", 10, startY, { width: 70, align: "left" });
      doc.text("CANT", 80, startY, { width: 25, align: "center" });
      doc.text("NETO", 105, startY, { width: 45, align: "right" });
      doc.text("BRUTO", 150, startY, { width: 55, align: "right" });
      doc.x = 10;
      doc.y -= 5;
      drawLine(0, 0.2);

      doc.font("Helvetica").fontSize(9);
      if (data.hours && data.hours.length > 0) {
        data.hours.forEach((h) => {
          const y = doc.y;
          doc.text(h.timeLabel, 10, y, { width: 70, align: "left" });
          doc.text(h.count.toString(), 80, y, { width: 25, align: "center" });
          doc.text(Number(h.net).toFixed(2), 105, y, {
            width: 45,
            align: "right",
          });
          doc.text(Number(h.gross).toFixed(2), 150, y, {
            width: 55,
            align: "right",
          });
          doc.x = 10;
          doc.moveDown(0.2);
        });
      } else {
        doc.moveDown(0.5);
        doc.text("Sin transacciones registradas.", {
          align: "center",
          width: 195,
        });
      }

      drawLine(0.2, 0.2);
      doc.font("Helvetica-Bold").fontSize(10);
      const ty = doc.y;
      doc.text("TOTALES:", 10, ty, { width: 70, align: "left" });
      doc.text(data.totalTickets.toString(), 80, ty, {
        width: 25,
        align: "center",
      });
      doc.text(`S/ ${Number(data.totalGross).toFixed(2)}`, 130, ty, {
        width: 75,
        align: "right",
      });
      doc.x = 10;
      doc.moveDown(0.5);
    }

    // PMIX Y CORTESÍAS
    else if (data.type === "PMIX" || data.type === "COURTESIES") {
      doc.font("Helvetica-Bold").fontSize(9);
      let startY = doc.y;
      doc.text("PRODUCTO", 10, startY, { width: 155, align: "left" });
      doc.text("CANT", 165, startY, { width: 40, align: "right" });
      doc.x = 10;
      doc.y -= 5;
      drawLine(0, 0.2);

      doc.font("Helvetica").fontSize(9);
      if (data.items && data.items.length > 0) {
        data.items.forEach((item) => {
          const y = doc.y;
          doc.text(String(item.name).substring(0, 35), 10, y, {
            width: 155,
            align: "left",
          });
          doc.text(Number(item.qty).toString(), 165, y, {
            width: 40,
            align: "right",
          });
          doc.x = 10;
          doc.moveDown(0.2);
        });
      } else {
        doc.moveDown(0.5);
        doc.text("No hay productos registrados.", {
          align: "center",
          width: 195,
        });
      }

      if (data.type === "COURTESIES") {
        drawLine(0.2, 0.2);
        doc.font("Helvetica-Bold").fontSize(10);
        const cy = doc.y;
        doc.text("VALOR ASUMIDO:", 10, cy, { width: 125, align: "left" });
        doc.text(`S/ ${Number(data.totalCost || 0).toFixed(2)}`, 135, cy, {
          width: 70,
          align: "right",
        });
        doc.x = 10;
        doc.moveDown(0.5);
      }
    }

    // CIERRE Z / LECTURA X
    else if (data.type === "Z_REPORT") {
      const isX = data.status === "OPEN";

      doc.moveDown(0.5);
      doc
        .font("Helvetica-Bold")
        .fontSize(9)
        .text("DATOS DEL TURNO", { align: "center", width: 195 });
      drawLine(0.2, 0.2);

      doc.font("Helvetica").fontSize(9);
      doc.text(`Cajero: ${data.cashierName}`, 10, doc.y, { width: 195 });
      doc.text(`Caja: ${data.registerName}`, 10, doc.y, { width: 195 });
      if (!isX) doc.text(`Cierre: ${data.closedAt}`, 10, doc.y, { width: 195 });

      drawLine(0.4, 0.4);
      doc
        .font("Helvetica-Bold")
        .text("VALORES DEL SISTEMA", { align: "center", width: 195 });
      drawLine(0.2, 0.2);

      doc.font("Helvetica").fontSize(9);
      let y = doc.y;
      doc.text("Fondo Inicial:", 10, y, { width: 110 });
      doc.text(`S/ ${Number(data.initialFund).toFixed(2)}`, 120, y, {
        width: 85,
        align: "right",
      });
      doc.moveDown(0.2);
      y = doc.y;
      doc.text("Efectivo Ventas:", 10, y, { width: 110 });
      doc.text(`S/ ${Number(data.expectedCash).toFixed(2)}`, 120, y, {
        width: 85,
        align: "right",
      });
      doc.moveDown(0.2);
      y = doc.y;
      doc.text("Visa / Yape:", 10, y, { width: 110 });
      doc.text(`S/ ${Number(data.expectedCard).toFixed(2)}`, 120, y, {
        width: 85,
        align: "right",
      });
      doc.moveDown(0.2);
      y = doc.y;
      doc.text("Transferencias:", 10, y, { width: 110 });
      doc.text(`S/ ${Number(data.expectedTransfer).toFixed(2)}`, 120, y, {
        width: 85,
        align: "right",
      });
      doc.moveDown(0.2);

      // 👇 SE AGREGÓ LA FILA DE PAGO LINK 👇
      y = doc.y;
      doc.text("Pago Link:", 10, y, { width: 110 });
      doc.text(`S/ ${Number(data.expectedPagoLink || 0).toFixed(2)}`, 120, y, {
        width: 85,
        align: "right",
      });
      doc.moveDown(0.5);

      const totalSist =
        data.expectedCash +
        data.expectedCard +
        data.expectedTransfer +
        (data.expectedPagoLink || 0);
      doc.font("Helvetica-Bold");
      y = doc.y;
      doc.text("TOTAL ESPERADO:", 10, y, { width: 110 });
      doc.text(`S/ ${Number(totalSist).toFixed(2)}`, 120, y, {
        width: 85,
        align: "right",
      });
      doc.moveDown(0.5);

      if (!isX) {
        drawLine(0.4, 0.4);
        doc
          .font("Helvetica-Bold")
          .text("DECLARACIÓN DEL CAJERO", { align: "center", width: 195 });
        drawLine(0.2, 0.2);

        doc.font("Helvetica").fontSize(9);
        y = doc.y;
        doc.text("Efectivo:", 10, y, { width: 110 });
        doc.text(`S/ ${Number(data.declaredCash).toFixed(2)}`, 120, y, {
          width: 85,
          align: "right",
        });
        doc.moveDown(0.2);
        y = doc.y;
        doc.text("Visa / Yape:", 10, y, { width: 110 });
        doc.text(`S/ ${Number(data.declaredCard).toFixed(2)}`, 120, y, {
          width: 85,
          align: "right",
        });
        doc.moveDown(0.2);
        y = doc.y;
        doc.text("Transferencias:", 10, y, { width: 110 });
        doc.text(`S/ ${Number(data.declaredTransfer).toFixed(2)}`, 120, y, {
          width: 85,
          align: "right",
        });
        doc.moveDown(0.2);

        // 👇 SE AGREGÓ PAGO LINK A LO DECLARADO 👇
        y = doc.y;
        doc.text("Pago Link:", 10, y, { width: 110 });
        doc.text(
          `S/ ${Number(data.declaredPagoLink || 0).toFixed(2)}`,
          120,
          y,
          {
            width: 85,
            align: "right",
          },
        );
        doc.moveDown(0.5);

        doc.font("Helvetica-Bold");
        y = doc.y;
        doc.text("TOTAL DECLARADO:", 10, y, { width: 110 });
        doc.text(`S/ ${Number(data.declaredTotal).toFixed(2)}`, 120, y, {
          width: 85,
          align: "right",
        });
        doc.moveDown(0.5);

        drawLine(0.2, 0.2);

        const diff = data.declaredTotal - totalSist;
        let diffText = "CUADRE PERFECTO";
        let diffVal = "S/ 0.00";
        if (diff > 0.1) {
          diffText = "SOBRANTE EN CAJA:";
          diffVal = `+ S/ ${diff.toFixed(2)}`;
        } else if (diff < -0.1) {
          diffText = "FALTANTE EN CAJA:";
          diffVal = `- S/ ${Math.abs(diff).toFixed(2)}`;
        }

        y = doc.y;
        doc.text(diffText, 10, y, { width: 110 });
        doc.text(diffVal, 120, y, { width: 85, align: "right" });
        doc.moveDown(1);
      }

      doc.moveDown(3);
      doc.font("Helvetica").fontSize(9);
      doc.text("_________________________", { align: "center", width: 195 });
      doc.moveDown(0.2);
      doc.text(isX ? "Firma del Cajero" : "Firma Cajero / Arqueo", {
        align: "center",
        width: 195,
      });
      doc.moveDown(1);
    }

    drawLine(0.5, 0.2);
    doc
      .font("Helvetica")
      .fontSize(8)
      .text("--- FIN DEL REPORTE ---", { align: "center", width: 195 });

    doc.end();

    stream.on("finish", async () => {
      try {
        await ptp.print(tempFilePath);
        fs.unlinkSync(tempFilePath);
      } catch (err) {
        console.error("Error al imprimir el reporte:", err);
      }
    });
  } catch (error) {
    console.error("Error generando PDF de reporte:", error);
  }
});
