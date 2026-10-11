"use strict";

  // =========================================================
  // COMPRAS — lista de gastos (fijos, suscripciones y variables), filtros
  // y utilidades compartidas. El formulario para registrar y editar compras
  // vive en registro.js.
  // =========================================================


  var comprasFilterTexto = document.getElementById("compras-filter-texto");
  var comprasFilterTarjeta = document.getElementById("compras-filter-tarjeta");
  var comprasFilterComprador = document.getElementById("compras-filter-comprador");
  var comprasFilterAcreedor = document.getElementById("compras-filter-acreedor");
  var comprasFilterFrom = document.getElementById("compras-filter-from");
  var comprasFilterTo = document.getElementById("compras-filter-to");
  var comprasFilterDatesClear = document.getElementById("compras-filter-dates-clear");

  var comprasMonthsWrapper = document.getElementById("compras-months-wrapper");
  var comprasEmptyState = document.getElementById("compras-empty-state");
  var comprasVistaTitulo = document.getElementById("compras-vista-titulo");
  var comprasVistaHint = document.getElementById("compras-vista-hint");
  var comprasMasFiltros = document.getElementById("compras-mas-filtros");
  var comprasFiltrosActivosBadge = document.getElementById("compras-filtros-activos");

  // Preferencias de pantalla de ESTE dispositivo (qué vista de compras se
  // estaba mirando, si el formulario quedó abierto). A propósito sin el
  // prefijo "finanzas_": así no viajan a la nube ni ensucian la
  // sincronización con el otro equipo.
  function leerPreferenciaUI(key, fallback) {
    try {
      var v = localStorage.getItem("ui_" + key);
      return v === null ? fallback : v;
    } catch (e) { return fallback; }
  }
  function guardarPreferenciaUI(key, value) {
    try { localStorage.setItem("ui_" + key, value); } catch (e) {}
  }

  // ---------- Método de pago ----------

  function populateMetodoPagoSelect(selectEl) {
    var previousValue = selectEl.value;
    selectEl.innerHTML = "";
    [{ value: "efectivo", label: "Efectivo" }, { value: "debito", label: "Débito" }].forEach(function (opt) {
      var o = document.createElement("option");
      o.value = opt.value;
      o.textContent = opt.label;
      selectEl.appendChild(o);
    });
    loadTarjetas().forEach(function (t) {
      var o = document.createElement("option");
      o.value = t.id;
      o.textContent = tarjetaLabel(t.id);
      selectEl.appendChild(o);
    });
    if (Array.from(selectEl.options).some(function (o) { return o.value === previousValue; })) {
      selectEl.value = previousValue;
    }
  }

  function esMetodoPagoTarjeta(value) {
    return value !== "efectivo" && value !== "debito";
  }

  // ---------- Personas conocidas (datalist) ----------

  function refreshPersonasConocidas() {
    var known = loadPersonasConocidas();
    var compras = loadCompras();
    var fromCompras = compras.filter(function (c) { return esMeDeben(c) && c.persona; }).map(function (c) { return c.persona; })
      .concat(compras.filter(function (c) { return c.compradorOtro; }).map(function (c) { return c.compradorOtro; }));
    var all = Array.from(new Set(known.concat(fromCompras))).sort();
    var datalist = document.getElementById("personas-conocidas-list");
    datalist.innerHTML = "";
    all.forEach(function (name) {
      var opt = document.createElement("option");
      opt.value = name;
      datalist.appendChild(opt);
    });
  }

  // ---------- Cuotas: horario de vencimientos por compra ----------
  //
  // El monto de cada cuota se calcula dividiendo el total; la última cuota
  // absorbe el resto del redondeo para que la suma cuadre siempre con el
  // total real de la compra.
  //
  // Con tarjeta propia que tiene ciclo (cierre + pago), la primera cuota
  // vence el día de pago del estado de cuenta donde cae la compra — no "un
  // mes después de comprar", que puede quedar corrido en un mes.
  function buildCuotaSchedule(compra) {
    var n = compra.cuotas || 1;
    var base = Math.floor((Number(compra.monto) || 0) / n);
    var baseDate = primerVencimientoDeCompraTarjeta(compra) || compra.fechaPago || addMonthsToIso(compra.fecha, 1);
    var pagadas = Array.isArray(compra.cuotasPagadas) ? compra.cuotasPagadas : [];
    var acumulado = 0;
    var schedule = [];
    for (var i = 0; i < n; i++) {
      var amount = i === n - 1 ? (Number(compra.monto) || 0) - acumulado : base;
      acumulado += amount;
      schedule.push({
        index: i,
        amount: amount,
        dueIso: i === 0 ? baseDate : addMonthsToIso(baseDate, i),
        paid: !!pagadas[i]
      });
    }
    return schedule;
  }


  // ---------- Filtros ----------

  comprasFilterTexto.addEventListener("input", renderCompras);
  comprasFilterTarjeta.addEventListener("change", renderCompras);
  comprasFilterComprador.addEventListener("change", renderCompras);
  comprasFilterAcreedor.addEventListener("change", renderCompras);
  // (actualizarBadgeFiltros corre dentro de renderCompras)
  comprasFilterFrom.addEventListener("change", function () { updateComprasFilterClearBtn(); renderCompras(); });
  comprasFilterTo.addEventListener("change", function () { updateComprasFilterClearBtn(); renderCompras(); });
  comprasFilterDatesClear.addEventListener("click", function () {
    comprasFilterFrom.value = "";
    comprasFilterTo.value = "";
    updateComprasFilterClearBtn();
    renderCompras();
  });

  function updateComprasFilterClearBtn() {
    comprasFilterDatesClear.classList.toggle("hidden", !comprasFilterFrom.value && !comprasFilterTo.value);
  }

  // Cuántos filtros de "Más filtros" están puestos: se muestra en el
  // título plegado para que no quede un filtro escondido sin darse cuenta.
  function actualizarBadgeFiltros() {
    var activos = [comprasFilterTarjeta, comprasFilterComprador, comprasFilterAcreedor, comprasFilterFrom, comprasFilterTo]
      .filter(function (el) { return !!el.value; }).length;
    comprasFiltrosActivosBadge.classList.toggle("hidden", activos === 0);
    comprasFiltrosActivosBadge.textContent = activos + (activos === 1 ? " activo" : " activos");
  }

  // ---------- Vista del resumen de compras ----------
  //
  // Una sola lista con tres vistas que se alternan con las flechas (o los
  // chips): todas juntas — lo más útil para ver el mes completo —, solo
  // variables, o solo fijos y suscripciones.

  var COMPRAS_VISTAS = [
    { id: "todas", titulo: "🧾 Todas las compras", hint: "Gastos fijos, suscripciones y compras variables juntos, mes a mes." },
    { id: "variables", titulo: "🛍️ Compras variables", hint: "Ropa, tecnología, ocio, autos y otras compras variables." },
    { id: "fijos", titulo: "🏠 Gastos fijos y suscripciones", hint: "Cuentas del hogar, alimentos y suscripciones/streaming." }
  ];
  var comprasVista = leerPreferenciaUI("compras_vista", "todas");
  if (!COMPRAS_VISTAS.some(function (v) { return v.id === comprasVista; })) comprasVista = "todas";

  function setComprasVista(id) {
    comprasVista = id;
    guardarPreferenciaUI("compras_vista", id);
    renderCompras();
  }

  function moverComprasVista(paso) {
    var idx = COMPRAS_VISTAS.findIndex(function (v) { return v.id === comprasVista; });
    var siguiente = COMPRAS_VISTAS[(idx + paso + COMPRAS_VISTAS.length) % COMPRAS_VISTAS.length];
    setComprasVista(siguiente.id);
  }

  document.getElementById("compras-vista-prev").addEventListener("click", function () { moverComprasVista(-1); });
  document.getElementById("compras-vista-next").addEventListener("click", function () { moverComprasVista(1); });
  document.querySelectorAll("#compras-vista-chips .vista-chip").forEach(function (chip) {
    chip.addEventListener("click", function () { setComprasVista(chip.dataset.vista); });
  });

  function comprasDeLaVista(list) {
    if (comprasVista === "variables") return list.filter(function (c) { return categoriaGroup(c) === "variable"; });
    if (comprasVista === "fijos") return list.filter(function (c) { return categoriaGroup(c) !== "variable"; });
    return list;
  }

  function renderComprasVistaHeader() {
    var vista = COMPRAS_VISTAS.find(function (v) { return v.id === comprasVista; });
    comprasVistaTitulo.textContent = vista.titulo;
    comprasVistaHint.textContent = vista.hint;
    document.querySelectorAll("#compras-vista-chips .vista-chip").forEach(function (chip) {
      var activo = chip.dataset.vista === comprasVista;
      chip.classList.toggle("active", activo);
      chip.setAttribute("aria-selected", String(activo));
    });
  }

  // Busca en descripción, categoría y notas a la vez, sin distinguir tildes
  // ni mayúsculas: "camisa", "Camisa" y "cámisa" encuentran lo mismo.
  function sinTildes(texto) {
    return String(texto || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  function coincideBusqueda(compra, termino) {
    if (!termino) return true;
    var campos = [compra.descripcion, categoriaLabel(compra), compra.notas, compradorNombre(compra)];
    return campos.some(function (campo) { return sinTildes(campo).indexOf(termino) !== -1; });
  }

  function applyComprasFilters(list) {
    var termino = sinTildes(comprasFilterTexto.value.trim());
    return list.filter(function (c) {
      // Los meses futuros de una suscripción no se muestran ni se suman: van
      // apareciendo solos cuando llega su mes.
      if (esCargoFuturo(c)) return false;
      if (!coincideBusqueda(c, termino)) return false;
      if (comprasFilterTarjeta.value && (c.tarjetaId || "") !== comprasFilterTarjeta.value) return false;
      if (comprasFilterComprador.value && (c.comprador || YO.id) !== comprasFilterComprador.value) return false;
      if (comprasFilterAcreedor.value && (c.acreedor || "nadie") !== comprasFilterAcreedor.value) return false;
      if (comprasFilterFrom.value && c.fecha < comprasFilterFrom.value) return false;
      if (comprasFilterTo.value && c.fecha > comprasFilterTo.value) return false;
      return true;
    });
  }

  // ---------- Render de filas y grupos por mes ----------

  function buildCompraRow(compra) {
    var tr = document.createElement("tr");
    if (typeof comprasResaltadasIds !== "undefined" && comprasResaltadasIds && comprasResaltadasIds.has(compra.id)) {
      tr.className = "compra-resaltada";
    }

    var tdFecha = document.createElement("td");
    tdFecha.className = "td-fecha";
    tdFecha.dataset.label = "Fecha";
    tdFecha.textContent = formatDateDisplay(compra.fecha);
    tr.appendChild(tdFecha);

    var tdDesc = document.createElement("td");
    tdDesc.className = "td-desc";
    var descText = document.createElement("span");
    descText.textContent = compraDisplayName(compra);
    tdDesc.appendChild(descText);
    if (compra.recurrenceId) {
      var recBadge = document.createElement("span");
      recBadge.className = "recurrencia-badge";
      recBadge.title = "Suscripción de " + compra.recurrenceTotal + " meses";
      recBadge.textContent = "🔁 " + compra.recurrenceIndex + "/" + compra.recurrenceTotal;
      tdDesc.appendChild(recBadge);

      var prox = suscripcionProximoCargoIso(compra);
      if (prox) {
        var proxNote = document.createElement("span");
        proxNote.className = "recurrencia-proximo";
        proxNote.textContent = "Próximo cargo: " + formatDateDisplay(prox);
        tdDesc.appendChild(proxNote);
      }
    }
    tr.appendChild(tdDesc);

    var tdCat = document.createElement("td");
    tdCat.className = "td-meta";
    tdCat.dataset.label = "Categoría";
    var catTag = document.createElement("span");
    catTag.className = "categoria-tag " + categoriaGroup(compra);
    catTag.textContent = categoriaLabel(compra);
    tdCat.appendChild(catTag);
    tr.appendChild(tdCat);

    var tdTarjeta = document.createElement("td");
    tdTarjeta.className = "td-meta";
    tdTarjeta.dataset.label = "Pagado con";
    tdTarjeta.textContent = metodoPagoLabel(compra);
    tr.appendChild(tdTarjeta);

    var tdCuotas = document.createElement("td");
    tdCuotas.className = "td-meta" + (compra.cuotas > 1 ? "" : " td-meta-secundaria");
    tdCuotas.dataset.label = "Cuotas";
    tdCuotas.textContent = compra.cuotas > 1 ? (compra.cuotas + "x" + (compra.tieneInteres ? " · con interés" : " · sin interés")) : "Único";
    tr.appendChild(tdCuotas);

    var tdComprador = document.createElement("td");
    tdComprador.className = "td-meta";
    tdComprador.dataset.label = "Compró";
    tdComprador.textContent = compradorNombre(compra);
    tr.appendChild(tdComprador);

    var tdDebe = document.createElement("td");
    tdDebe.className = "td-meta";
    tdDebe.dataset.label = "Deuda";
    var debeTag = document.createElement("span");
    debeTag.className = "debe-tag " + deudaTagClass(compra);
    debeTag.textContent = deudaTagText(compra);
    tdDebe.appendChild(debeTag);
    tr.appendChild(tdDebe);

    var tdMonto = document.createElement("td");
    tdMonto.className = "col-value";
    tdMonto.textContent = formatCurrency(compra.monto);
    tr.appendChild(tdMonto);

    var tdActions = document.createElement("td");
    tdActions.className = "col-actions";
    var actionsWrap = document.createElement("div");
    actionsWrap.className = "row-actions";

    var editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "btn btn-secondary btn-small";
    editBtn.textContent = "Editar";
    editBtn.addEventListener("click", function () { startEditCompra(compra.id); });
    actionsWrap.appendChild(editBtn);

    var deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "btn btn-danger btn-small";
    deleteBtn.textContent = "Eliminar";
    deleteBtn.addEventListener("click", function () { requestDelete("compra", compra.id); });
    actionsWrap.appendChild(deleteBtn);

    tdActions.appendChild(actionsWrap);
    tr.appendChild(tdActions);

    return tr;
  }

  // Compras compartidas: cada participante tiene su propio registro (mismo
  // compartidaId), pero en la tabla se muestran como una sola fila con el
  // total y quiénes la componen. Tocarla despliega el detalle de cada
  // participante (usando las mismas filas mini con botón de pagada que ya
  // existen en la pestaña Deudas).
  var comprasCompartidasExpandidas = new Set(); // compartidaId -> visible

  function agruparParaTabla(items) {
    var filas = [];
    var vistos = {};
    items.forEach(function (c) {
      if (!c.compartidaId) {
        filas.push({ tipo: "individual", compra: c });
        return;
      }
      if (vistos[c.compartidaId]) return;
      vistos[c.compartidaId] = true;
      var miembros = items.filter(function (o) { return o.compartidaId === c.compartidaId; });
      filas.push({ tipo: "grupo", miembros: miembros });
    });
    return filas;
  }

  function buildCompraGroupRow(miembros) {
    var muestra = miembros[0];
    var groupId = muestra.compartidaId;
    var expandido = comprasCompartidasExpandidas.has(groupId);
    var resaltada = typeof comprasResaltadasIds !== "undefined" && comprasResaltadasIds &&
      miembros.some(function (m) { return comprasResaltadasIds.has(m.id); });

    var tr = document.createElement("tr");
    tr.className = "compra-row-compartida" + (resaltada ? " compra-resaltada" : "");

    var tdFecha = document.createElement("td");
    tdFecha.className = "td-fecha";
    tdFecha.dataset.label = "Fecha";
    tdFecha.textContent = formatDateDisplay(muestra.fecha);
    tr.appendChild(tdFecha);

    var tdDesc = document.createElement("td");
    tdDesc.className = "td-desc";
    var toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.className = "compartida-toggle-btn";
    toggleBtn.textContent = (expandido ? "▾ " : "▸ ") + compraDisplayName(muestra);
    toggleBtn.addEventListener("click", function () {
      if (comprasCompartidasExpandidas.has(groupId)) comprasCompartidasExpandidas.delete(groupId);
      else comprasCompartidasExpandidas.add(groupId);
      renderCompras();
    });
    tdDesc.appendChild(toggleBtn);

    var shareBadge = document.createElement("span");
    shareBadge.className = "compartida-badge";
    shareBadge.textContent = "🤝 compartida";
    tdDesc.appendChild(shareBadge);

    var shareNote = document.createElement("span");
    shareNote.className = "recurrencia-proximo";
    shareNote.textContent = "Entre: " + compartidaParticipantesTexto(muestra);
    tdDesc.appendChild(shareNote);

    var itemsTexto = itemsResumenTexto(muestra);
    if (itemsTexto) {
      var itemsNote = document.createElement("span");
      itemsNote.className = "recurrencia-proximo";
      itemsNote.textContent = "🧾 " + itemsTexto;
      tdDesc.appendChild(itemsNote);
    }
    tr.appendChild(tdDesc);

    var tdCat = document.createElement("td");
    tdCat.className = "td-meta";
    tdCat.dataset.label = "Categoría";
    var catTag = document.createElement("span");
    catTag.className = "categoria-tag " + categoriaGroup(muestra);
    catTag.textContent = categoriaLabel(muestra);
    tdCat.appendChild(catTag);
    tr.appendChild(tdCat);

    var tdMetodo = document.createElement("td");
    tdMetodo.className = "td-meta";
    tdMetodo.dataset.label = "Pagado con";
    tdMetodo.textContent = metodoPagoLabel(muestra);
    tr.appendChild(tdMetodo);

    var tdCuotas = document.createElement("td");
    tdCuotas.className = "td-meta td-meta-secundaria";
    tdCuotas.dataset.label = "Cuotas";
    tdCuotas.textContent = "—";
    tr.appendChild(tdCuotas);

    var tdComprador = document.createElement("td");
    tdComprador.className = "td-meta";
    tdComprador.dataset.label = "Compró";
    tdComprador.textContent = miembros.length + (miembros.length === 1 ? " persona" : " personas");
    tr.appendChild(tdComprador);

    var tdDebe = document.createElement("td");
    tdDebe.className = "td-meta";
    tdDebe.dataset.label = "Deuda";
    var pendientes = miembros.filter(function (m) { return !m.pagada; }).length;
    var debeTag = document.createElement("span");
    debeTag.className = "debe-tag " + (pendientes > 0 ? "me_deben" : "personal");
    debeTag.textContent = pendientes > 0 ? (pendientes + " sin pagar") : "Todo al día";
    tdDebe.appendChild(debeTag);
    tr.appendChild(tdDebe);

    var tdMonto = document.createElement("td");
    tdMonto.className = "col-value";
    tdMonto.textContent = formatCurrency(muestra.compartidaTotal);
    tr.appendChild(tdMonto);

    var tdActions = document.createElement("td");
    tdActions.className = "col-actions";
    var groupEditBtn = document.createElement("button");
    groupEditBtn.type = "button";
    groupEditBtn.className = "btn btn-secondary btn-small";
    groupEditBtn.textContent = "Editar";
    groupEditBtn.title = "Editar categoría, fecha, método de pago y notas de toda la compra compartida";
    groupEditBtn.addEventListener("click", function () { startEditCompraGrupo(groupId); });
    tdActions.appendChild(groupEditBtn);
    tr.appendChild(tdActions);

    var detailTr = document.createElement("tr");
    detailTr.className = "compartida-detalle-row" + (expandido ? "" : " hidden");
    var detailTd = document.createElement("td");
    detailTd.colSpan = 9;
    miembros.slice().sort(function (a, b) { return (a.compradorOtro || compradorNombre(a)).localeCompare(b.compradorOtro || compradorNombre(b)); })
      .forEach(function (m) {
        // La parte de "yo" también puede marcarse: ahí no hay deuda de nadie,
        // pero sirve como recordatorio de "ya tengo esta plata separada
        // para pagar la tarjeta" (toggleCompraPagada la trata distinto).
        var miniRow = buildCompraMiniRow(m, { conBotonPagada: true });

        var editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.className = "btn btn-secondary btn-small";
        editBtn.textContent = "Editar";
        editBtn.addEventListener("click", function () { startEditCompra(m.id); });
        miniRow.appendChild(editBtn);

        var deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.className = "btn btn-danger btn-small";
        deleteBtn.textContent = "Eliminar";
        deleteBtn.addEventListener("click", function () { requestDelete("compra", m.id); });
        miniRow.appendChild(deleteBtn);

        detailTd.appendChild(miniRow);
      });
    detailTr.appendChild(detailTd);

    return [tr, detailTr];
  }

  function renderMonthGroups(wrapperEl, emptyEl, list) {
    wrapperEl.innerHTML = "";
    emptyEl.classList.toggle("hidden", list.length !== 0);
    if (list.length === 0) return;

    var byMonth = {};
    list.forEach(function (c) {
      var key = monthKey(c.fecha);
      if (!byMonth[key]) byMonth[key] = [];
      byMonth[key].push(c);
    });

    Object.keys(byMonth).sort().reverse().forEach(function (key, i) {
      // Siempre por fecha, de la más reciente a la más antigua; si dos son
      // del mismo día, primero la última que se anotó.
      var items = byMonth[key].sort(function (a, b) {
        return String(b.fecha).localeCompare(String(a.fecha)) || (b.createdAt || 0) - (a.createdAt || 0);
      });
      var total = items.reduce(function (sum, c) { return sum + (Number(c.monto) || 0); }, 0);
      var filas = agruparParaTabla(items);

      var details = document.createElement("details");
      details.className = "month-group";
      if (i === 0) details.open = true;

      var summary = document.createElement("summary");
      var titleSpan = document.createElement("span");
      titleSpan.textContent = monthLabel(key);
      var metaSpan = document.createElement("span");
      metaSpan.className = "month-meta";
      var metaTexto = filas.length + (filas.length === 1 ? " compra · " : " compras · ") + formatCurrency(total);
      // En la vista "todas" ayuda ver de un vistazo cuánto fue fijo y cuánto
      // variable dentro del mismo mes.
      if (comprasVista === "todas") {
        var totalVariables = items.filter(function (c) { return categoriaGroup(c) === "variable"; })
          .reduce(function (sum, c) { return sum + (Number(c.monto) || 0); }, 0);
        if (totalVariables > 0 && totalVariables < total) {
          metaTexto += " (variables " + formatCurrency(totalVariables) + " · fijos " + formatCurrency(total - totalVariables) + ")";
        }
      }
      metaSpan.textContent = metaTexto;
      summary.appendChild(titleSpan);
      summary.appendChild(metaSpan);
      details.appendChild(summary);

      var tableWrap = document.createElement("div");
      tableWrap.className = "table-wrapper";
      var table = document.createElement("table");
      table.className = "compras-tabla";
      var thead = document.createElement("thead");
      thead.innerHTML = "<tr><th>Fecha</th><th>Descripción</th><th>Categoría</th><th>Pagado con</th><th>Cuotas</th><th>Compró</th><th>Deuda</th><th class=\"col-value\">Monto</th><th class=\"col-actions\">Acciones</th></tr>";
      table.appendChild(thead);
      var tbody = document.createElement("tbody");
      filas.forEach(function (fila) {
        if (fila.tipo === "grupo") {
          buildCompraGroupRow(fila.miembros).forEach(function (tr) { tbody.appendChild(tr); });
        } else {
          tbody.appendChild(buildCompraRow(fila.compra));
        }
      });
      table.appendChild(tbody);
      tableWrap.appendChild(table);
      details.appendChild(tableWrap);

      wrapperEl.appendChild(details);
    });
  }

  function exportComprasCSV(list, filenamePrefix) {
    var header = ["Fecha", "Descripción", "Categoría", "Método de pago", "Monto", "Cuotas", "Interés", "Fecha de pago", "Quién compró", "Hogar o personal", "A quién se le debe", "Origen del dinero", "Notas"];
    var rows = list.slice().sort(function (a, b) { return String(a.fecha).localeCompare(String(b.fecha)); }).map(function (c) {
      return [
        formatDateDisplay(c.fecha),
        compraDisplayName(c),
        categoriaLabel(c),
        metodoPagoLabel(c),
        c.monto,
        c.cuotas > 1 ? c.cuotas : 1,
        c.tieneInteres ? "Sí" : "No",
        c.fechaPago ? formatDateDisplay(c.fechaPago) : "",
        compradorNombre(c),
        c.esHogar ? "Aporte al hogar" : "Gasto personal",
        deudaTagText(c),
        c.origenDinero === "sueldo" ? "Mi sueldo" : (c.origenDinero === "otro" ? "Otro dinero" : ""),
        c.notas || ""
      ].map(csvEscape).join(",");
    });
    var csv = header.map(csvEscape).join(",") + "\n" + rows.join("\n");
    downloadFile(filenamePrefix + "_" + todayStamp() + ".csv", csv, "text/csv;charset=utf-8;");
  }

  // Exporta exactamente lo que se está viendo (vista + filtros).
  document.getElementById("export-compras-csv-btn").addEventListener("click", function () {
    var list = comprasDeLaVista(applyComprasFilters(loadCompras()));
    var prefijos = { todas: "compras", variables: "compras_variables", fijos: "gastos_fijos" };
    exportComprasCSV(list, prefijos[comprasVista] || "compras");
  });

  // ---------- Render principal ----------

  function renderCompras() {
    var filtered = comprasDeLaVista(applyComprasFilters(loadCompras()));

    renderComprasVistaHeader();
    actualizarBadgeFiltros();
    comprasEmptyState.textContent = loadCompras().length === 0
      ? "Aún no hay compras registradas. Toca \"➕ Registrar compras\" para agregar la primera."
      : "No hay compras que calcen con esta vista o filtros.";
    renderMonthGroups(comprasMonthsWrapper, comprasEmptyState, filtered);

    refreshPersonasConocidas();
    // El formulario de registro depende de tarjetas, personas y categorías,
    // que pueden haber cambiado (incluso desde el otro dispositivo).
    if (typeof refrescarOpcionesRegistro === "function") refrescarOpcionesRegistro();
  }

