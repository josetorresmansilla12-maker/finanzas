"use strict";

  // =========================================================
  // COMPRAS FICTICIAS
  //
  // Una hoja de prueba: se anotan objeto, valor y (opcional) fecha, y se
  // arma un comprobante con el mismo formato que los de la Calculadora.
  // Las compras sin fecha se reparten entre los días que se marquen en el
  // calendario del mes elegido.
  //
  // Nada de esto se guarda: vive solo en esta pantalla (no va al
  // almacenamiento, ni a la nube, ni a los respaldos, ni a las
  // estadísticas). Al salir de la pestaña o cerrar la app se avisa que se
  // va a borrar. El comprobante dice "Simulación" para que nunca se
  // confunda con uno real.
  // =========================================================

  var ficticiasLista = document.getElementById("ficticias-lista");
  var ficticiasAgregarBtn = document.getElementById("ficticias-agregar-btn");
  var ficticiasMes = document.getElementById("ficticias-mes");
  var ficticiasRangoDesde = document.getElementById("ficticias-rango-desde");
  var ficticiasRangoHasta = document.getElementById("ficticias-rango-hasta");
  var ficticiasCalendario = document.getElementById("ficticias-calendario");
  var ficticiasDiasTexto = document.getElementById("ficticias-dias-texto");
  var ficticiasTitulo = document.getElementById("ficticias-titulo");
  var ficticiasError = document.getElementById("ficticias-error");
  var ficticiasResultado = document.getElementById("ficticias-resultado");
  var ficticiasVacio = document.getElementById("ficticias-vacio");
  var ficticiasPdfBtn = document.getElementById("ficticias-pdf-btn");
  var ficticiasTotalParcial = document.getElementById("ficticias-total-parcial");
  var ficticiasMontoTotal = document.getElementById("ficticias-monto-total");

  var DIAS_CORTOS = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"];
  var ficticiasDias = new Set(); // días del mes marcados (números)
  var ficticiasGenerado = false;

  // ---------- Filas de compras ----------

  function filasFicticias() {
    return Array.from(ficticiasLista.querySelectorAll(".ficticia-fila"));
  }

  function agregarFilaFicticia(enfocar) {
    var row = document.createElement("div");
    row.className = "ficticia-fila";

    var objeto = document.createElement("input");
    objeto.type = "text";
    objeto.className = "ficticia-objeto";
    objeto.placeholder = "Objeto (ej: polerón)";
    objeto.setAttribute("aria-label", "Objeto");
    objeto.addEventListener("blur", function () { objeto.value = corregirOrtografia(objeto.value); });
    objeto.addEventListener("input", actualizarTotalFicticias);

    var valor = document.createElement("input");
    valor.type = "number";
    valor.min = "0";
    valor.step = "1";
    valor.inputMode = "numeric";
    valor.className = "ficticia-valor";
    valor.placeholder = "Valor $";
    valor.setAttribute("aria-label", "Valor");
    // Un valor escrito a mano queda "ajustado": "Cuadrar con el total" ya
    // no lo toca, solo reparte la diferencia entre los demás.
    valor.addEventListener("input", function () {
      row.dataset.ajustado = valor.value ? "1" : "";
      actualizarTotalFicticias();
    });
    // Enter en el valor de la última fila = otra fila.
    valor.addEventListener("keydown", function (e) {
      if (e.key !== "Enter") return;
      e.preventDefault();
      if (filasFicticias()[filasFicticias().length - 1] === row) agregarFilaFicticia(true);
    });

    var fecha = document.createElement("input");
    fecha.type = "date";
    fecha.className = "ficticia-fecha";
    fecha.title = "Opcional: si la dejas vacía, se usa uno de los días marcados en el calendario";
    fecha.setAttribute("aria-label", "Fecha (opcional)");

    var quitar = document.createElement("button");
    quitar.type = "button";
    quitar.className = "reg-quitar";
    quitar.textContent = "✕";
    quitar.setAttribute("aria-label", "Quitar esta compra");
    quitar.addEventListener("click", function () {
      row.remove();
      if (!filasFicticias().length) agregarFilaFicticia(false);
      actualizarTotalFicticias();
    });

    row.appendChild(objeto);
    row.appendChild(valor);
    row.appendChild(fecha);
    row.appendChild(quitar);
    ficticiasLista.appendChild(row);
    if (enfocar) objeto.focus();
    actualizarTotalFicticias();
  }

  // ---------- Total parcial y reparto de un monto ----------

  function valorDe(row) {
    return Number(row.querySelector(".ficticia-valor").value) || 0;
  }

  function filasConObjeto() {
    return filasFicticias().filter(function (row) { return row.querySelector(".ficticia-objeto").value.trim(); });
  }

  // Total parcial en vivo; si hay un monto a repartir, cuánto falta o sobra.
  function actualizarTotalFicticias() {
    var filas = filasFicticias().filter(function (row) { return row.querySelector(".ficticia-objeto").value.trim() || valorDe(row); });
    var suma = filas.reduce(function (s, row) { return s + valorDe(row); }, 0);
    var meta = Number(ficticiasMontoTotal.value) || 0;
    var texto = "Total parcial: " + formatCurrency(suma) + " · " + filas.length + (filas.length === 1 ? " compra" : " compras");
    var clase = "";
    if (meta > 0) {
      var dif = meta - suma;
      if (dif === 0) { texto += " · ✅ cuadra con " + formatCurrency(meta); clase = "ok"; }
      else if (dif > 0) { texto += " · faltan " + formatCurrency(dif) + " para " + formatCurrency(meta); clase = "falta"; }
      else { texto += " · sobran " + formatCurrency(-dif) + " sobre " + formatCurrency(meta); clase = "falta"; }
    }
    ficticiasTotalParcial.textContent = texto;
    ficticiasTotalParcial.className = "ficticias-total-parcial" + (clase ? " " + clase : "");
  }

  // Reparte `monto` en partes parejas (redondeadas a $10) entre `filas`;
  // la última se lleva el resto para que la suma sea exacta.
  function repartirMonto(filas, monto) {
    var n = filas.length;
    var base = Math.floor(monto / n / 10) * 10;
    filas.forEach(function (row, i) {
      var v = i === n - 1 ? monto - base * (n - 1) : base;
      row.querySelector(".ficticia-valor").value = String(v);
      row.dataset.ajustado = "";
    });
    actualizarTotalFicticias();
  }

  function montoMeta() {
    var meta = Number(ficticiasMontoTotal.value) || 0;
    if (meta <= 0) {
      showToast("Escribe primero el monto total a repartir.");
      ficticiasMontoTotal.focus();
    }
    return meta;
  }

  document.getElementById("ficticias-repartir-btn").addEventListener("click", function () {
    var meta = montoMeta();
    if (!meta) return;
    var filas = filasConObjeto();
    if (!filas.length) { showToast("Escribe al menos un objeto para repartir el monto."); return; }
    repartirMonto(filas, meta);
    showToast(formatCurrency(meta) + " repartidos entre " + filas.length + (filas.length === 1 ? " compra." : " compras. Ajusta los que quieras."));
  });

  document.getElementById("ficticias-repartir-vacias-btn").addEventListener("click", function () {
    var meta = montoMeta();
    if (!meta) return;
    var vacias = filasConObjeto().filter(function (row) { return !valorDe(row); });
    if (!vacias.length) { showToast("Todas las compras ya tienen valor: usa \"Cuadrar con el total\"."); return; }
    var usado = filasConObjeto().filter(function (row) { return valorDe(row); }).reduce(function (s, row) { return s + valorDe(row); }, 0);
    var resto = meta - usado;
    if (resto < vacias.length * 10) { showToast("No queda monto para las que no tienen valor: los demás ya suman " + formatCurrency(usado) + "."); return; }
    repartirMonto(vacias, resto);
    showToast(formatCurrency(resto) + " repartidos entre las " + vacias.length + " compras sin valor.");
  });

  // Después de ajustar algunos valores a mano: la diferencia con el total
  // se reparte solo entre las compras que no se tocaron.
  document.getElementById("ficticias-cuadrar-btn").addEventListener("click", function () {
    var meta = montoMeta();
    if (!meta) return;
    var filas = filasConObjeto();
    if (!filas.length) { showToast("Escribe al menos un objeto."); return; }
    var suma = filas.reduce(function (s, row) { return s + valorDe(row); }, 0);
    var dif = meta - suma;
    if (dif === 0) { showToast("Ya cuadra con " + formatCurrency(meta) + "."); return; }
    var libres = filas.filter(function (row) { return row.dataset.ajustado !== "1"; });
    if (!libres.length) { showToast("Ajustaste todas a mano: deja alguna sin tocar o corrige un valor."); return; }
    var sumaLibres = libres.reduce(function (s, row) { return s + valorDe(row); }, 0);
    if (sumaLibres + dif < libres.length * 10) {
      showToast("No alcanza: lo que ajustaste a mano ya suma más que el total. Baja algún valor.");
      return;
    }
    repartirMonto(libres, sumaLibres + dif);
    showToast("Listo: la diferencia (" + formatCurrency(Math.abs(dif)) + ") se repartió entre " + libres.length + (libres.length === 1 ? " compra." : " compras."));
  });

  ficticiasMontoTotal.addEventListener("input", actualizarTotalFicticias);

  function leerFicticias() {
    return filasFicticias().map(function (row) {
      return {
        objeto: row.querySelector(".ficticia-objeto").value.trim(),
        valor: Number(row.querySelector(".ficticia-valor").value) || 0,
        fecha: row.querySelector(".ficticia-fecha").value || null
      };
    }).filter(function (f) { return f.objeto || f.valor; });
  }

  // ---------- Calendario del mes ----------

  function mesElegido() {
    return ficticiasMes.value || todayStamp().slice(0, 7);
  }

  function diasDelMes() {
    var p = mesElegido().split("-").map(Number);
    return new Date(p[0], p[1], 0).getDate();
  }

  function isoDelDia(dia) {
    return mesElegido() + "-" + String(dia).padStart(2, "0");
  }

  function renderCalendarioFicticias() {
    ficticiasCalendario.innerHTML = "";
    DIAS_CORTOS.forEach(function (d) {
      var h = document.createElement("span");
      h.className = "ficticias-cal-head";
      h.textContent = d;
      ficticiasCalendario.appendChild(h);
    });
    var p = mesElegido().split("-").map(Number);
    // Lunes primero: getDay() da 0 = domingo.
    var desfase = (new Date(p[0], p[1] - 1, 1).getDay() + 6) % 7;
    for (var i = 0; i < desfase; i++) ficticiasCalendario.appendChild(document.createElement("span"));
    var total = diasDelMes();
    for (var dia = 1; dia <= total; dia++) {
      (function (d) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "ficticias-dia" + (ficticiasDias.has(d) ? " active" : "") + (isoDelDia(d) === todayStamp() ? " hoy" : "");
        b.textContent = String(d);
        b.setAttribute("aria-pressed", String(ficticiasDias.has(d)));
        b.addEventListener("click", function () {
          if (ficticiasDias.has(d)) ficticiasDias.delete(d); else ficticiasDias.add(d);
          renderCalendarioFicticias();
        });
        ficticiasCalendario.appendChild(b);
      })(dia);
    }
    var n = ficticiasDias.size;
    ficticiasDiasTexto.textContent = n === 0 ? "Ningún día marcado."
      : n + (n === 1 ? " día marcado en " : " días marcados en ") + monthLabel(mesElegido()).toLowerCase() + ".";
  }

  function marcarDias(filtro) {
    ficticiasDias = new Set();
    for (var d = 1; d <= diasDelMes(); d++) if (filtro(d)) ficticiasDias.add(d);
    renderCalendarioFicticias();
  }

  ficticiasMes.addEventListener("change", function () {
    // Al cambiar de mes se quitan los días que ese mes no tiene (ej. 31).
    var total = diasDelMes();
    ficticiasDias.forEach(function (d) { if (d > total) ficticiasDias.delete(d); });
    renderCalendarioFicticias();
  });
  document.getElementById("ficticias-todos-btn").addEventListener("click", function () { marcarDias(function () { return true; }); });
  document.getElementById("ficticias-ninguno-btn").addEventListener("click", function () { marcarDias(function () { return false; }); });
  document.getElementById("ficticias-habiles-btn").addEventListener("click", function () {
    marcarDias(function (d) { var dow = new Date(isoDelDia(d) + "T00:00:00").getDay(); return dow !== 0 && dow !== 6; });
  });
  document.getElementById("ficticias-rango-btn").addEventListener("click", function () {
    var total = diasDelMes();
    var desde = Math.max(1, Math.min(total, Number(ficticiasRangoDesde.value) || 1));
    var hasta = Math.max(1, Math.min(total, Number(ficticiasRangoHasta.value) || total));
    if (desde > hasta) { var t = desde; desde = hasta; hasta = t; }
    for (var d = desde; d <= hasta; d++) ficticiasDias.add(d);
    renderCalendarioFicticias();
  });

  // ---------- Generar el comprobante ----------

  // Reparte las compras sin fecha entre los días marcados: en orden
  // aleatorio, pero parejo (ningún día recibe dos antes de que todos
  // tengan una).
  function repartirEnDias(cantidad) {
    var dias = Array.from(ficticiasDias);
    for (var i = dias.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = dias[i]; dias[i] = dias[j]; dias[j] = t;
    }
    var fechas = [];
    for (var k = 0; k < cantidad; k++) fechas.push(isoDelDia(dias[k % dias.length]));
    return fechas;
  }

  function generarFicticias() {
    ficticiasError.textContent = "";
    var compras = leerFicticias();
    if (!compras.length) {
      ficticiasError.textContent = "Agrega al menos una compra con su objeto y valor.";
      return;
    }
    if (compras.some(function (c) { return !c.valor || c.valor <= 0; })) {
      ficticiasError.textContent = "A una de las compras le falta el valor.";
      return;
    }
    var sinFecha = compras.filter(function (c) { return !c.fecha; });
    if (sinFecha.length && !ficticiasDias.size) {
      ficticiasError.textContent = "Hay compras sin fecha: marca en el calendario los días en que quieres que aparezcan.";
      return;
    }
    var fechas = repartirEnDias(sinFecha.length);
    sinFecha.forEach(function (c, i) { c.fecha = fechas[i]; });
    compras.sort(function (a, b) { return a.fecha.localeCompare(b.fecha); });
    renderComprobanteFicticio(compras);
  }

  function renderComprobanteFicticio(compras) {
    ficticiasResultado.innerHTML = "";
    ficticiasVacio.classList.add("hidden");

    var header = document.createElement("div");
    header.className = "informe-report-header";
    var h2 = document.createElement("h2");
    h2.textContent = ficticiasTitulo.value.trim() || "Detalle de compras";
    header.appendChild(h2);
    var meta = document.createElement("p");
    meta.className = "informe-report-meta";
    var desde = compras[0].fecha;
    var hasta = compras[compras.length - 1].fecha;
    meta.textContent = compras.length + (compras.length === 1 ? " compra" : " compras") +
      (desde === hasta ? " · " + formatDateDisplay(desde) : " · del " + formatDateDisplay(desde) + " al " + formatDateDisplay(hasta));
    header.appendChild(meta);
    var marca = document.createElement("p");
    marca.className = "informe-report-fecha ficticia-marca";
    marca.textContent = "Simulación · generado el " + nowDisplayDateTime();
    header.appendChild(marca);
    ficticiasResultado.appendChild(header);

    var wrap = document.createElement("div");
    wrap.className = "table-wrapper";
    var table = document.createElement("table");
    table.className = "informe-tabla";
    table.innerHTML = "<thead><tr><th>Fecha</th><th>Detalle</th><th class=\"col-value\">Monto</th></tr></thead>";
    var tbody = document.createElement("tbody");
    compras.forEach(function (c) {
      var tr = document.createElement("tr");
      var tdF = document.createElement("td");
      tdF.textContent = formatDateDisplay(c.fecha);
      tr.appendChild(tdF);
      var tdD = document.createElement("td");
      var titulo = document.createElement("div");
      titulo.className = "informe-detalle-titulo";
      titulo.textContent = corregirOrtografia(c.objeto) || "Compra";
      tdD.appendChild(titulo);
      tr.appendChild(tdD);
      var tdM = document.createElement("td");
      tdM.className = "col-value";
      tdM.textContent = formatCurrency(c.valor);
      tr.appendChild(tdM);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    ficticiasResultado.appendChild(wrap);

    var total = compras.reduce(function (s, c) { return s + c.valor; }, 0);
    var resumen = document.createElement("div");
    resumen.className = "informe-total-general";
    var fila = document.createElement("div");
    fila.className = "informe-total-fila";
    var label = document.createElement("span");
    label.className = "informe-total-fila-label";
    label.textContent = "Total";
    var valor = document.createElement("span");
    valor.className = "informe-total-fila-valores";
    var strong = document.createElement("strong");
    strong.textContent = formatCurrency(total);
    valor.appendChild(strong);
    fila.appendChild(label);
    fila.appendChild(valor);
    resumen.appendChild(fila);
    ficticiasResultado.appendChild(resumen);

    ficticiasPdfBtn.classList.remove("hidden");
    ficticiasGenerado = true;
    ficticiasResultado.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ---------- Borrar / salir ----------

  function hayDatosFicticios() {
    return ficticiasGenerado || leerFicticias().length > 0;
  }

  function limpiarFicticias() {
    ficticiasLista.innerHTML = "";
    agregarFilaFicticia(false);
    ficticiasDias = new Set();
    ficticiasMes.value = todayStamp().slice(0, 7);
    ficticiasRangoDesde.value = "";
    ficticiasRangoHasta.value = "";
    ficticiasTitulo.value = "";
    ficticiasMontoTotal.value = "";
    ficticiasError.textContent = "";
    ficticiasResultado.innerHTML = "";
    ficticiasVacio.classList.remove("hidden");
    ficticiasPdfBtn.classList.add("hidden");
    ficticiasGenerado = false;
    renderCalendarioFicticias();
    actualizarTotalFicticias();
  }

  // Lo llama activateTab (tabs.js) antes de salir de esta pestaña.
  function confirmarSalidaFicticias() {
    if (!hayDatosFicticios()) return true;
    if (!window.confirm("Si sales de Compras ficticias se borrarán las compras que ingresaste y el comprobante. ¿Salir igual?")) return false;
    limpiarFicticias();
    return true;
  }

  // Cerrar o recargar la app con datos ingresados: el navegador pregunta.
  window.addEventListener("beforeunload", function (e) {
    if (!hayDatosFicticios()) return;
    e.preventDefault();
    e.returnValue = "";
  });

  ficticiasAgregarBtn.addEventListener("click", function () { agregarFilaFicticia(true); });
  document.getElementById("ficticias-generar-btn").addEventListener("click", generarFicticias);
  document.getElementById("ficticias-limpiar-btn").addEventListener("click", function () {
    if (!hayDatosFicticios() || window.confirm("¿Borrar todas las compras ficticias y el comprobante?")) limpiarFicticias();
  });
  ficticiasPdfBtn.addEventListener("click", function () {
    descargarPdfDe(ficticiasResultado, ficticiasTitulo.value.trim() || "Detalle_de_compras", ficticiasPdfBtn);
  });

  ficticiasMes.value = todayStamp().slice(0, 7);
  agregarFilaFicticia(false);
  renderCalendarioFicticias();
