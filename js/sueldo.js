"use strict";

  // =========================================================
  // MI SUELDO — registro de ingresos personales (sueldo fijo e ingresos
  // extra), deliberadamente aislado del resto de las finanzas, más sus
  // propias estadísticas: distribución por porcentajes y flujo de gastos
  // pagados con el sueldo.
  // =========================================================

  var sueldoForm = document.getElementById("sueldo-form");
  var sueldoIdInput = document.getElementById("sueldo-id");
  var sueldoFechaInput = document.getElementById("sueldo-fecha");
  var sueldoMontoInput = document.getElementById("sueldo-monto");
  var sueldoConceptoInput = document.getElementById("sueldo-concepto");
  var sueldoNotasInput = document.getElementById("sueldo-notas");
  var submitSueldoBtn = document.getElementById("submit-sueldo-btn");
  var cancelEditSueldoBtn = document.getElementById("cancel-edit-sueldo-btn");
  var formTitleSueldo = document.getElementById("form-title-sueldo");

  var sueldoTotalPeriodoEl = document.getElementById("sueldo-total-periodo");
  var sueldoMonthsWrapper = document.getElementById("sueldo-months-wrapper");
  var sueldoEmptyState = document.getElementById("sueldo-empty-state");

  var sueldoPeriodSelect = document.getElementById("sueldo-period-select");
  var sueldoStatFijoEl = document.getElementById("sueldo-stat-fijo");
  var sueldoStatExtraEl = document.getElementById("sueldo-stat-extra");
  var sueldoStatTotalEl = document.getElementById("sueldo-stat-total");
  var sueldoStatGastadoEl = document.getElementById("sueldo-stat-gastado");
  var sueldoStatDisponibleEl = document.getElementById("sueldo-stat-disponible");
  var sueldoSaldoTarjetaEl = document.getElementById("sueldo-saldo-tarjeta");
  var sueldoSaldoEfectivoEl = document.getElementById("sueldo-saldo-efectivo");
  var sueldoDestinoField = document.getElementById("sueldo-destino-field");
  var sueldoOrigenHint = document.getElementById("sueldo-origen-hint");
  var sueldoPieRealChartEl = document.getElementById("sueldo-pie-real-chart");
  var sueldoPieRealLegendEl = document.getElementById("sueldo-pie-real-legend");
  var sueldoSobresWrapper = document.getElementById("sueldo-sobres-wrapper");

  var distribucionRowsEl = document.getElementById("distribucion-rows");
  var distribucionAddBtn = document.getElementById("distribucion-add-btn");
  var distribucionTotalHint = document.getElementById("distribucion-total-hint");
  var sueldoPieChartEl = document.getElementById("sueldo-pie-chart");
  var sueldoPieLegendEl = document.getElementById("sueldo-pie-legend");

  var sueldoFlujoEmpty = document.getElementById("sueldo-flujo-empty");
  var sueldoFlujoWrapper = document.getElementById("sueldo-flujo-wrapper");

  // ---------- Tipo de movimiento ----------
  //
  // Un retiro no es plata nueva: solo mueve dinero de la tarjeta al efectivo,
  // así que no suma al fondo total ni tiene "destino" que elegir.

  function selectedSueldoOrigen() {
    var checked = document.querySelector('input[name="sueldo-origen"]:checked');
    return checked ? checked.value : "sueldo";
  }

  function updateSueldoOrigenFields() {
    var esRetiro = selectedSueldoOrigen() === "retiro";
    sueldoDestinoField.classList.toggle("hidden", esRetiro);
    sueldoOrigenHint.textContent = esRetiro
      ? "El retiro no suma al fondo total: mueve el monto de la tarjeta al efectivo."
      : "";
  }

  document.querySelectorAll('input[name="sueldo-origen"]').forEach(function (radio) {
    radio.addEventListener("change", updateSueldoOrigenFields);
  });

  // ---------- Formulario ----------

  function clearSueldoErrors() {
    ["sueldo-fecha", "sueldo-monto"].forEach(function (id) {
      document.getElementById("error-" + id).textContent = "";
      document.getElementById(id).classList.remove("invalid");
    });
  }

  function setSueldoError(fieldId, message) {
    document.getElementById("error-" + fieldId).textContent = message;
    document.getElementById(fieldId).classList.add("invalid");
  }

  function validateSueldoForm(data) {
    clearSueldoErrors();
    var valid = true;
    if (!data.fecha) {
      setSueldoError("sueldo-fecha", "Selecciona la fecha del ingreso.");
      valid = false;
    }
    if (data.monto === "" || isNaN(data.monto) || Number(data.monto) <= 0) {
      setSueldoError("sueldo-monto", "Ingresa un monto válido (mayor a cero).");
      valid = false;
    }
    return valid;
  }

  function resetSueldoForm() {
    sueldoForm.reset();
    sueldoIdInput.value = "";
    editingSueldoId = null;
    clearSueldoErrors();
    sueldoFechaInput.value = todayStamp();
    document.querySelector('input[name="sueldo-origen"][value="sueldo"]').checked = true;
    document.querySelector('input[name="sueldo-destino"][value="tarjeta"]').checked = true;
    updateSueldoOrigenFields();
    submitSueldoBtn.textContent = "Registrar ingreso";
    formTitleSueldo.textContent = "Registrar ingreso";
    cancelEditSueldoBtn.classList.add("hidden");
  }

  function startEditSueldo(id) {
    var entry = loadSueldo().find(function (s) { return s.id === id; });
    if (!entry) return;

    editingSueldoId = id;
    sueldoIdInput.value = id;
    sueldoFechaInput.value = entry.fecha;
    sueldoMontoInput.value = entry.monto;
    sueldoConceptoInput.value = entry.concepto || "";
    sueldoNotasInput.value = entry.notas || "";
    var origenRadio = document.querySelector('input[name="sueldo-origen"][value="' + (entry.origen || "sueldo") + '"]');
    if (origenRadio) origenRadio.checked = true;
    var destinoRadio = document.querySelector('input[name="sueldo-destino"][value="' + (entry.destino || "tarjeta") + '"]');
    if (destinoRadio) destinoRadio.checked = true;
    updateSueldoOrigenFields();

    submitSueldoBtn.textContent = "Guardar cambios";
    formTitleSueldo.textContent = "Editar ingreso";
    cancelEditSueldoBtn.classList.remove("hidden");
    clearSueldoErrors();
    activateTab("sueldo");
    sueldoForm.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  cancelEditSueldoBtn.addEventListener("click", resetSueldoForm);

  sueldoForm.addEventListener("submit", function (e) {
    e.preventDefault();

    var origen = selectedSueldoOrigen();
    var data = {
      fecha: sueldoFechaInput.value,
      monto: sueldoMontoInput.value,
      origen: origen,
      destino: origen === "retiro" ? null : document.querySelector('input[name="sueldo-destino"]:checked').value,
      concepto: sueldoConceptoInput.value.trim() || null,
      notas: sueldoNotasInput.value.trim() || null
    };

    if (!validateSueldoForm(data)) return;

    var lista = loadSueldo();

    if (editingSueldoId) {
      var idx = lista.findIndex(function (s) { return s.id === editingSueldoId; });
      if (idx !== -1) {
        lista[idx].fecha = data.fecha;
        lista[idx].monto = Number(data.monto);
        lista[idx].origen = data.origen;
        lista[idx].destino = data.destino;
        lista[idx].concepto = data.concepto;
        lista[idx].notas = data.notas;
      }
      showToast("Movimiento actualizado.");
    } else {
      lista.push({ id: uid(), fecha: data.fecha, monto: Number(data.monto), origen: data.origen, destino: data.destino, concepto: data.concepto, notas: data.notas, createdAt: Date.now() });
      showToast(data.origen === "retiro" ? "Retiro registrado." : "Ingreso registrado.");
    }

    if (saveSueldo(lista)) {
      resetSueldoForm();
      renderAll();
    }
  });

  // ---------- Listado de ingresos ----------

  function origenIngresoLabel(entry) {
    if (entry.origen === "retiro") return "Retiro";
    return entry.origen === "extra" ? "Ingreso extra" : "Sueldo fijo";
  }

  function esRetiro(entry) {
    return entry.origen === "retiro";
  }

  function destinoLabel(entry) {
    if (esRetiro(entry)) return "Tarjeta → efectivo";
    return entry.destino === "efectivo" ? "Efectivo" : "Tarjeta / cuenta";
  }

  function buildSueldoRow(entry) {
    var tr = document.createElement("tr");

    var tdFecha = document.createElement("td");
    tdFecha.textContent = formatDateDisplay(entry.fecha);
    tr.appendChild(tdFecha);

    var tdTipo = document.createElement("td");
    var tipoTag = document.createElement("span");
    tipoTag.className = "ingreso-tag " + (esRetiro(entry) ? "retiro" : (entry.origen === "extra" ? "extra" : "fijo"));
    tipoTag.textContent = origenIngresoLabel(entry);
    tdTipo.appendChild(tipoTag);
    tr.appendChild(tdTipo);

    var tdConcepto = document.createElement("td");
    tdConcepto.textContent = entry.concepto || (esRetiro(entry) ? "Retiro a efectivo" : "Ingreso");
    tr.appendChild(tdConcepto);

    var tdDestino = document.createElement("td");
    tdDestino.textContent = destinoLabel(entry);
    tr.appendChild(tdDestino);

    var tdMonto = document.createElement("td");
    tdMonto.className = "col-value";
    tdMonto.textContent = formatCurrency(entry.monto);
    tr.appendChild(tdMonto);

    var tdActions = document.createElement("td");
    tdActions.className = "col-actions";
    var actionsWrap = document.createElement("div");
    actionsWrap.className = "row-actions";

    var editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "btn btn-secondary btn-small";
    editBtn.textContent = "Editar";
    editBtn.addEventListener("click", function () { startEditSueldo(entry.id); });
    actionsWrap.appendChild(editBtn);

    var deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "btn btn-danger btn-small";
    deleteBtn.textContent = "Eliminar";
    deleteBtn.addEventListener("click", function () { requestDelete("sueldo", entry.id); });
    actionsWrap.appendChild(deleteBtn);

    tdActions.appendChild(actionsWrap);
    tr.appendChild(tdActions);

    return tr;
  }

  function renderSueldoLista() {
    var lista = loadSueldo();
    // Los retiros no son plata nueva, así que no cuentan en el total.
    var total = lista.filter(function (s) { return !esRetiro(s); })
      .reduce(function (sum, s) { return sum + (Number(s.monto) || 0); }, 0);
    sueldoTotalPeriodoEl.textContent = formatCurrency(total);

    sueldoMonthsWrapper.innerHTML = "";
    sueldoEmptyState.classList.toggle("hidden", lista.length !== 0);
    if (lista.length === 0) return;

    var byMonth = {};
    lista.forEach(function (s) {
      var key = monthKey(s.fecha);
      if (!byMonth[key]) byMonth[key] = [];
      byMonth[key].push(s);
    });

    Object.keys(byMonth).sort().reverse().forEach(function (key, i) {
      var items = byMonth[key].sort(function (a, b) { return String(b.fecha).localeCompare(String(a.fecha)); });
      var monthTotal = items.filter(function (s) { return !esRetiro(s); })
        .reduce(function (sum, s) { return sum + (Number(s.monto) || 0); }, 0);

      var details = document.createElement("details");
      details.className = "month-group";
      if (i === 0) details.open = true;

      var summary = document.createElement("summary");
      var titleSpan = document.createElement("span");
      titleSpan.textContent = monthLabel(key);
      var metaSpan = document.createElement("span");
      metaSpan.className = "month-meta";
      metaSpan.textContent = items.length + (items.length === 1 ? " ingreso · " : " ingresos · ") + formatCurrency(monthTotal);
      summary.appendChild(titleSpan);
      summary.appendChild(metaSpan);
      details.appendChild(summary);

      var tableWrap = document.createElement("div");
      tableWrap.className = "table-wrapper";
      var table = document.createElement("table");
      var thead = document.createElement("thead");
      thead.innerHTML = "<tr><th>Fecha</th><th>Tipo</th><th>Concepto</th><th>Dónde queda</th><th class=\"col-value\">Monto</th><th class=\"col-actions\">Acciones</th></tr>";
      table.appendChild(thead);
      var tbody = document.createElement("tbody");
      items.forEach(function (s) { tbody.appendChild(buildSueldoRow(s)); });
      table.appendChild(tbody);
      tableWrap.appendChild(table);
      details.appendChild(tableWrap);

      sueldoMonthsWrapper.appendChild(details);
    });
  }

  // ---------- Periodo de las estadísticas del sueldo ----------

  function populateSueldoPeriods() {
    var months = new Set();
    loadSueldo().forEach(function (s) { if (s.fecha) months.add(monthKey(s.fecha)); });
    loadCompras().forEach(function (c) {
      if (c.fecha && pagaConSueldo(c) && !esCargoFuturo(c)) months.add(monthKey(c.fecha));
    });
    var sortedMonths = Array.from(months).sort().reverse();

    var previousValue = sueldoPeriodSelect.value || currentSueldoPeriod;
    sueldoPeriodSelect.innerHTML = "";
    var allOpt = document.createElement("option");
    allOpt.value = "all";
    allOpt.textContent = "Todo el tiempo";
    sueldoPeriodSelect.appendChild(allOpt);
    sortedMonths.forEach(function (key) {
      var opt = document.createElement("option");
      opt.value = key;
      opt.textContent = monthLabel(key);
      sueldoPeriodSelect.appendChild(opt);
    });

    // Arranca en el mes actual para que la comparación planificado vs. real
    // se reinicie sola cada día 1, sin mezclar con el mes anterior. Los meses
    // pasados siguen disponibles en el selector.
    var mesActual = monthKey(todayStamp());
    if (sortedMonths.indexOf(mesActual) === -1) sortedMonths.unshift(mesActual);
    if (!Array.from(sueldoPeriodSelect.options).some(function (o) { return o.value === mesActual; })) {
      var opt = document.createElement("option");
      opt.value = mesActual;
      opt.textContent = monthLabel(mesActual);
      sueldoPeriodSelect.insertBefore(opt, sueldoPeriodSelect.options[1] || null);
    }

    var toSelect = previousValue === "all" || sortedMonths.indexOf(previousValue) !== -1 ? previousValue : mesActual;
    sueldoPeriodSelect.value = toSelect;
    currentSueldoPeriod = toSelect;
  }

  sueldoPeriodSelect.addEventListener("change", function () {
    currentSueldoPeriod = sueldoPeriodSelect.value;
    renderSueldoEstadisticas();
  });

  function enPeriodoSueldo(fecha) {
    return currentSueldoPeriod === "all" || monthKey(fecha) === currentSueldoPeriod;
  }

  // ---------- Distribución por porcentajes ----------

  function renderDistribucionRows(fondoTotal) {
    var distribucion = loadDistribucion();
    distribucionRowsEl.innerHTML = "";

    distribucion.forEach(function (item, index) {
      var row = document.createElement("div");
      row.className = "distribucion-row";

      var colorDot = document.createElement("span");
      colorDot.className = "distribucion-dot trend-series-" + ((index % 6) + 1);
      row.appendChild(colorDot);

      var nombreInput = document.createElement("input");
      nombreInput.type = "text";
      nombreInput.className = "distribucion-nombre";
      nombreInput.value = item.nombre;
      nombreInput.placeholder = "Ej: Ahorro";
      nombreInput.addEventListener("change", function () {
        var lista = loadDistribucion();
        lista[index].nombre = nombreInput.value.trim() || "Sin nombre";
        saveDistribucion(lista);
        renderSueldoEstadisticas();
      });
      row.appendChild(nombreInput);

      var pctInput = document.createElement("input");
      pctInput.type = "number";
      pctInput.className = "distribucion-pct";
      pctInput.min = "0";
      pctInput.max = "100";
      pctInput.step = "1";
      pctInput.value = item.porcentaje;
      pctInput.addEventListener("change", function () {
        var lista = loadDistribucion();
        lista[index].porcentaje = Math.max(0, Math.min(100, Number(pctInput.value) || 0));
        saveDistribucion(lista);
        renderSueldoEstadisticas();
      });
      row.appendChild(pctInput);

      var pctSign = document.createElement("span");
      pctSign.className = "distribucion-sign";
      pctSign.textContent = "%";
      row.appendChild(pctSign);

      var montoEl = document.createElement("span");
      montoEl.className = "distribucion-monto";
      montoEl.textContent = formatCurrency(fondoTotal * (Number(item.porcentaje) || 0) / 100);
      row.appendChild(montoEl);

      var deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "btn btn-danger btn-small";
      deleteBtn.textContent = "Quitar";
      deleteBtn.addEventListener("click", function () {
        var lista = loadDistribucion().filter(function (_, i) { return i !== index; });
        saveDistribucion(lista);
        renderSueldoEstadisticas();
      });
      row.appendChild(deleteBtn);

      distribucionRowsEl.appendChild(row);
    });

    var totalPct = distribucion.reduce(function (sum, d) { return sum + (Number(d.porcentaje) || 0); }, 0);
    distribucionTotalHint.textContent = "Total asignado: " + totalPct + "%" +
      (totalPct === 100 ? " ✅" : (totalPct > 100 ? " ⚠️ te pasaste del 100%" : " · queda " + (100 - totalPct) + "% sin asignar"));

    return distribucion;
  }

  distribucionAddBtn.addEventListener("click", function () {
    var lista = loadDistribucion();
    lista.push({ id: uid(), nombre: "Nueva categoría", porcentaje: 0, tipo: "gasto" });
    saveDistribucion(lista);
    renderSueldoEstadisticas();
  });

  // ---------- Gráfico de torta ----------

  function polarPoint(cx, cy, r, angleDeg) {
    var rad = (angleDeg - 90) * Math.PI / 180;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
  }

  function buildPieSvg(slices) {
    var svgNS = "http://www.w3.org/2000/svg";
    var size = 190;
    var cx = size / 2;
    var cy = size / 2;
    var rOuter = 85;
    var rInner = 46;

    var svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", "0 0 " + size + " " + size);
    svg.setAttribute("class", "pie-chart-svg");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "Distribución del sueldo por categoría");

    var total = slices.reduce(function (sum, s) { return sum + s.value; }, 0);
    if (total <= 0) return svg;

    // Una sola porción cubre el círculo completo: el arco degeneraría, así
    // que se dibuja como anillo en vez de path.
    if (slices.length === 1) {
      var ring = document.createElementNS(svgNS, "circle");
      ring.setAttribute("cx", cx);
      ring.setAttribute("cy", cy);
      ring.setAttribute("r", (rOuter + rInner) / 2);
      ring.setAttribute("fill", "none");
      ring.setAttribute("stroke-width", rOuter - rInner);
      ring.setAttribute("class", "pie-slice-stroke " + slices[0].colorClass);
      svg.appendChild(ring);
      return svg;
    }

    var startAngle = 0;
    slices.forEach(function (slice) {
      var sweep = (slice.value / total) * 360;
      var endAngle = startAngle + sweep;
      var largeArc = sweep > 180 ? 1 : 0;

      var p1 = polarPoint(cx, cy, rOuter, startAngle);
      var p2 = polarPoint(cx, cy, rOuter, endAngle);
      var p3 = polarPoint(cx, cy, rInner, endAngle);
      var p4 = polarPoint(cx, cy, rInner, startAngle);

      var path = document.createElementNS(svgNS, "path");
      path.setAttribute("d", [
        "M", p1[0], p1[1],
        "A", rOuter, rOuter, 0, largeArc, 1, p2[0], p2[1],
        "L", p3[0], p3[1],
        "A", rInner, rInner, 0, largeArc, 0, p4[0], p4[1],
        "Z"
      ].join(" "));
      path.setAttribute("class", "pie-slice " + slice.colorClass);

      var title = document.createElementNS(svgNS, "title");
      title.textContent = slice.label + ": " + formatCurrency(slice.value) + " (" + Math.round(slice.value / total * 100) + "%)";
      path.appendChild(title);

      svg.appendChild(path);
      startAngle = endAngle;
    });

    return svg;
  }

  function renderPie(distribucion, fondoTotal) {
    sueldoPieChartEl.innerHTML = "";
    sueldoPieLegendEl.innerHTML = "";

    var conValor = distribucion.filter(function (d) { return (Number(d.porcentaje) || 0) > 0; });
    if (conValor.length === 0 || fondoTotal <= 0) {
      var empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = fondoTotal <= 0
        ? "Registra un ingreso para ver cómo se reparte tu sueldo."
        : "Asigna un porcentaje a alguna categoría para ver el gráfico.";
      sueldoPieChartEl.appendChild(empty);
      return;
    }

    var slices = conValor.map(function (d) {
      var idx = distribucion.indexOf(d);
      return {
        label: d.nombre,
        value: fondoTotal * (Number(d.porcentaje) || 0) / 100,
        pct: Number(d.porcentaje) || 0,
        colorClass: "trend-series-" + ((idx % 6) + 1)
      };
    });

    sueldoPieChartEl.appendChild(buildPieSvg(slices));

    slices.forEach(function (s) {
      var item = document.createElement("div");
      item.className = "pie-legend-item";
      var dot = document.createElement("span");
      dot.className = "trend-legend-dot " + s.colorClass;
      item.appendChild(dot);
      var text = document.createElement("span");
      text.textContent = s.label + " — " + s.pct + "% · " + formatCurrency(s.value);
      item.appendChild(text);
      sueldoPieLegendEl.appendChild(item);
    });
  }

  // ---------- Gastos reales por sobre ----------

  function comprasDelSueldo() {
    return loadCompras().filter(function (c) {
      return pagaConSueldo(c) && !esCargoFuturo(c) && enPeriodoSueldo(c.fecha);
    });
  }

  function gastoPorSobre() {
    var totales = {};
    comprasDelSueldo().forEach(function (c) {
      var sobre = sobreParaCompra(c);
      if (!sobre) return;
      totales[sobre] = (totales[sobre] || 0) + (Number(c.monto) || 0);
    });
    return totales;
  }

  function renderPieReal(distribucion, gastos) {
    sueldoPieRealChartEl.innerHTML = "";
    sueldoPieRealLegendEl.innerHTML = "";

    var slices = distribucion.map(function (d, i) {
      return { id: d.id, label: d.nombre, value: gastos[d.id] || 0, colorClass: "trend-series-" + ((i % 6) + 1) };
    }).filter(function (s) { return s.value > 0; });

    var total = slices.reduce(function (sum, s) { return sum + s.value; }, 0);
    if (total <= 0) {
      var empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "Todavía no hay compras personales pagadas con el sueldo en este periodo.";
      sueldoPieRealChartEl.appendChild(empty);
      return;
    }

    sueldoPieRealChartEl.appendChild(buildPieSvg(slices));

    slices.forEach(function (s) {
      var item = document.createElement("div");
      item.className = "pie-legend-item";
      var dot = document.createElement("span");
      dot.className = "trend-legend-dot " + s.colorClass;
      item.appendChild(dot);
      var text = document.createElement("span");
      text.textContent = s.label + " — " + Math.round(s.value / total * 100) + "% · " + formatCurrency(s.value);
      item.appendChild(text);
      sueldoPieRealLegendEl.appendChild(item);
    });
  }

  // Comparación sobre por sobre. El sobre de ahorro no se mide con gastos:
  // se mide con lo que quedó sin gastar del fondo.
  function renderSobresComparacion(distribucion, gastos, fondoTotal, gastadoTotal) {
    sueldoSobresWrapper.innerHTML = "";

    distribucion.forEach(function (sobre, i) {
      var planificado = fondoTotal * (Number(sobre.porcentaje) || 0) / 100;
      var esAhorro = sobre.tipo === "ahorro";
      var usado = esAhorro ? Math.max(0, fondoTotal - gastadoTotal) : (gastos[sobre.id] || 0);
      var pct = planificado > 0 ? Math.min(100, Math.round(usado / planificado * 100)) : 0;
      var excedido = !esAhorro && planificado > 0 && usado > planificado;

      var row = document.createElement("div");
      row.className = "sobre-row";

      var head = document.createElement("div");
      head.className = "sobre-row-head";
      var name = document.createElement("span");
      name.className = "sobre-row-name";
      name.textContent = sobre.nombre;
      head.appendChild(name);
      var meta = document.createElement("span");
      meta.className = "sobre-row-meta" + (excedido ? " excedido" : "");
      meta.textContent = esAhorro
        ? "Guardado " + formatCurrency(usado) + " de " + formatCurrency(planificado) + " planificado"
        : formatCurrency(usado) + " usado de " + formatCurrency(planificado) +
          (excedido ? " · te pasaste " + formatCurrency(usado - planificado) : " · queda " + formatCurrency(planificado - usado));
      head.appendChild(meta);
      row.appendChild(head);

      var barWrap = document.createElement("span");
      barWrap.className = "estad-tipo-bar-wrap";
      var barFill = document.createElement("span");
      barFill.className = "estad-tipo-bar-fill " + (excedido ? "excedido" : "trend-series-" + ((i % 6) + 1));
      barFill.style.width = pct + "%";
      barWrap.appendChild(barFill);
      row.appendChild(barWrap);

      sueldoSobresWrapper.appendChild(row);
    });
  }

  // ---------- Saldos por billetera ----------
  //
  // Acumulados de todos los periodos: el saldo disponible no tiene sentido
  // recortado a un mes. Un retiro resta de la tarjeta y suma al efectivo.

  function calcularSaldos() {
    var ingresos = loadSueldo();
    var tarjeta = 0;
    var efectivo = 0;

    ingresos.forEach(function (s) {
      var monto = Number(s.monto) || 0;
      if (esRetiro(s)) {
        tarjeta -= monto;
        efectivo += monto;
      } else if (s.destino === "efectivo") {
        efectivo += monto;
      } else {
        tarjeta += monto;
      }
    });

    loadCompras().forEach(function (c) {
      if (!pagaConSueldo(c)) return;
      var monto = Number(c.monto) || 0;
      if (walletDeCompra(c) === "efectivo") efectivo -= monto;
      else tarjeta -= monto;
    });

    return { tarjeta: tarjeta, efectivo: efectivo };
  }

  // ---------- Flujo de gastos pagados con el sueldo ----------

  function renderFlujoSueldo() {
    var compras = comprasDelSueldo();

    sueldoFlujoWrapper.innerHTML = "";
    sueldoFlujoEmpty.classList.toggle("hidden", compras.length !== 0);
    if (compras.length === 0) return;

    var byCategoria = {};
    compras.forEach(function (c) {
      var label = categoriaLabel(c);
      if (!byCategoria[label]) byCategoria[label] = { label: label, count: 0, total: 0 };
      byCategoria[label].count += 1;
      byCategoria[label].total += Number(c.monto) || 0;
    });

    var lista = Object.keys(byCategoria).map(function (k) { return byCategoria[k]; });
    lista.sort(function (a, b) { return b.total - a.total; });
    var maxTotal = lista.length > 0 ? lista[0].total : 0;

    lista.forEach(function (item) {
      sueldoFlujoWrapper.appendChild(buildRankingRow(item.label, item.count, item.total, maxTotal));
    });
  }

  // ---------- Estadísticas del sueldo ----------

  function renderSueldoEstadisticas() {
    populateSueldoPeriods();

    var ingresos = loadSueldo().filter(function (s) { return enPeriodoSueldo(s.fecha) && !esRetiro(s); });
    var fijo = ingresos.filter(function (s) { return s.origen !== "extra"; }).reduce(function (sum, s) { return sum + (Number(s.monto) || 0); }, 0);
    var extra = ingresos.filter(function (s) { return s.origen === "extra"; }).reduce(function (sum, s) { return sum + (Number(s.monto) || 0); }, 0);
    var fondoTotal = fijo + extra;

    var gastado = comprasDelSueldo().reduce(function (sum, c) { return sum + (Number(c.monto) || 0); }, 0);

    sueldoStatFijoEl.textContent = formatCurrency(fijo);
    sueldoStatExtraEl.textContent = formatCurrency(extra);
    sueldoStatTotalEl.textContent = formatCurrency(fondoTotal);
    sueldoStatGastadoEl.textContent = formatCurrency(gastado);
    sueldoStatDisponibleEl.textContent = formatCurrency(fondoTotal - gastado);

    var saldos = calcularSaldos();
    sueldoSaldoTarjetaEl.textContent = formatCurrency(saldos.tarjeta);
    sueldoSaldoEfectivoEl.textContent = formatCurrency(saldos.efectivo);

    var distribucion = renderDistribucionRows(fondoTotal);
    var gastos = gastoPorSobre();
    renderPie(distribucion, fondoTotal);
    renderPieReal(distribucion, gastos);
    renderSobresComparacion(distribucion, gastos, fondoTotal, gastado);
    renderFlujoSueldo();
  }

  function renderSueldo() {
    renderSueldoLista();
    renderSueldoEstadisticas();
  }
