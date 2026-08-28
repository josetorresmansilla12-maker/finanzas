"use strict";

  // =========================================================
  // ESTADÍSTICAS
  // =========================================================

  var estadPeriodSelect = document.getElementById("estad-period-select");
  var estadTotalGastadoEl = document.getElementById("estad-total-gastado");
  var estadTotalFijosEl = document.getElementById("estad-total-fijos");
  var estadTotalMioEl = document.getElementById("estad-total-mio");
  var estadTotalVariablesEl = document.getElementById("estad-total-variables");
  var estadTotalSuscripcionesEl = document.getElementById("estad-total-suscripciones");
  var estadDeboPersonasEl = document.getElementById("estad-debo-personas");
  var estadMeDebenEl = document.getElementById("estad-me-deben");
  var estadDeboTarjetasEl = document.getElementById("estad-debo-tarjetas");
  var estadAportesHogarEl = document.getElementById("estad-aportes-hogar");
  var estadAportesHogarEmpty = document.getElementById("estad-aportes-hogar-empty");
  var estadAportesRangeSelect = document.getElementById("estad-aportes-range");
  var estadAportesParticipacionEl = document.getElementById("estad-aportes-participacion");
  var estadPersonalesTercerosEl = document.getElementById("estad-personales-terceros");
  var estadPersonalesTercerosEmpty = document.getElementById("estad-personales-terceros-empty");
  var estadTrendRangeSelect = document.getElementById("estad-trend-range");
  var estadTrendChartEl = document.getElementById("estad-trend-chart");
  var estadTrendLegendEl = document.getElementById("estad-trend-legend");
  var estadTrendCategoryPickerEl = document.getElementById("estad-trend-category-picker");
  var estadCategoriaWrapper = document.getElementById("estad-categoria-wrapper");
  var estadCategoriaEmpty = document.getElementById("estad-categoria-empty");
  var estadPendientesWrapper = document.getElementById("estad-pendientes-wrapper");
  var estadPendientesEmpty = document.getElementById("estad-pendientes-empty");
  var estadAutosWrapper = document.getElementById("estad-autos-wrapper");
  var estadAutosEmpty = document.getElementById("estad-autos-empty");
  var MESES_ABBR = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

  function monthKeyOffset(n) {
    var d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - n);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
  }

  // ---------- Tendencia de gastos fijos (multi-categoría) ----------
  //
  // Sin categorías marcadas se muestra una sola línea con el total de gastos
  // fijos. Al marcar una o más categorías, se reemplaza por una línea por
  // categoría para poder comparar (ej: agua vs. luz vs. gas). Se usan líneas
  // en vez de barras agrupadas porque con varios meses x varias categorías
  // las barras se saturan visualmente; las líneas se leen mejor en ese caso.

  var FIJO_CATEGORIES_FOR_TREND = CATEGORIAS.filter(function (c) { return c.group === "fijo"; });

  function buildTrendCategoryPicker() {
    estadTrendCategoryPickerEl.innerHTML = "";
    FIJO_CATEGORIES_FOR_TREND.forEach(function (cat) {
      var label = document.createElement("label");
      label.className = "trend-category-option";
      var checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = cat.id;
      checkbox.addEventListener("change", renderTrendChart);
      label.appendChild(checkbox);
      label.appendChild(document.createTextNode(cat.label));
      estadTrendCategoryPickerEl.appendChild(label);
    });
  }
  buildTrendCategoryPicker();

  document.getElementById("trend-category-select-all").addEventListener("click", function () {
    estadTrendCategoryPickerEl.querySelectorAll("input[type=checkbox]").forEach(function (cb) { cb.checked = true; });
    renderTrendChart();
  });
  document.getElementById("trend-category-select-none").addEventListener("click", function () {
    estadTrendCategoryPickerEl.querySelectorAll("input[type=checkbox]").forEach(function (cb) { cb.checked = false; });
    renderTrendChart();
  });

  function selectedTrendCategoryIds() {
    return Array.from(estadTrendCategoryPickerEl.querySelectorAll("input[type=checkbox]:checked")).map(function (cb) { return cb.value; });
  }

  function buildMultiTrendChartSvg(seriesList, monthLabels) {
    var svgNS = "http://www.w3.org/2000/svg";
    var chartHeight = 140;
    var labelHeight = 24;
    var stepX = 50;
    var leftPad = 20;
    var width = leftPad * 2 + Math.max(0, monthLabels.length - 1) * stepX;
    var height = chartHeight + labelHeight;

    var svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", "0 0 " + width + " " + height);
    svg.setAttribute("width", "100%");
    svg.setAttribute("class", "trend-chart-svg");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "Tendencia de gastos fijos");
    svg.setAttribute("preserveAspectRatio", "none");

    var maxTotal = 0;
    seriesList.forEach(function (s) { s.data.forEach(function (v) { if (v > maxTotal) maxTotal = v; }); });
    if (maxTotal <= 0) maxTotal = 1;

    function xFor(i) { return leftPad + i * stepX; }
    function yFor(v) { return chartHeight - 10 - Math.round((v / maxTotal) * (chartHeight - 24)); }

    monthLabels.forEach(function (lbl, i) {
      var text = document.createElementNS(svgNS, "text");
      text.setAttribute("x", xFor(i));
      text.setAttribute("y", chartHeight + 18);
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("class", "trend-label");
      text.textContent = lbl;
      svg.appendChild(text);
    });

    seriesList.forEach(function (s, idx) {
      var colorClass = "trend-series-" + ((idx % 6) + 1);

      var polyline = document.createElementNS(svgNS, "polyline");
      polyline.setAttribute("points", s.data.map(function (v, i) { return xFor(i) + "," + yFor(v); }).join(" "));
      polyline.setAttribute("class", "trend-line " + colorClass);
      svg.appendChild(polyline);

      s.data.forEach(function (v, i) {
        var circle = document.createElementNS(svgNS, "circle");
        circle.setAttribute("cx", xFor(i));
        circle.setAttribute("cy", yFor(v));
        circle.setAttribute("r", 3.5);
        circle.setAttribute("class", "trend-dot " + colorClass);
        var title = document.createElementNS(svgNS, "title");
        title.textContent = s.label + " — " + monthLabels[i] + ": " + formatCurrency(v);
        circle.appendChild(title);
        svg.appendChild(circle);
      });
    });

    return svg;
  }

  function renderTrendChart() {
    var months = Number(estadTrendRangeSelect.value) || 12;
    var monthKeys = [];
    var monthLabels = [];
    for (var i = months - 1; i >= 0; i--) {
      var key = monthKeyOffset(i);
      monthKeys.push(key);
      var monthNum = parseInt(key.split("-")[1], 10) - 1;
      monthLabels.push(MESES_ABBR[monthNum] || "");
    }

    var selectedIds = selectedTrendCategoryIds();
    var compras = loadCompras().filter(function (c) { return !esCargoFuturo(c); });
    var seriesList;

    if (selectedIds.length === 0) {
      var totals = monthKeys.map(function (key) {
        return compras.filter(function (c) { return monthKey(c.fecha) === key && categoriaGroup(c) === "fijo"; })
          .reduce(function (sum, c) { return sum + (Number(c.monto) || 0); }, 0);
      });
      seriesList = [{ label: "Total gastos fijos", data: totals }];
    } else {
      seriesList = selectedIds.map(function (id) {
        var cat = categoriaById(id);
        var totals = monthKeys.map(function (key) {
          return compras.filter(function (c) { return monthKey(c.fecha) === key && c.categoria === id; })
            .reduce(function (sum, c) { return sum + (Number(c.monto) || 0); }, 0);
        });
        return { label: cat ? cat.label : id, data: totals };
      });
    }

    estadTrendChartEl.innerHTML = "";
    var hasData = seriesList.some(function (s) { return s.data.some(function (v) { return v > 0; }); });
    if (!hasData) {
      var empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "Todavía no hay suficientes gastos fijos para mostrar una tendencia.";
      estadTrendChartEl.appendChild(empty);
      estadTrendLegendEl.innerHTML = "";
      return;
    }
    estadTrendChartEl.appendChild(buildMultiTrendChartSvg(seriesList, monthLabels));

    estadTrendLegendEl.innerHTML = "";
    seriesList.forEach(function (s, idx) {
      var colorClass = "trend-series-" + ((idx % 6) + 1);
      var total = s.data.reduce(function (sum, v) { return sum + v; }, 0);
      var item = document.createElement("span");
      item.className = "trend-legend-item";
      var dot = document.createElement("span");
      dot.className = "trend-legend-dot " + colorClass;
      item.appendChild(dot);
      item.appendChild(document.createTextNode(s.label + ": " + formatCurrency(total)));
      estadTrendLegendEl.appendChild(item);
    });
  }

  estadTrendRangeSelect.addEventListener("change", renderTrendChart);
  estadAportesRangeSelect.addEventListener("change", function () { renderAportesHogar(); });

  function buildRankingRow(label, count, total, maxTotal) {
    var row = document.createElement("div");
    row.className = "estad-tipo-row";

    var nameEl = document.createElement("span");
    nameEl.className = "estad-tipo-name";
    nameEl.textContent = label;
    row.appendChild(nameEl);

    var barWrap = document.createElement("span");
    barWrap.className = "estad-tipo-bar-wrap";
    var barFill = document.createElement("span");
    barFill.className = "estad-tipo-bar-fill";
    barFill.style.width = (maxTotal > 0 ? Math.round((total / maxTotal) * 100) : 0) + "%";
    barWrap.appendChild(barFill);
    row.appendChild(barWrap);

    var valueEl = document.createElement("span");
    valueEl.className = "estad-tipo-value";
    valueEl.textContent = count + (count === 1 ? " compra · " : " compras · ") + formatCurrency(total);
    row.appendChild(valueEl);

    return row;
  }

  function populateEstadPeriods() {
    var compras = loadCompras();
    var months = new Set();
    compras.forEach(function (c) { if (c.fecha && !esCargoFuturo(c)) months.add(monthKey(c.fecha)); });
    var sortedMonths = Array.from(months).sort().reverse();

    var previousValue = estadPeriodSelect.value || currentEstadPeriod;
    estadPeriodSelect.innerHTML = "";
    var allOpt = document.createElement("option");
    allOpt.value = "all";
    allOpt.textContent = "Todo el tiempo";
    estadPeriodSelect.appendChild(allOpt);
    sortedMonths.forEach(function (key) {
      var opt = document.createElement("option");
      opt.value = key;
      opt.textContent = monthLabel(key);
      estadPeriodSelect.appendChild(opt);
    });

    var thisMonth = monthKey(todayStamp());
    var toSelect = sortedMonths.indexOf(previousValue) !== -1 || previousValue === "all"
      ? previousValue
      : (sortedMonths.indexOf(thisMonth) !== -1 ? thisMonth : "all");
    estadPeriodSelect.value = toSelect;
    currentEstadPeriod = toSelect;
  }

  estadPeriodSelect.addEventListener("change", function () {
    currentEstadPeriod = estadPeriodSelect.value;
    renderEstadisticas();
  });

  // ---------- Aportes al hogar y gastos personales de terceros ----------
  //
  // Cada compra cae en exactamente un lado: si es para la casa va a los
  // aportes al hogar (a nombre de quien la hizo), y si no, al panel personal
  // de esa persona. Ninguno de los dos genera deuda: son solo registro.

  function buildDetalleBox(titulo, compras, opciones) {
    var conAportante = opciones && opciones.conAportante;
    var total = compras.reduce(function (sum, c) { return sum + (Number(c.monto) || 0); }, 0);

    var box = document.createElement("div");
    box.className = "deuda-card";

    var head = document.createElement("div");
    head.className = "deuda-card-head";

    var titleWrap = document.createElement("div");
    titleWrap.className = "deuda-card-title-wrap";
    var titleEl = document.createElement("div");
    titleEl.className = "deuda-card-title";
    titleEl.textContent = titulo;
    titleWrap.appendChild(titleEl);
    var subEl = document.createElement("div");
    subEl.className = "deuda-card-subtitle";
    subEl.textContent = compras.length + (compras.length === 1 ? " compra registrada" : " compras registradas");
    titleWrap.appendChild(subEl);
    head.appendChild(titleWrap);

    var stats = document.createElement("div");
    stats.className = "deuda-card-stats";
    var stat = document.createElement("div");
    stat.className = "deuda-stat";
    var label = document.createElement("span");
    label.className = "deuda-stat-label";
    label.textContent = "💲 Total gastado";
    var value = document.createElement("span");
    value.className = "deuda-stat-value pagado";
    value.textContent = formatCurrency(total);
    stat.appendChild(label);
    stat.appendChild(value);
    stats.appendChild(stat);
    head.appendChild(stats);

    box.appendChild(head);

    var tableWrap = document.createElement("div");
    tableWrap.className = "table-wrapper";
    var table = document.createElement("table");
    var thead = document.createElement("thead");
    thead.innerHTML = "<tr><th>Fecha</th><th>Qué se compró</th><th>Categoría</th>" +
      (conAportante ? "<th>Aportante</th>" : "") +
      "<th>Método de pago</th><th class=\"col-value\">Monto</th></tr>";
    table.appendChild(thead);
    var tbody = document.createElement("tbody");
    compras.slice().sort(function (a, b) { return String(b.fecha).localeCompare(String(a.fecha)); }).forEach(function (c) {
      var tr = document.createElement("tr");
      var tdFecha = document.createElement("td");
      tdFecha.textContent = formatDateDisplay(c.fecha);
      tr.appendChild(tdFecha);
      var tdDetalle = document.createElement("td");
      tdDetalle.textContent = compraDisplayName(c);
      tr.appendChild(tdDetalle);
      var tdCat = document.createElement("td");
      tdCat.textContent = categoriaLabel(c);
      tr.appendChild(tdCat);
      if (conAportante) {
        var tdAportante = document.createElement("td");
        tdAportante.textContent = compradorNombre(c);
        tr.appendChild(tdAportante);
      }
      var tdMetodo = document.createElement("td");
      tdMetodo.textContent = metodoPagoLabel(c);
      tr.appendChild(tdMetodo);
      var tdMonto = document.createElement("td");
      tdMonto.className = "col-value";
      tdMonto.textContent = formatCurrency(c.monto);
      tr.appendChild(tdMonto);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    tableWrap.appendChild(table);
    box.appendChild(tableWrap);

    return box;
  }

  // Se agrupa por clave estable (los "otra persona" se juntan por el nombre
  // escrito) y se guarda una compra de muestra para poder mostrar la etiqueta.
  function agruparPorComprador(compras) {
    var grupos = {};
    compras.forEach(function (c) {
      var key = compradorKey(c);
      if (!grupos[key]) grupos[key] = [];
      grupos[key].push(c);
    });
    return grupos;
  }

  function etiquetaGrupoComprador(compras) {
    return compradorNombre(compras[0]);
  }

  function totalDe(compras) {
    return compras.reduce(function (sum, c) { return sum + (Number(c.monto) || 0); }, 0);
  }

  // Barra compacta de participación: en el celular ocupa una línea y
  // responde de un vistazo quién puso más en el periodo elegido.
  function renderParticipacion(grupos, aportantes, totalGeneral) {
    estadAportesParticipacionEl.innerHTML = "";
    if (aportantes.length === 0 || totalGeneral <= 0) return;

    var barra = document.createElement("div");
    barra.className = "participacion-bar";
    aportantes.forEach(function (id, i) {
      var pct = totalDe(grupos[id]) / totalGeneral * 100;
      var seg = document.createElement("span");
      seg.className = "participacion-seg trend-series-" + ((i % 6) + 1);
      seg.style.width = pct + "%";
      seg.title = (id === YO.id ? "Tú" : etiquetaGrupoComprador(grupos[id])) + ": " + Math.round(pct) + "%";
      barra.appendChild(seg);
    });
    estadAportesParticipacionEl.appendChild(barra);

    var chips = document.createElement("div");
    chips.className = "participacion-chips";
    aportantes.forEach(function (id, i) {
      var pct = Math.round(totalDe(grupos[id]) / totalGeneral * 100);
      var chip = document.createElement("span");
      chip.className = "participacion-chip";
      var dot = document.createElement("span");
      dot.className = "trend-legend-dot trend-series-" + ((i % 6) + 1);
      chip.appendChild(dot);
      chip.appendChild(document.createTextNode((id === YO.id ? "Tú" : etiquetaGrupoComprador(grupos[id])) + " " + pct + "%"));
      chips.appendChild(chip);
    });
    estadAportesParticipacionEl.appendChild(chips);

    var lider = document.createElement("p");
    lider.className = "participacion-lider";
    var top = aportantes[0];
    lider.textContent = "Quien más aportó: " + (top === YO.id ? "tú" : etiquetaGrupoComprador(grupos[top])) +
      " con " + formatCurrency(totalDe(grupos[top])) + " de " + formatCurrency(totalGeneral) + " en total.";
    estadAportesParticipacionEl.appendChild(lider);
  }

  // El panel de aportes usa su propio filtro temporal (rango dinámico o mes
  // literal), no el periodo general de la pestaña.
  function comprasEnRangoAportes() {
    var todas = loadCompras().filter(function (c) { return esAporteHogar(c) && !esCargoFuturo(c); });
    buildTimeFilterOptions(estadAportesRangeSelect, todas.map(function (c) { return c.fecha; }), "m3");
    var rango = estadAportesRangeSelect.value;
    return todas.filter(function (c) { return timeFilterMatches(rango, c.fecha); });
  }

  function renderAportesHogar() {
    var delHogar = comprasEnRangoAportes();
    var grupos = agruparPorComprador(delHogar);
    var aportantes = Object.keys(grupos).sort(function (a, b) {
      return totalDe(grupos[b]) - totalDe(grupos[a]);
    });

    estadAportesHogarEl.innerHTML = "";
    estadAportesHogarEmpty.classList.toggle("hidden", aportantes.length !== 0);
    renderParticipacion(grupos, aportantes, totalDe(delHogar));
    if (aportantes.length === 0) return;

    // Consolidado arriba, y después el desglose de cada aportante.
    if (aportantes.length > 1) {
      estadAportesHogarEl.appendChild(
        buildDetalleBox("Total aportado al hogar", delHogar, { conAportante: true })
      );
    }
    aportantes.forEach(function (id) {
      var titulo = id === YO.id ? "Tus aportes" : "Aportes de " + etiquetaGrupoComprador(grupos[id]);
      estadAportesHogarEl.appendChild(buildDetalleBox(titulo, grupos[id]));
    });
  }

  function renderPersonalesTerceros(compras) {
    // Gastos propios de otra persona. Se excluyen los que me deben: ahí la
    // plata la puse yo, no ellos.
    var personales = compras.filter(function (c) {
      return !esAporteHogar(c) && (c.comprador || YO.id) !== YO.id && !esMeDeben(c) && mostrarDineroEnEstad(c);
    });
    var grupos = agruparPorComprador(personales);
    var personas = Object.keys(grupos).sort(function (a, b) {
      return totalDe(grupos[b]) - totalDe(grupos[a]);
    });

    estadPersonalesTercerosEl.innerHTML = "";
    estadPersonalesTercerosEmpty.classList.toggle("hidden", personas.length !== 0);
    personas.forEach(function (id) {
      estadPersonalesTercerosEl.appendChild(
        buildDetalleBox("Dinero de " + etiquetaGrupoComprador(grupos[id]), grupos[id])
      );
    });
  }

  // ---------- Variación contra el mes anterior ----------
  //
  // Solo tiene sentido con un mes concreto seleccionado: comparar "todo el
  // tiempo" contra algo no significa nada.

  function sumaDe(compras) {
    return compras.reduce(function (sum, c) { return sum + (Number(c.monto) || 0); }, 0);
  }

  function esCompraMia(compra) {
    return (compra.comprador || YO.id) === YO.id;
  }

  function mesAnteriorDe(key) {
    var partes = key.split("-").map(Number);
    var y = partes[0], m = partes[1] - 1;
    if (m === 0) return (y - 1) + "-12";
    return y + "-" + String(m).padStart(2, "0");
  }

  function pintarDelta(el, actual, anterior) {
    if (!el) return;
    el.textContent = "";
    el.className = "card-delta";
    if (currentEstadPeriod === "all" || anterior <= 0) return;

    var diff = actual - anterior;
    var pct = Math.round(Math.abs(diff) / anterior * 100);
    if (diff === 0) {
      el.textContent = "igual que el mes anterior";
      return;
    }
    el.classList.add(diff > 0 ? "sube" : "baja");
    el.textContent = (diff > 0 ? "▲ " : "▼ ") + pct + "% vs. mes anterior";
  }

  function renderDeltas(totalGastado, totalMio, totalFijos, totalVariables) {
    if (currentEstadPeriod === "all") {
      ["estad-delta-gastado", "estad-delta-mio", "estad-delta-fijos", "estad-delta-variables"].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) { el.textContent = ""; el.className = "card-delta"; }
      });
      return;
    }

    var anteriorKey = mesAnteriorDe(currentEstadPeriod);
    var previas = loadCompras().filter(function (c) { return monthKey(c.fecha) === anteriorKey; });

    pintarDelta(document.getElementById("estad-delta-gastado"), totalGastado, sumaDe(previas));
    pintarDelta(document.getElementById("estad-delta-mio"), totalMio, sumaDe(previas.filter(esCompraMia)));
    pintarDelta(document.getElementById("estad-delta-fijos"), totalFijos,
      sumaDe(previas.filter(function (c) { return categoriaGroup(c) === "fijo"; })));
    pintarDelta(document.getElementById("estad-delta-variables"), totalVariables,
      sumaDe(previas.filter(function (c) { return categoriaGroup(c) === "variable"; })));
  }

  // ---------- Cuentas del mes que faltan por pagar ----------
  //
  // Cruza los recordatorios configurados con lo ya registrado en el mes en
  // curso. Siempre mira el mes actual, no el periodo elegido: sirve para
  // actuar hoy, no para revisar el pasado.

  function renderCuentasPendientes() {
    var recordatorios = allFijosRecordatorios();
    var mesActual = monthKey(todayStamp());
    var registradasEsteMes = loadCompras().filter(function (c) { return monthKey(c.fecha) === mesActual; });

    var pendientes = Object.keys(recordatorios).filter(function (categoriaId) {
      return !registradasEsteMes.some(function (c) { return c.categoria === categoriaId; });
    }).map(function (categoriaId) {
      var dia = Number(recordatorios[categoriaId]);
      var dueIso = nextOccurrenceOfDay(dia, todayStamp());
      var cat = categoriaById(categoriaId);
      return {
        label: cat ? cat.label : categoriaId,
        dia: dia,
        dueIso: dueIso,
        daysUntil: daysBetweenDates(todayStamp(), dueIso)
      };
    }).sort(function (a, b) { return a.daysUntil - b.daysUntil; });

    estadPendientesWrapper.innerHTML = "";
    estadPendientesEmpty.classList.toggle("hidden", pendientes.length !== 0);
    if (pendientes.length === 0) {
      estadPendientesEmpty.textContent = Object.keys(recordatorios).length === 0
        ? "Todavía no configuraste recordatorios de gastos fijos."
        : "Estás al día: todas las cuentas con recordatorio ya están registradas este mes.";
      return;
    }

    pendientes.forEach(function (p) {
      var row = document.createElement("div");
      row.className = "pendiente-row";

      var nombre = document.createElement("span");
      nombre.className = "pendiente-nombre";
      nombre.textContent = p.label;
      row.appendChild(nombre);

      var badge = document.createElement("span");
      badge.className = "due-badge " + (p.daysUntil <= FIJO_RECORDATORIO_AVISO_DIAS ? "soon" : "ok");
      badge.textContent = dueBadgeLabel(p.daysUntil) + " (" + formatDateDisplay(p.dueIso) + ")";
      row.appendChild(badge);

      estadPendientesWrapper.appendChild(row);
    });
  }

  // ---------- Gasto por auto ----------

  function renderGastoPorAuto(compras) {
    var deAutos = compras.filter(function (c) { return c.categoria === "autos"; });

    var porAuto = {};
    deAutos.forEach(function (c) {
      var key = c.auto || "sin_definir";
      if (!porAuto[key]) porAuto[key] = { count: 0, total: 0 };
      porAuto[key].count += 1;
      porAuto[key].total += Number(c.monto) || 0;
    });

    var claves = Object.keys(porAuto).sort(function (a, b) { return porAuto[b].total - porAuto[a].total; });
    estadAutosWrapper.innerHTML = "";
    estadAutosEmpty.classList.toggle("hidden", claves.length !== 0);
    if (claves.length === 0) return;

    var maxTotal = porAuto[claves[0]].total;
    claves.forEach(function (key) {
      var etiqueta = key === "sin_definir" ? "Sin especificar" : autoLabel(key);
      estadAutosWrapper.appendChild(buildRankingRow(etiqueta, porAuto[key].count, porAuto[key].total, maxTotal));
    });
  }

  function comprasDelPeriodo() {
    return loadCompras().filter(function (c) {
      if (esCargoFuturo(c)) return false;
      return currentEstadPeriod === "all" || monthKey(c.fecha) === currentEstadPeriod;
    });
  }

  function renderEstadisticas() {
    populateEstadPeriods();

    var compras = comprasDelPeriodo();

    var totalGastado = sumaDe(compras);
    var totalMio = sumaDe(compras.filter(esCompraMia));
    var totalFijos = sumaDe(compras.filter(function (c) { return categoriaGroup(c) === "fijo"; }));
    var totalVariables = sumaDe(compras.filter(function (c) { return categoriaGroup(c) === "variable"; }));
    var totalSuscripciones = sumaDe(compras.filter(function (c) { return categoriaGroup(c) === "suscripcion"; }));

    estadTotalGastadoEl.textContent = formatCurrency(totalGastado);
    estadTotalMioEl.textContent = formatCurrency(totalMio);
    estadTotalFijosEl.textContent = formatCurrency(totalFijos);
    estadTotalVariablesEl.textContent = formatCurrency(totalVariables);
    estadTotalSuscripcionesEl.textContent = formatCurrency(totalSuscripciones);

    renderDeltas(totalGastado, totalMio, totalFijos, totalVariables);

    estadDeboPersonasEl.textContent = formatCurrency(totalDeudasMias());
    estadMeDebenEl.textContent = formatCurrency(totalMeDeben());

    var totalDeboTarjetas = misTarjetas().reduce(function (sum, t) { return sum + balanceForTarjeta(t.id).pendiente; }, 0);
    estadDeboTarjetasEl.textContent = formatCurrency(totalDeboTarjetas);

    var byCategoria = {};
    compras.forEach(function (c) {
      var label = categoriaLabel(c);
      if (!byCategoria[label]) byCategoria[label] = { label: label, count: 0, total: 0 };
      byCategoria[label].count += 1;
      byCategoria[label].total += Number(c.monto) || 0;
    });
    var categoriaList = Object.keys(byCategoria).map(function (k) { return byCategoria[k]; });
    categoriaList.sort(function (a, b) { return b.total - a.total; });
    var maxTotal = categoriaList.length > 0 ? categoriaList[0].total : 0;

    estadCategoriaWrapper.innerHTML = "";
    estadCategoriaEmpty.classList.toggle("hidden", categoriaList.length !== 0);
    categoriaList.forEach(function (item) {
      estadCategoriaWrapper.appendChild(buildRankingRow(item.label, item.count, item.total, maxTotal));
    });

    renderCuentasPendientes();
    renderGastoPorAuto(compras);
    renderAportesHogar();
    renderPersonalesTerceros(compras);
    renderTrendChart();
    actualizarTarjetasResaltado();
  }

  // =========================================================
  // Resaltar en Compras las compras que componen una estadística
  //
  // Al tocar una tarjeta de estadística se guarda el conjunto de ids de
  // compras correspondiente y se salta a la pestaña Compras, donde
  // buildCompraRow() (compras.js) le agrega una clase visual a esas filas.
  // Tocar la misma tarjeta de nuevo quita el resaltado.
  // =========================================================

  var comprasResaltadasIds = null; // Set<string> | null
  var comprasResaltadasTipo = null;

  var RESALTAR_LABELS = {
    "gastado": "Total gastado",
    "mio": "De tu bolsillo",
    "fijos": "Gastos fijos",
    "variables": "Compras variables",
    "suscripciones": "Suscripciones",
    "debo-personas": "Debo a otras personas",
    "me-deben": "Me deben"
  };

  function compraTienePendiente(c) {
    if (c.tipo === "cuotas") {
      var pagadas = Array.isArray(c.cuotasPagadas) ? c.cuotasPagadas : [];
      return buildCuotaSchedule(c).some(function (_, i) { return !pagadas[i]; });
    }
    return !c.pagada;
  }

  function idsParaResaltar(tipo) {
    var periodo = comprasDelPeriodo();
    var todas = loadCompras().filter(function (c) { return !esCargoFuturo(c); });
    var lista;
    if (tipo === "gastado") lista = periodo;
    else if (tipo === "mio") lista = periodo.filter(esCompraMia);
    else if (tipo === "fijos") lista = periodo.filter(function (c) { return categoriaGroup(c) === "fijo"; });
    else if (tipo === "variables") lista = periodo.filter(function (c) { return categoriaGroup(c) === "variable"; });
    else if (tipo === "suscripciones") lista = periodo.filter(function (c) { return categoriaGroup(c) === "suscripcion"; });
    else if (tipo === "debo-personas") lista = todas.filter(function (c) { return esDeudaMia(c) && compraTienePendiente(c); });
    else if (tipo === "me-deben") lista = todas.filter(function (c) { return esMeDeben(c) && compraTienePendiente(c); });
    else lista = [];
    return lista.map(function (c) { return c.id; });
  }

  function limpiarFiltrosCompras() {
    document.getElementById("compras-filter-texto").value = "";
    document.getElementById("compras-filter-tarjeta").value = "";
    document.getElementById("compras-filter-comprador").value = "";
    document.getElementById("compras-filter-acreedor").value = "";
    document.getElementById("compras-filter-from").value = "";
    document.getElementById("compras-filter-to").value = "";
    if (typeof updateComprasFilterClearBtn === "function") updateComprasFilterClearBtn();
  }

  function actualizarBannerResaltado() {
    var banner = document.getElementById("compras-resaltado-banner");
    var texto = document.getElementById("compras-resaltado-texto");
    if (!banner || !texto) return;
    banner.classList.toggle("hidden", !comprasResaltadasIds);
    if (comprasResaltadasIds) {
      texto.textContent = "🔎 Mostrando " + comprasResaltadasIds.size + " compra(s) de: " + RESALTAR_LABELS[comprasResaltadasTipo];
    }
  }

  function actualizarTarjetasResaltado() {
    document.querySelectorAll(".card-clickable").forEach(function (btn) {
      btn.classList.toggle("card-activa", !!comprasResaltadasIds && btn.dataset.resaltar === comprasResaltadasTipo);
    });
  }

  function quitarResaltado() {
    comprasResaltadasIds = null;
    comprasResaltadasTipo = null;
    actualizarBannerResaltado();
    actualizarTarjetasResaltado();
    renderCompras();
  }

  document.querySelectorAll(".card-clickable").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var tipo = btn.dataset.resaltar;
      if (comprasResaltadasTipo === tipo) {
        quitarResaltado();
        return;
      }
      comprasResaltadasTipo = tipo;
      comprasResaltadasIds = new Set(idsParaResaltar(tipo));
      limpiarFiltrosCompras();
      activateTab("compras");
      renderCompras();
      actualizarBannerResaltado();
      actualizarTarjetasResaltado();
      var primera = document.querySelector(".compra-resaltada");
      if (primera) primera.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  });

  var quitarResaltadoBtn = document.getElementById("compras-resaltado-quitar-btn");
  if (quitarResaltadoBtn) quitarResaltadoBtn.addEventListener("click", quitarResaltado);

  function renderAll() {
    renderPersonas();
    renderTarjetas();
    renderCompras();
    renderDeudas();
    renderDeudaTarjetas();
    renderEstadisticas();
    renderSueldo();
    renderInformesFiltros();
    renderCalculadoraFiltros();
    renderAppAlerts();
    updateTrashCount();
  }
