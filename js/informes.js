"use strict";

  // =========================================================
  // INFORMES — documento imprimible para entregar a otra persona
  //
  // No reinventa el cálculo de deudas: agrupa las mismas compras que ya se
  // ven en "Deudas" (por acreedor o por deudor), pero el total "pendiente"
  // de cada fila sale directo de la compra (monto - lo ya marcado como
  // pagado), no del balance de abonos de la persona. Así el informe sigue
  // siendo correcto aunque se filtre por tipo de gasto o por fecha, casos
  // donde el balance oficial (que mezcla abonos sin categoría) dejaría de
  // calzar con lo que realmente se está mostrando.
  // =========================================================

  var informeTipoGastoSelect = document.getElementById("informe-tipo-gasto");
  var informePersonasListEl = document.getElementById("informe-personas-list");
  var informeFechaDesdeInput = document.getElementById("informe-fecha-desde");
  var informeFechaHastaInput = document.getElementById("informe-fecha-hasta");
  var informeGenerarBtn = document.getElementById("informe-generar-btn");
  var informeLimpiarBtn = document.getElementById("informe-limpiar-btn");
  var informeResultadoEl = document.getElementById("informe-resultado");
  var informeEmptyState = document.getElementById("informe-empty-state");
  var informeImprimirBtn = document.getElementById("informe-imprimir-btn");

  // Qué personas están marcadas en el filtro. Vive aparte del DOM para no
  // perder la selección cada vez que se reconstruye la lista (ej. si se
  // agrega una persona nueva mientras la pestaña está abierta).
  var informePersonasChecked = new Set();

  function renderInformesFiltros() {
    if (!informePersonasListEl) return;
    var personas = [YO].concat(loadMiembros());
    informePersonasListEl.innerHTML = "";
    personas.forEach(function (p) {
      var label = document.createElement("label");
      label.className = "radio-option";

      var input = document.createElement("input");
      input.type = "checkbox";
      input.className = "informe-persona-check";
      input.checked = informePersonasChecked.has(p.id);
      input.addEventListener("change", function () {
        if (input.checked) informePersonasChecked.add(p.id);
        else informePersonasChecked.delete(p.id);
      });
      label.appendChild(input);
      label.appendChild(document.createTextNode(p.id === YO.id ? "Yo (gastos propios)" : p.nombre));
      informePersonasListEl.appendChild(label);
    });
  }

  function tituloTipoGasto(tipo) {
    if (tipo === "fijo") return "Gastos fijos";
    if (tipo === "suscripcion") return "Suscripciones/Streaming";
    if (tipo === "variable") return "Compras variables";
    return "Todos los tipos de gasto";
  }

  // Cuánto de esta compra sigue pendiente, calculado directo desde la
  // compra (no desde el balance de la persona): así el número siempre
  // calza exactamente con las filas que se están mostrando en el informe.
  function pendienteDeCompraInforme(compra) {
    if (compra.tipo === "cuotas") return Math.max(0, (Number(compra.monto) || 0) - cuotaPaidTotal(compra));
    return compra.pagada ? 0 : (Number(compra.monto) || 0);
  }

  function cuotasTextoInforme(compra) {
    if (compra.tipo !== "cuotas") return "—";
    var schedule = buildCuotaSchedule(compra);
    var pagadas = schedule.filter(function (c) { return c.paid; }).length;
    if (compra.pagada || pagadas >= compra.cuotas) {
      return "Cuotas completas (" + compra.cuotas + "/" + compra.cuotas + ")";
    }
    return "Va en la cuota " + (pagadas + 1) + " de " + compra.cuotas + " — falta " + formatCurrency(pendienteDeCompraInforme(compra));
  }

  function estadoTextoInforme(compra) {
    if (compra.pagada) return "Pagado";
    if (compra.tipo === "cuotas") {
      var pagadas = buildCuotaSchedule(compra).filter(function (c) { return c.paid; }).length;
      return pagadas > 0 ? "Parcial" : "Pendiente";
    }
    return "Pendiente";
  }

  function cuandoCorrespondeTexto(compra) {
    if (compra.fechaPagoAcordada) return "Acordado: " + formatDateDisplay(compra.fechaPagoAcordada);
    if (compra.fechaPago) return "Vence: " + formatDateDisplay(compra.fechaPago);
    return "—";
  }

  function buildInformeTabla(compras) {
    var wrap = document.createElement("div");
    wrap.className = "table-wrapper";
    var table = document.createElement("table");
    var thead = document.createElement("thead");
    thead.innerHTML = "<tr><th>Fecha</th><th>Categoría</th><th>Descripción</th><th>Cuotas</th>" +
      "<th>Cuándo corresponde el pago</th><th>Estado</th><th class=\"col-value\">Monto</th></tr>";
    table.appendChild(thead);

    var tbody = document.createElement("tbody");
    compras.slice().sort(function (a, b) { return String(a.fecha).localeCompare(String(b.fecha)); }).forEach(function (c) {
      var tr = document.createElement("tr");
      [formatDateDisplay(c.fecha), categoriaLabel(c), compraDisplayName(c), cuotasTextoInforme(c), cuandoCorrespondeTexto(c), estadoTextoInforme(c)]
        .forEach(function (texto) {
          var td = document.createElement("td");
          td.textContent = texto;
          tr.appendChild(td);
        });
      var tdMonto = document.createElement("td");
      tdMonto.className = "col-value";
      tdMonto.textContent = formatCurrency(c.monto);
      tr.appendChild(tdMonto);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    return wrap;
  }

  function buildInformeGrupo(titulo, subtitulo, compras) {
    var section = document.createElement("section");
    section.className = "informe-grupo";

    var h3 = document.createElement("h3");
    h3.textContent = titulo;
    section.appendChild(h3);

    var p = document.createElement("p");
    p.className = "lede-hint";
    p.textContent = subtitulo;
    section.appendChild(p);

    section.appendChild(buildInformeTabla(compras));

    var totalGastado = compras.reduce(function (sum, c) { return sum + (Number(c.monto) || 0); }, 0);
    var totalPendiente = compras.reduce(function (sum, c) { return sum + pendienteDeCompraInforme(c); }, 0);

    var totales = document.createElement("p");
    totales.className = "informe-grupo-total";
    totales.textContent = "Total de este grupo: " + formatCurrency(totalGastado) + "   ·   Pendiente de pago: " + formatCurrency(totalPendiente);
    section.appendChild(totales);

    return { section: section, totalGastado: totalGastado, totalPendiente: totalPendiente };
  }

  function comprasBaseInforme() {
    var tipo = informeTipoGastoSelect.value;
    var desde = informeFechaDesdeInput.value;
    var hasta = informeFechaHastaInput.value;
    return loadCompras().filter(function (c) {
      if (esCargoFuturo(c)) return false;
      if (tipo !== "all" && categoriaGroup(c) !== tipo) return false;
      if (desde && c.fecha < desde) return false;
      if (hasta && c.fecha > hasta) return false;
      return true;
    });
  }

  function filtrosResumenTexto() {
    var partes = [tituloTipoGasto(informeTipoGastoSelect.value)];
    var seleccion = Array.from(informePersonasChecked);
    partes.push(seleccion.length
      ? seleccion.map(function (id) { return id === YO.id ? "Yo" : personaNombre(id); }).join(", ")
      : "Todas las personas con deuda pendiente");
    if (informeFechaDesdeInput.value) partes.push("Desde " + formatDateDisplay(informeFechaDesdeInput.value));
    if (informeFechaHastaInput.value) partes.push("Hasta " + formatDateDisplay(informeFechaHastaInput.value));
    return partes.join(" · ");
  }

  function renderInformeResultado(grupos) {
    informeResultadoEl.innerHTML = "";

    if (grupos.length === 0) {
      informeEmptyState.textContent = "No hay compras que calcen con estos filtros.";
      informeEmptyState.classList.remove("hidden");
      informeImprimirBtn.classList.add("hidden");
      return;
    }
    informeEmptyState.classList.add("hidden");

    var header = document.createElement("div");
    header.className = "informe-report-header";
    var h2 = document.createElement("h2");
    h2.textContent = "Informe de gastos y deudas";
    header.appendChild(h2);
    var meta = document.createElement("p");
    meta.className = "lede-hint";
    meta.textContent = "Generado el " + nowDisplayDateTime() + " · " + filtrosResumenTexto();
    header.appendChild(meta);
    informeResultadoEl.appendChild(header);

    var totalGastado = 0, totalPendiente = 0;
    grupos.forEach(function (g) {
      informeResultadoEl.appendChild(g.section);
      totalGastado += g.totalGastado;
      totalPendiente += g.totalPendiente;
    });

    var resumen = document.createElement("div");
    resumen.className = "informe-total-general";
    var spanGastado = document.createElement("span");
    spanGastado.textContent = "Total general: " + formatCurrency(totalGastado);
    var spanPendiente = document.createElement("span");
    spanPendiente.textContent = "Pendiente de pago: " + formatCurrency(totalPendiente);
    resumen.appendChild(spanGastado);
    resumen.appendChild(spanPendiente);
    informeResultadoEl.appendChild(resumen);

    informeImprimirBtn.classList.remove("hidden");
  }

  function generarInforme() {
    var seleccion = Array.from(informePersonasChecked);
    var todas = seleccion.length === 0;
    var base = comprasBaseInforme();
    var grupos = [];

    var acreedores = Array.from(new Set(base.filter(esDeudaMia).map(function (c) { return c.acreedor; })))
      .filter(function (id) { return todas || seleccion.indexOf(id) !== -1; })
      .sort(function (a, b) { return personaNombre(a).localeCompare(personaNombre(b)); });
    acreedores.forEach(function (id) {
      var compras = base.filter(function (c) { return esDeudaMia(c) && c.acreedor === id; });
      grupos.push(buildInformeGrupo(
        "💳 Le debes a " + personaNombre(id),
        "Compras pagadas con dinero de " + personaNombre(id) + " y lo que todavía falta por devolverle.",
        compras
      ));
    });

    var deudores = Array.from(new Set(base.filter(esMeDeben).map(deudorKey).filter(Boolean)))
      .filter(function (key) { return todas || seleccion.indexOf(key) !== -1; })
      .sort(function (a, b) { return deudorNombre(a).localeCompare(deudorNombre(b)); });
    deudores.forEach(function (key) {
      var compras = base.filter(function (c) { return esMeDeben(c) && deudorKey(c) === key; });
      grupos.push(buildInformeGrupo(
        "🤝 " + deudorNombre(key) + " te debe",
        "Compras que pagaste tú y que " + deudorNombre(key) + " tiene pendientes de devolverte.",
        compras
      ));
    });

    if (informePersonasChecked.has(YO.id)) {
      var propias = base.filter(function (c) { return !esMeDeben(c) && !esDeudaMia(c) && (c.comprador || YO.id) === YO.id; });
      if (propias.length > 0) {
        grupos.push(buildInformeGrupo(
          "🧍 Tus gastos propios",
          "Gastos personales sin deuda asociada — es solo un registro informativo, no algo por cobrar o devolver.",
          propias
        ));
      }
    }

    renderInformeResultado(grupos);
  }

  informeGenerarBtn.addEventListener("click", generarInforme);

  informeLimpiarBtn.addEventListener("click", function () {
    informeTipoGastoSelect.value = "all";
    informeFechaDesdeInput.value = "";
    informeFechaHastaInput.value = "";
    informePersonasChecked.clear();
    renderInformesFiltros();
    informeResultadoEl.innerHTML = "";
    informeEmptyState.textContent = "Elige los filtros de arriba y toca \"Generar informe\".";
    informeEmptyState.classList.remove("hidden");
    informeImprimirBtn.classList.add("hidden");
  });

  informeImprimirBtn.addEventListener("click", function () { window.print(); });
