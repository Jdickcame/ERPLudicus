export function numeroALetras(num: number): string {
  const unidades = [
    "",
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
    "DIECISEIS",
    "DIECISIETE",
    "DIECIOCHO",
    "DIECINUEVE",
  ];
  const decenas2 = [
    "VEINTE",
    "TREINTA",
    "CUARENTA",
    "CINCUENTA",
    "SESENTA",
    "SETENTA",
    "OCHENTA",
    "NOVENTA",
  ];
  const centenas = [
    "",
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

  function convertirGrupo(n: number, esMil: boolean = false): string {
    let output = "";
    if (n === 100) return "CIEN";

    if (n > 100) {
      output += centenas[Math.floor(n / 100)] + " ";
      n %= 100;
    }

    if (n >= 10 && n <= 19) {
      output += decenas[n - 10];
    } else if (n >= 20) {
      if (n === 20) {
        output += "VEINTE";
      } else if (n < 30) {
        // Del 21 al 29
        output += "VEINTI" + (n === 21 && esMil ? "UN" : unidades[n % 10]);
      } else {
        // Del 30 para arriba (¡AQUÍ ESTABA EL BUG, YA CORREGIDO CON - 2!)
        output += decenas2[Math.floor(n / 10) - 2];
        n %= 10;
        if (n > 0) {
          output += " Y " + (n === 1 && esMil ? "UN" : unidades[n]);
        }
      }
    } else if (n > 0) {
      output += n === 1 && esMil ? "UN" : unidades[n];
    }

    return output.trim();
  }

  // Lógica de decimales y armado final
  const entero = Math.floor(num);
  const centavos = Math.round((num - entero) * 100);
  const strCentavos = centavos < 10 ? "0" + centavos : centavos.toString();

  if (entero === 0) return `CERO CON ${strCentavos}/100 SOLES`;

  let output = "";
  if (entero >= 1000) {
    const miles = Math.floor(entero / 1000);
    if (miles === 1) {
      output += "MIL ";
    } else {
      // Le pasamos 'true' para que diga "VEINTIUN MIL" en vez de "VEINTIUNO MIL"
      output += convertirGrupo(miles, true) + " MIL ";
    }
  }

  const resto = entero % 1000;
  if (resto > 0) {
    output += convertirGrupo(resto, false);
  }

  return `${output.trim()} CON ${strCentavos}/100 SOLES`;
}
