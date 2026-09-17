"use strict";

  // =========================================================
  // VER COMPRAS — historial de compras de una persona, mes a mes.
  //
  // A diferencia de Calculadora (que filtra para armar un cobro) o Informes
  // (que agrupa para imprimir un comprobante), esta pestaña es solo para
  // revisar: "¿qué compró Fulano, y cuándo?" — incluye TODO lo que esa
  // persona compró, sea gasto del hogar, personal, compartido o con deuda
  // de por medio. "Yo" es una opción más, igual que cualquier otra persona.
  // =========================================================

  var verComprasPersonaSelect = document.getElementById("vercompras-persona");
  var verComprasTotalEl = document.getElementById("vercompras-total");
  var verComprasCantidadEl = document.getElementById("vercompras-cantidad");
  var verComprasPromedioEl = document.getElementById("vercompras-promedio");
  var verComprasTopCategoriaEl = document.getElementById("vercompras-top-categoria");
  var verComprasListaEl = document.getElementById("vercompras-lista");
  var verComprasEmptyEl = document.getElementById("vercompras-empty");

  // Todas las identidades que pueden figurar como comprador: yo, los que
  // viven en el hogar, y cualquier nombre libre ("Otra persona…") que ya se
  // haya usado alguna vez — para que también se puedan revisar sus compras
  // aunque no sean del hogar.
  function personasParaVerCompras() {
    var opciones = compradoresDisponibles()
      .filter(function (p) { return p.id !== COMPRADOR_OTRO.id; })
      .map(function (p) { return { value: p.id, label: p.nombre }; });

    var vistos = {};
    opciones.forEach(function (o) { vistos[o.value] = true; });
    loadCompras().forEach(function (c) {
      if (c.comprador !== COMPRADOR_OTRO.id || !c.compradorOtro) return;
      var key = compradorKey(c);
      if (vistos[key]) return;
      vistos[key] = true;
      opciones.push({ value: key, label: c.compradorOtro.trim() });
    });
    return opciones;
  }

  function renderVerComprasFiltros() {
    if (!verComprasPersonaSelect) return;
    var previousValue = verComprasPersonaSelect.value;
    var opciones = personasParaVerCompras();
    verComprasPersonaSelect.innerHTML = "";
    opciones.forEach(function (o) {
      var opt = document.createElement("option");
      opt.value = o.value;
      opt.textContent = o.label;
      verComprasPersonaSelect.appendChild(opt);
    });
    if (opciones.some(function (o) { return o.value === previousValue; })) {
      verComprasPersonaSelect.value = previousValue;
    }
    renderVerCompras();
  }

  function comprasDeSeleccionVerCompras(value) {
    return loadCompras().filter(function (c) {
      if (value.indexOf("otro::") === 0) return compradorKey(c) === value;
      return (c.comprador || YO.id) === value;
    });
  }

  function renderVerCompras() {
    if (!verComprasPersonaSelect) return;
    var value = verComprasPersonaSelect.value;
    var compras = value ? comprasDeSeleccionVerCompras(value) : [];

    var total = compras.reduce(function (sum, c) { return sum + (Number(c.monto) || 0); }, 0);
    verComprasTotalEl.textContent = formatCurrency(total);
    verComprasCantidadEl.textContent = String(compras.length);

    var meses = new Set(compras.map(function (c) { return monthKey(c.fecha); }));
    verComprasPromedioEl.textContent = formatCurrency(meses.size > 0 ? Math.round(total / meses.size) : 0);

    var porCategoria = {};
    compras.forEach(function (c) {
      var label = categoriaLabel(c);
      porCategoria[label] = (porCategoria[label] || 0) + (Number(c.monto) || 0);
    });
    var topCategoria = Object.keys(porCategoria).sort(function (a, b) { return porCategoria[b] - porCategoria[a]; })[0];
    verComprasTopCategoriaEl.textContent = topCategoria
      ? topCategoria + " (" + formatCurrency(porCategoria[topCategoria]) + ")"
      : "—";

    verComprasListaEl.innerHTML = "";
    verComprasEmptyEl.classList.toggle("hidden", compras.length !== 0);
    if (compras.length === 0) return;

    var byMonth = {};
    compras.forEach(function (c) {
      var key = monthKey(c.fecha);
      if (!byMonth[key]) byMonth[key] = [];
      byMonth[key].push(c);
    });

    Object.keys(byMonth).sort().reverse().forEach(function (key, i) {
      var items = byMonth[key].sort(function (a, b) { return String(b.fecha).localeCompare(String(a.fecha)); });
      var totalMes = items.reduce(function (sum, c) { return sum + (Number(c.monto) || 0); }, 0);

      var details = document.createElement("details");
      details.className = "month-group";
      if (i === 0) details.open = true;

      var summary = document.createElement("summary");
      var titleSpan = document.createElement("span");
      titleSpan.textContent = monthLabel(key);
      var metaSpan = document.createElement("span");
      metaSpan.className = "month-meta";
      metaSpan.textContent = items.length + (items.length === 1 ? " compra · " : " compras · ") + formatCurrency(totalMes);
      summary.appendChild(titleSpan);
      summary.appendChild(metaSpan);
      details.appendChild(summary);

      var tableWrap = document.createElement("div");
      tableWrap.className = "table-wrapper";
      var table = document.createElement("table");
      var thead = document.createElement("thead");
      thead.innerHTML = "<tr><th>Fecha</th><th>Qué se compró</th><th>Categoría</th><th>Método de pago</th><th>Deuda</th><th class=\"col-value\">Monto</th></tr>";
      table.appendChild(thead);

      var tbody = document.createElement("tbody");
      items.forEach(function (c) {
        var tr = document.createElement("tr");
        if (c.pagada) tr.className = "vercompras-row-pagada";
        [
          formatDateDisplay(c.fecha),
          compraDisplayName(c),
          categoriaLabel(c),
          metodoPagoLabel(c),
          deudaTagText(c)
        ].forEach(function (texto) {
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
      tableWrap.appendChild(table);
      details.appendChild(tableWrap);

      // "Marcar pagada" en una compra solo dice que la persona te devolvió
      // esa compra puntual — no que la tarjeta ya está saldada con el
      // banco (son cosas independientes a propósito, ver Deuda Tarjetas).
      // Para cerrar de verdad el ciclo de una tarjeta, este atajo llama a
      // la misma acción que el botón "Marcar como pagado" de esa pestaña.
      var tarjetasDelMes = Array.from(new Set(
        items.filter(function (c) { return c.tarjetaId && esTarjetaPersonal(c.tarjetaId); })
          .map(function (c) { return c.tarjetaId; })
      ));
      if (tarjetasDelMes.length > 0) {
        var cerrarWrap = document.createElement("div");
        cerrarWrap.className = "vercompras-cerrar-tarjeta";
        var cerrarHint = document.createElement("p");
        cerrarHint.className = "label-hint";
        cerrarHint.textContent = "\"Marcar pagada\" en cada compra solo avisa que te devolvieron esa parte — para cerrar la tarjeta con el banco, usa esto:";
        cerrarWrap.appendChild(cerrarHint);
        tarjetasDelMes.forEach(function (tarjetaId) {
          var btn = document.createElement("button");
          btn.type = "button";
          btn.className = "btn btn-secondary btn-small";
          btn.textContent = "✅ Marcar " + tarjetaLabel(tarjetaId) + " como pagada y lista";
          btn.addEventListener("click", function () { markTarjetaPagada(tarjetaId); });
          cerrarWrap.appendChild(btn);
        });
        details.appendChild(cerrarWrap);
      }

      verComprasListaEl.appendChild(details);
    });
  }

  if (verComprasPersonaSelect) {
    verComprasPersonaSelect.addEventListener("change", renderVerCompras);
  }
