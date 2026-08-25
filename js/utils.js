"use strict";

  // ---------- Generic helpers ----------

  function uid() {
    return "id_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  function todayStamp() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function nowTimeStamp() {
    var d = new Date();
    return String(d.getHours()).padStart(2, "0") + "-" + String(d.getMinutes()).padStart(2, "0");
  }

  function nowDisplayDateTime() {
    var d = new Date();
    var time = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
    return formatDateDisplay(todayStamp()) + " a las " + time;
  }

  function formatCurrency(value) {
    var n = Number(value) || 0;
    return "$" + n.toLocaleString("es-CL", { maximumFractionDigits: 0 });
  }

  function formatDateDisplay(isoDate) {
    if (!isoDate) return "";
    var parts = isoDate.split("-");
    if (parts.length !== 3) return isoDate;
    return parts[2] + "/" + parts[1] + "/" + parts[0];
  }

  function monthKey(dateStr) {
    return (dateStr || "").slice(0, 7);
  }

  function monthLabel(key) {
    var parts = key.split("-");
    var y = parts[0];
    var m = parseInt(parts[1], 10) - 1;
    var name = MESES[m] || "";
    return name.charAt(0).toUpperCase() + name.slice(1) + " " + y;
  }

  function daysBetweenDates(fromStamp, toStamp) {
    var d1 = new Date(fromStamp + "T00:00:00");
    var d2 = new Date(toStamp + "T00:00:00");
    return Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
  }

  // Suma "n" meses a una fecha ISO, preservando el día cuando el mes de
  // destino lo tiene, o usando su último día cuando no (ej. 31 de enero + 1
  // mes = 28/29 de febrero, no marzo).
  function addMonthsToIso(iso, n) {
    var parts = iso.split("-").map(Number);
    var y = parts[0], m = parts[1] - 1, d = parts[2];
    var totalMonth = m + n;
    var ny = y + Math.floor(totalMonth / 12);
    var nm = ((totalMonth % 12) + 12) % 12;
    var lastDay = new Date(ny, nm + 1, 0).getDate();
    var nd = Math.min(d, lastDay);
    return ny + "-" + String(nm + 1).padStart(2, "0") + "-" + String(nd).padStart(2, "0");
  }

  function addDaysToIso(iso, n) {
    var d = new Date(iso + "T00:00:00");
    d.setDate(d.getDate() + n);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  // ---------- Filtro temporal reutilizable ----------
  //
  // Dos modalidades en un mismo selector: rangos dinámicos (que se mueven con
  // el día de hoy) y meses literales del calendario. Los meses se arman con
  // las fechas que realmente tienen datos, para no ofrecer meses vacíos.

  var RANGOS_DINAMICOS = [
    { value: "d30", label: "Últimos 30 días" },
    { value: "m3", label: "Últimos 3 meses" },
    { value: "m6", label: "Últimos 6 meses" },
    { value: "all", label: "Todo el tiempo" }
  ];

  function buildTimeFilterOptions(selectEl, fechas, valorPorDefecto) {
    var previousValue = selectEl.value || valorPorDefecto;
    selectEl.innerHTML = "";

    RANGOS_DINAMICOS.forEach(function (r) {
      var o = document.createElement("option");
      o.value = r.value;
      o.textContent = r.label;
      selectEl.appendChild(o);
    });

    var meses = Array.from(new Set(fechas.filter(Boolean).map(monthKey))).sort().reverse();
    if (meses.length > 0) {
      var group = document.createElement("optgroup");
      group.label = "Mes específico";
      meses.forEach(function (key) {
        var o = document.createElement("option");
        o.value = key;
        o.textContent = monthLabel(key);
        group.appendChild(o);
      });
      selectEl.appendChild(group);
    }

    var existe = Array.from(selectEl.querySelectorAll("option")).some(function (o) { return o.value === previousValue; });
    selectEl.value = existe ? previousValue : valorPorDefecto;
  }

  function timeFilterMatches(value, fecha) {
    if (!fecha || !value || value === "all") return true;
    if (value === "d30") return fecha >= addDaysToIso(todayStamp(), -30);
    if (value === "m3") return fecha >= addMonthsToIso(todayStamp(), -3);
    if (value === "m6") return fecha >= addMonthsToIso(todayStamp(), -6);
    return monthKey(fecha) === value; // mes literal (YYYY-MM)
  }

  function timeFilterLabel(value) {
    var r = RANGOS_DINAMICOS.find(function (x) { return x.value === value; });
    return r ? r.label : monthLabel(value);
  }

  var toastEl = document.getElementById("toast");
  var toastTimer = null;

  function showToast(message, actionLabel, actionFn) {
    toastEl.innerHTML = "";

    var textEl = document.createElement("span");
    textEl.className = "toast-text";
    textEl.textContent = message;
    toastEl.appendChild(textEl);

    if (actionLabel && actionFn) {
      var actionBtn = document.createElement("button");
      actionBtn.type = "button";
      actionBtn.className = "toast-action-btn";
      actionBtn.textContent = actionLabel;
      actionBtn.addEventListener("click", function () {
        if (toastTimer) clearTimeout(toastTimer);
        toastEl.classList.add("hidden");
        actionFn();
      });
      toastEl.appendChild(actionBtn);
    }

    toastEl.classList.remove("hidden");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.add("hidden");
    }, actionLabel ? 5000 : 2500);
  }

  // ---------- Corrección ligera de descripciones ----------
  //
  // No es un corrector ortográfico completo (la app no usa librerías externas
  // ni conexión a internet): solo agrega la mayúscula inicial y arregla un
  // conjunto de tildes/ñ que son seguras de corregir sin riesgo de cambiar el
  // sentido — palabras sin otra forma válida en español (ej. "telefono" no
  // significa nada distinto de "teléfono"), más dos reglas generales sin
  // excepciones (sustantivos terminados en "-cion"/"-sion" siempre llevan
  // tilde). Nunca reemplaza una palabra por otra ni reordena el texto.
  var CORRECCION_PALABRAS = {
    telefono: "teléfono", numero: "número", articulo: "artículo", musica: "música",
    pelicula: "película", peliculas: "películas", camara: "cámara", camaras: "cámaras",
    credito: "crédito", debito: "débito", medico: "médico", medica: "médica",
    publico: "público", publica: "pública", basico: "básico", basica: "básica",
    electronico: "electrónico", electronica: "electrónica",
    electrodomestico: "electrodoméstico", electrodomesticos: "electrodomésticos",
    utiles: "útiles", ultimo: "último", ultima: "última", unico: "único", unica: "única",
    rapido: "rápido", rapida: "rápida", facil: "fácil", dificil: "difícil",
    jabon: "jabón", colchon: "colchón", cancion: "canción", canciones: "canciones",
    television: "televisión", jamon: "jamón", salmon: "salmón", limon: "limón",
    camion: "camión", avion: "avión", algodon: "algodón", boton: "botón",
    raton: "ratón", cajon: "cajón", balon: "balón", sillon: "sillón",
    calzon: "calzón", pantalon: "pantalón", corazon: "corazón", cordon: "cordón",
    tapon: "tapón", porton: "portón", kilometro: "kilómetro", kilometros: "kilómetros",
    termometro: "termómetro", sabado: "sábado", miercoles: "miércoles",
    cumpleanos: "cumpleaños", nino: "niño", nina: "niña", ninos: "niños", ninas: "niñas",
    bano: "baño", banos: "baños", senor: "señor", senora: "señora", manana: "mañana",
    pequeno: "pequeño", pequena: "pequeña", diseno: "diseño", tamano: "tamaño"
  };

  function preservarMayuscula(original, corregida) {
    if (original.charAt(0) === original.charAt(0).toUpperCase() && /[a-zA-ZÁÉÍÓÚÑ]/.test(original.charAt(0))) {
      return corregida.charAt(0).toUpperCase() + corregida.slice(1);
    }
    return corregida;
  }

  function corregirOrtografia(texto) {
    if (!texto) return texto;
    var corregido = texto.replace(/[a-záéíóúñA-ZÁÉÍÓÚÑ]+/g, function (palabra) {
      var minus = palabra.toLowerCase();
      var fix = CORRECCION_PALABRAS[minus];
      if (!fix && /cion$/.test(minus)) fix = minus.slice(0, -4) + "ción";
      if (!fix && /sion$/.test(minus)) fix = minus.slice(0, -4) + "sión";
      return fix ? preservarMayuscula(palabra, fix) : palabra;
    });
    // Mayúscula inicial: al principio del texto y después de cada punto,
    // signo de exclamación o interrogación seguido de espacio.
    corregido = corregido.replace(/(^\s*|[.!?]\s+)([a-záéíóúñ])/g, function (m, pre, letra) {
      return pre + letra.toUpperCase();
    });
    return corregido;
  }

  function csvEscape(value) {
    var str = String(value == null ? "" : value);
    if (/[",\n]/.test(str)) {
      str = '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  function downloadFile(filename, content, mimeType) {
    var blob = new Blob([content], { type: mimeType });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
