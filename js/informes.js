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
  //
  // Cada grupo (una persona, una dirección de deuda) se dibuja reusando el
  // mismo look de las tarjetas de "Deudas" (.deuda-card), para que el
  // informe se sienta parte de la app y no una tabla suelta.
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

  function primerYUltimoDiaMes() {
    var hoy = new Date();
    var y = hoy.getFullYear(), m = hoy.getMonth();
    var primero = y + "-" + String(m + 1).padStart(2, "0") + "-01";
    var ultimoDia = new Date(y, m + 1, 0).getDate();
    var ultimo = y + "-" + String(m + 1).padStart(2, "0") + "-" + String(ultimoDia).padStart(2, "0");
    return { desde: primero, hasta: ultimo };
  }

  // Arranca ya listo para "llegar y generar": el rango parte en el mes
  // actual, sin tener que configurar nada antes de tocar "Generar informe".
  (function initFechasPorDefecto() {
    var rango = primerYUltimoDiaMes();
    informeFechaDesdeInput.value = rango.desde;
    informeFechaHastaInput.value = rango.hasta;
  })();

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

  function direccionSeleccionada() {
    var checked = document.querySelector('input[name="informe-direccion"]:checked');
    return checked ? checked.value : "todo";
  }

  function direccionLabel(direccion) {
    if (direccion === "me_deben") return "Lo que te deben";
    if (direccion === "debo") return "Lo que debes";
    if (direccion === "propios") return "Tus gastos propios";
    return "Deudas (ambas direcciones)";
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
    if (compra.tipo !== "cuotas") return "";
    var schedule = buildCuotaSchedule(compra);
    var pagadas = schedule.filter(function (c) { return c.paid; }).length;
    if (compra.pagada || pagadas >= compra.cuotas) {
      return "Cuotas completas (" + compra.cuotas + "/" + compra.cuotas + ")";
    }
    return "Cuota " + (pagadas + 1) + " de " + compra.cuotas + " — falta " + formatCurrency(pendienteDeCompraInforme(compra));
  }

  function estadoTextoInforme(compra) {
    if (compra.pagada) return "Pagado";
    if (compra.tipo === "cuotas") {
      var pagadas = buildCuotaSchedule(compra).filter(function (c) { return c.paid; }).length;
      return pagadas > 0 ? "Parcial" : "Pendiente";
    }
    return "Pendiente";
  }

  function estadoClaseInforme(compra) {
    var texto = estadoTextoInforme(compra);
    if (texto === "Pagado") return "ok";
    if (texto === "Parcial") return "soon";
    return "overdue";
  }

  function cuandoCorrespondeTexto(compra) {
    if (compra.fechaPagoAcordada) return "Acordado: " + formatDateDisplay(compra.fechaPagoAcordada);
    if (compra.fechaPago) return "Vence: " + formatDateDisplay(compra.fechaPago);
    return "";
  }

  // Tabla compacta a propósito (4 columnas): en la pantalla angosta de un
  // celular y sobre todo en una hoja impresa, una tabla de 7 columnas queda
  // cortada o ilegible. Categoría, cuotas y fecha de pago se muestran como
  // una segunda línea dentro de "Detalle" en vez de columnas aparte.
  function buildInformeTabla(compras) {
    var wrap = document.createElement("div");
    wrap.className = "table-wrapper";
    var table = document.createElement("table");
    table.className = "informe-tabla";
    var thead = document.createElement("thead");
    thead.innerHTML = "<tr><th>Fecha</th><th>Detalle</th><th>Estado</th><th class=\"col-value\">Monto</th></tr>";
    table.appendChild(thead);

    var tbody = document.createElement("tbody");
    compras.slice().sort(function (a, b) { return String(a.fecha).localeCompare(String(b.fecha)); }).forEach(function (c) {
      var tr = document.createElement("tr");

      var tdFecha = document.createElement("td");
      tdFecha.textContent = formatDateDisplay(c.fecha);
      tr.appendChild(tdFecha);

      var tdDetalle = document.createElement("td");
      var titulo = document.createElement("div");
      titulo.className = "informe-detalle-titulo";
      titulo.textContent = compraDisplayName(c);
      tdDetalle.appendChild(titulo);

      var subPartes = [categoriaLabel(c), cuotasTextoInforme(c), cuandoCorrespondeTexto(c)].filter(Boolean);
      var sub = document.createElement("div");
      sub.className = "informe-detalle-sub";
      sub.textContent = subPartes.join(" · ");
      tdDetalle.appendChild(sub);
      tr.appendChild(tdDetalle);

      var tdEstado = document.createElement("td");
      var estadoTag = document.createElement("span");
      estadoTag.className = "due-badge " + estadoClaseInforme(c);
      estadoTag.textContent = estadoTextoInforme(c);
      tdEstado.appendChild(estadoTag);
      tr.appendChild(tdEstado);

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

  // Cada grupo reusa el mismo formato de tarjeta que "Deudas" (título +
  // subtítulo + dos cifras grandes), para que el informe se vea pulido y no
  // como una tabla suelta.
  function buildInformeGrupo(titulo, subtitulo, compras) {
    var totalGastado = compras.reduce(function (sum, c) { return sum + (Number(c.monto) || 0); }, 0);
    var totalPendiente = compras.reduce(function (sum, c) { return sum + pendienteDeCompraInforme(c); }, 0);

    var card = document.createElement("section");
    card.className = "informe-grupo deuda-card";

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
    subEl.textContent = subtitulo;
    titleWrap.appendChild(subEl);
    head.appendChild(titleWrap);

    var stats = document.createElement("div");
    stats.className = "deuda-card-stats";
    [
      ["Total del periodo", totalGastado, "al-dia"],
      ["Pendiente de pago", totalPendiente, totalPendiente > 0 ? "pendiente" : "al-dia"]
    ].forEach(function (fila) {
      var stat = document.createElement("div");
      stat.className = "deuda-stat";
      var label = document.createElement("span");
      label.className = "deuda-stat-label";
      label.textContent = fila[0];
      var value = document.createElement("span");
      value.className = "deuda-stat-value " + fila[2];
      value.textContent = formatCurrency(fila[1]);
      stat.appendChild(label);
      stat.appendChild(value);
      stats.appendChild(stat);
    });
    head.appendChild(stats);
    card.appendChild(head);

    card.appendChild(buildInformeTabla(compras));

    return { section: card, totalGastado: totalGastado, totalPendiente: totalPendiente };
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
    var partes = [direccionLabel(direccionSeleccionada()), tituloTipoGasto(informeTipoGastoSelect.value)];
    var seleccion = Array.from(informePersonasChecked);
    partes.push(seleccion.length
      ? seleccion.map(function (id) { return id === YO.id ? "Yo" : personaNombre(id); }).join(", ")
      : "Todas las personas");
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
    meta.className = "informe-report-meta";
    meta.textContent = filtrosResumenTexto();
    header.appendChild(meta);
    var fechaGen = document.createElement("p");
    fechaGen.className = "informe-report-fecha";
    fechaGen.textContent = "Generado el " + nowDisplayDateTime();
    header.appendChild(fechaGen);
    informeResultadoEl.appendChild(header);

    var totalGastado = 0, totalPendiente = 0;
    grupos.forEach(function (g) {
      informeResultadoEl.appendChild(g.section);
      totalGastado += g.totalGastado;
      totalPendiente += g.totalPendiente;
    });

    // El total general solo aporta algo cuando hay más de un grupo (con uno
    // solo sería el mismo número repetido dos veces).
    if (grupos.length > 1) {
      var resumen = document.createElement("div");
      resumen.className = "informe-total-general";
      var bloqueGastado = document.createElement("div");
      bloqueGastado.className = "informe-total-bloque";
      bloqueGastado.innerHTML = "<span class=\"informe-total-label\">Total general</span><span class=\"informe-total-valor\">" + formatCurrency(totalGastado) + "</span>";
      var bloquePendiente = document.createElement("div");
      bloquePendiente.className = "informe-total-bloque";
      bloquePendiente.innerHTML = "<span class=\"informe-total-label\">Pendiente de pago</span><span class=\"informe-total-valor pendiente\">" + formatCurrency(totalPendiente) + "</span>";
      resumen.appendChild(bloqueGastado);
      resumen.appendChild(bloquePendiente);
      informeResultadoEl.appendChild(resumen);
    }

    informeImprimirBtn.classList.remove("hidden");
  }

  function generarInforme() {
    var direccion = direccionSeleccionada();
    var seleccion = Array.from(informePersonasChecked);
    var todas = seleccion.length === 0;
    var base = comprasBaseInforme();
    var grupos = [];

    if (direccion === "todo" || direccion === "debo") {
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
    }

    if (direccion === "todo" || direccion === "me_deben") {
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
    }

    if (direccion === "propios" || (direccion === "todo" && informePersonasChecked.has(YO.id))) {
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

  document.querySelectorAll('input[name="informe-direccion"]').forEach(function (radio) {
    radio.addEventListener("change", function () {
      informePersonasListEl.parentElement.classList.toggle("hidden", radio.value === "propios" && radio.checked);
    });
  });

  informeLimpiarBtn.addEventListener("click", function () {
    informeTipoGastoSelect.value = "all";
    var rango = primerYUltimoDiaMes();
    informeFechaDesdeInput.value = rango.desde;
    informeFechaHastaInput.value = rango.hasta;
    var radioTodo = document.querySelector('input[name="informe-direccion"][value="todo"]');
    if (radioTodo) radioTodo.checked = true;
    informePersonasListEl.parentElement.classList.remove("hidden");
    informePersonasChecked.clear();
    renderInformesFiltros();
    informeResultadoEl.innerHTML = "";
    informeEmptyState.textContent = "Elige los filtros de arriba y toca \"Generar informe\".";
    informeEmptyState.classList.remove("hidden");
    informeImprimirBtn.classList.add("hidden");
  });

  informeImprimirBtn.addEventListener("click", function () { window.print(); });
