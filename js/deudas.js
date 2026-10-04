"use strict";

  // =========================================================
  // DEUDAS
  //
  // Dos vistas independientes, porque comprador y acreedor se cruzan libre-
  // mente: "Me deben" (yo puse la plata) y "Lo que debo" (otra persona la
  // puso por mí). Más la deuda de mis propias tarjetas de crédito, en su
  // pestaña aparte.
  // =========================================================

  var meDebenPendienteResumenEl = document.getElementById("me-deben-pendiente-resumen");
  var meDebenList = document.getElementById("me-deben-list");
  var meDebenEmptyState = document.getElementById("me-deben-empty-state");

  var deudasMiasPendienteResumenEl = document.getElementById("deudas-mias-pendiente-resumen");
  var deudasMiasList = document.getElementById("deudas-mias-list");
  var deudasMiasEmptyState = document.getElementById("deudas-mias-empty-state");


  var saldoNetoSection = document.getElementById("saldo-neto-section");
  var saldoNetoList = document.getElementById("saldo-neto-list");


  // ---------- Confirmación de pago (ventana flotante compartida) ----------

  var pagoConfirmModal = document.getElementById("pago-confirm-modal");
  var pagoConfirmDetalle = document.getElementById("pago-confirm-detalle");
  var pagoConfirmOkBtn = document.getElementById("pago-confirm-ok-btn");
  var pagoConfirmCancelBtn = document.getElementById("pago-confirm-cancel-btn");
  var pagoConfirmCallback = null;

  function pedirConfirmacionPago(detalle, onConfirm) {
    pagoConfirmDetalle.textContent = detalle || "";
    pagoConfirmCallback = onConfirm;
    pagoConfirmModal.classList.remove("hidden");
  }

  function cerrarConfirmacionPago() {
    pagoConfirmCallback = null;
    pagoConfirmModal.classList.add("hidden");
  }

  pagoConfirmCancelBtn.addEventListener("click", cerrarConfirmacionPago);
  pagoConfirmModal.addEventListener("click", function (e) {
    if (e.target === pagoConfirmModal) cerrarConfirmacionPago();
  });
  pagoConfirmOkBtn.addEventListener("click", function () {
    var fn = pagoConfirmCallback;
    cerrarConfirmacionPago();
    if (fn) fn();
  });

  // ---------- Abonos ----------
  //
  // tipo: "me_deben" (persona = quién me paga) | "deuda_mia" (acreedor = a
  // quién le pago) | "tarjeta" (tarjetaId = qué tarjeta pago).
  function addAbono(tipo, key, amount, date, note, extra) {
    var abonos = loadAbonos();
    var record = { id: uid(), tipo: tipo, amount: amount, date: date, note: note || null, createdAt: Date.now() };
    if (tipo === "me_deben") record.persona = key;
    if (tipo === "deuda_mia") record.acreedor = key;
    if (extra && extra.tarjetaId) record.tarjetaId = extra.tarjetaId;
    if (extra && extra.aplicarATarjetaId) {
      record.aplicarATarjetaId = extra.aplicarATarjetaId;
      record.aplicadoAlBanco = false;
    }
    abonos.push(record);
    if (saveAbonos(abonos)) {
      renderAll();
      showToast(tipo === "tarjeta" ? "Abono a la tarjeta registrado." : "Pago registrado.");
    }
  }

  // ---------- Consultas por deudor / acreedor ----------

  function comprasMeDeben(key) {
    return loadCompras().filter(function (c) { return esMeDeben(c) && !esCargoFuturo(c) && deudorKey(c) === key; });
  }

  function abonosMeDeben(key) {
    return loadAbonos().filter(function (a) {
      return a.tipo === "me_deben" && normalizeDeudorKey(a.persona) === key;
    });
  }

  function comprasDeudaMia(acreedorId) {
    return loadCompras().filter(function (c) { return esDeudaMia(c) && !esCargoFuturo(c) && c.acreedor === acreedorId; });
  }

  function abonosDeudaMia(acreedorId) {
    return loadAbonos().filter(function (a) { return a.tipo === "deuda_mia" && a.acreedor === acreedorId; });
  }

  // =========================================================
  // Un solo contador de plata: los abonos.
  //
  // Marcar una compra o una cuota como pagada es una ETIQUETA, no un ingreso.
  // Si las etiquetas sumaran aparte de los abonos, el mismo dinero se
  // descontaría dos veces (registrar el reembolso y además marcar la compra).
  // Por eso el pendiente sale siempre de: generado − plata realmente recibida.
  // =========================================================

  function cuotaPaidTotal(compra) {
    if (compra.tipo !== "cuotas") return 0;
    return buildCuotaSchedule(compra).filter(function (c) { return c.paid; }).reduce(function (sum, c) { return sum + c.amount; }, 0);
  }

  // Cuánto de esta compra está declarado como saldado (etiquetas), sin que eso
  // implique por sí solo que entró plata.
  function compraCubierta(compra) {
    if (compra.pagada) return Number(compra.monto) || 0;
    return cuotaPaidTotal(compra);
  }

  function balanceDe(compras, abonos) {
    var generado = compras.reduce(function (sum, c) { return sum + (Number(c.monto) || 0); }, 0);
    var recibido = abonos.reduce(function (sum, a) { return sum + (Number(a.amount) || 0); }, 0);
    var cubierto = compras.reduce(function (sum, c) { return sum + compraCubierta(c); }, 0);
    return {
      generado: generado,
      abonado: recibido,
      pendiente: Math.max(0, generado - recibido),
      cubierto: cubierto,
      // Plata que ya entró pero que todavía no se atribuyó a ninguna compra:
      // es la que evita volver a descontar al marcar una como pagada.
      sinAsignar: Math.max(0, recibido - cubierto),
      // Etiquetado como pagado sin que exista ese dinero registrado.
      sinRespaldo: Math.max(0, cubierto - recibido)
    };
  }

  function balanceMeDeben(key) {
    return balanceDe(comprasMeDeben(key), abonosMeDeben(key));
  }

  function balanceDeudaMia(acreedorId) {
    return balanceDe(comprasDeudaMia(acreedorId), abonosDeudaMia(acreedorId));
  }

  function todosLosDeudores() {
    var keys = loadCompras().filter(function (c) { return esMeDeben(c) && !esCargoFuturo(c); }).map(deudorKey).filter(Boolean);
    return Array.from(new Set(keys));
  }

  function todosLosAcreedores() {
    var ids = loadCompras().filter(function (c) { return esDeudaMia(c) && !esCargoFuturo(c); }).map(function (c) { return c.acreedor; });
    return Array.from(new Set(ids));
  }

  // Solo quienes todavía deben algo: quien ya quedó al día se va a "Deudas
  // pagadas" (ver renderDeudasPagadas), para no dejar el listado activo
  // lleno de tarjetas en $0 que ya no hace falta revisar.
  function deudoresConDeuda() {
    return todosLosDeudores().filter(function (key) { return balanceMeDeben(key).pendiente > 0; })
      .sort(function (a, b) { return balanceMeDeben(b).pendiente - balanceMeDeben(a).pendiente; });
  }

  function acreedoresConDeuda() {
    return todosLosAcreedores().filter(function (id) { return balanceDeudaMia(id).pendiente > 0; })
      .sort(function (a, b) { return balanceDeudaMia(b).pendiente - balanceDeudaMia(a).pendiente; });
  }

  function deudoresAlDia() {
    return todosLosDeudores().filter(function (key) { return balanceMeDeben(key).pendiente <= 0; })
      .sort(function (a, b) { return deudorNombre(a).localeCompare(deudorNombre(b)); });
  }

  function acreedoresAlDia() {
    return todosLosAcreedores().filter(function (id) { return balanceDeudaMia(id).pendiente <= 0; })
      .sort(function (a, b) { return personaNombre(a).localeCompare(personaNombre(b)); });
  }

  function totalMeDeben() {
    return deudoresConDeuda().reduce(function (sum, k) { return sum + balanceMeDeben(k).pendiente; }, 0);
  }

  function totalDeudasMias() {
    return acreedoresConDeuda().reduce(function (sum, id) { return sum + balanceDeudaMia(id).pendiente; }, 0);
  }

  // ---------- Marcar compras / cuotas como pagadas ----------

  function balanceDeCompra(compra) {
    if (esMeDeben(compra)) return balanceMeDeben(deudorKey(compra));
    if (esDeudaMia(compra)) return balanceDeudaMia(compra.acreedor);
    return null;
  }

  // Guarda un abono sin refrescar la pantalla, para poder combinarlo con el
  // marcado en una sola operación.
  //
  // Si la compra se pagó con una tarjeta propia, ese dinero que te devuelven
  // NO se da por abonado al banco automáticamente: queda marcado como
  // "recibido, pendiente de aplicar" (igual que cuando se elige una tarjeta
  // a mano en "Registrar reembolso recibido"), para que la tarjeta lo avise
  // en vez de darlo por pagado solo.
  function pushAbonoDeCompra(compra, monto, nota) {
    var abonos = loadAbonos();
    var record = { id: uid(), amount: monto, date: todayStamp(), note: nota || null, createdAt: Date.now() };
    if (esMeDeben(compra)) {
      record.tipo = "me_deben";
      record.persona = deudorKey(compra);
      if (compra.tarjetaId && esTarjetaPersonal(compra.tarjetaId)) {
        record.aplicarATarjetaId = compra.tarjetaId;
        record.aplicadoAlBanco = false;
      }
    } else {
      record.tipo = "deuda_mia";
      record.acreedor = compra.acreedor;
    }
    abonos.push(record);
    return saveAbonos(abonos);
  }

  function aplicarMarcado(compraId, index, valor) {
    var compras = loadCompras();
    var compra = compras.find(function (c) { return c.id === compraId; });
    if (!compra) return false;
    if (index === null) {
      compra.pagada = valor;
    } else {
      if (!Array.isArray(compra.cuotasPagadas)) compra.cuotasPagadas = [];
      compra.cuotasPagadas[index] = valor;
    }
    return saveCompras(compras);
  }

  // ---------- Ventana de "marcar como pagada" ----------

  var cobroModal = document.getElementById("cobro-confirm-modal");
  var cobroTitulo = document.getElementById("cobro-confirm-titulo");
  var cobroMessage = document.getElementById("cobro-confirm-message");
  var cobroOkBtn = document.getElementById("cobro-confirm-ok-btn");
  var cobroSoloBtn = document.getElementById("cobro-confirm-solo-btn");
  var cobroCancelBtn = document.getElementById("cobro-confirm-cancel-btn");
  var cobroPendiente = null; // { compraId, index, falta, esMeDeben }

  function cerrarCobroModal() {
    cobroPendiente = null;
    cobroModal.classList.add("hidden");
  }

  cobroCancelBtn.addEventListener("click", cerrarCobroModal);
  cobroModal.addEventListener("click", function (e) {
    if (e.target === cobroModal) cerrarCobroModal();
  });

  cobroSoloBtn.addEventListener("click", function () {
    var d = cobroPendiente;
    cerrarCobroModal();
    if (!d) return;
    if (aplicarMarcado(d.compraId, d.index, true)) {
      renderAll();
      showToast("Marcada como pagada. La deuda no cambió porque no se registró dinero.");
    }
  });

  cobroOkBtn.addEventListener("click", function () {
    var d = cobroPendiente;
    cerrarCobroModal();
    if (!d) return;
    var compra = loadCompras().find(function (c) { return c.id === d.compraId; });
    if (!compra) return;
    var nota = d.index === null
      ? "Pago de: " + compraDisplayName(compra)
      : "Cuota " + (d.index + 1) + " de: " + compraDisplayName(compra);
    if (pushAbonoDeCompra(compra, d.falta, nota) && aplicarMarcado(d.compraId, d.index, true)) {
      renderAll();
      showToast("Registrados " + formatCurrency(d.falta) + " y marcada como pagada.");
    }
  });

  // Antes de marcar algo como pagado se revisa cuánta plata ya entró sin
  // atribuir: solo se ofrece registrar la diferencia, nunca el monto completo
  // si ese dinero ya estaba contado.
  function pedirMarcadoPagado(compra, index, monto) {
    var balance = balanceDeCompra(compra);
    var sinAsignar = balance ? balance.sinAsignar : 0;
    var yaCubierto = Math.min(monto, sinAsignar);
    var falta = Math.max(0, monto - yaCubierto);
    var meDeben = esMeDeben(compra);

    if (falta <= 0) {
      if (aplicarMarcado(compra.id, index, true)) {
        renderAll();
        showToast("Marcada como pagada con el dinero que ya tenías registrado. No se descontó dos veces.");
      }
      return;
    }

    cobroPendiente = { compraId: compra.id, index: index, falta: falta, esMeDeben: meDeben };
    cobroTitulo.textContent = index === null ? "Marcar compra como pagada" : "Marcar cuota como pagada";

    var quePasa = meDeben
      ? "¿Registrar ese dinero como recibido ahora?"
      : "¿Registrar ese dinero como devuelto ahora?";
    var base = (index === null ? "Esta compra es de " : "Esta cuota es de ") + formatCurrency(monto) + ". ";
    cobroMessage.textContent = yaCubierto > 0
      ? base + "Ya tienes " + formatCurrency(yaCubierto) + " registrados sin asignar a ninguna compra, así que faltarían " +
        formatCurrency(falta) + ". " + quePasa
      : base + "No tienes dinero registrado sin asignar. " + quePasa;

    cobroOkBtn.textContent = meDeben ? "Sí, ya me pagaron" : "Sí, ya le pagué";
    cobroModal.classList.remove("hidden");
  }

  function toggleCompraPagada(compraId) {
    var compra = loadCompras().find(function (c) { return c.id === compraId; });
    if (!compra) return;

    // Desmarcar nunca toca la plata: solo saca la etiqueta. Los abonos ya
    // registrados se eliminan uno por uno desde su propia fila.
    if (compra.pagada) {
      if (aplicarMarcado(compraId, null, false)) {
        renderAll();
        showToast("Compra marcada como pendiente. Los abonos registrados siguen ahí.");
      }
      return;
    }

    // Gasto propio sin deuda (ej. tu parte de una compra compartida): no hay
    // dinero de nadie que registrar, así que no pasa por el modal de cobro.
    // Es solo un recordatorio de "ya tengo esta plata separada para pagar la
    // tarjeta" — no afecta ningún cálculo de deuda.
    if (!esMeDeben(compra) && !esDeudaMia(compra)) {
      if (aplicarMarcado(compraId, null, true)) {
        renderAll();
        showToast("Marcada como pagada: ya tienes esta plata separada.");
      }
      return;
    }

    pedirMarcadoPagado(compra, null, Number(compra.monto) || 0);
  }

  function toggleCuotaPagada(compraId, index) {
    var compra = loadCompras().find(function (c) { return c.id === compraId; });
    if (!compra) return;

    var pagadas = Array.isArray(compra.cuotasPagadas) ? compra.cuotasPagadas : [];
    if (pagadas[index]) {
      if (aplicarMarcado(compraId, index, false)) {
        renderAll();
        showToast("Cuota marcada como pendiente. Los abonos registrados siguen ahí.");
      }
      return;
    }

    var cuota = buildCuotaSchedule(compra)[index];
    pedirMarcadoPagado(compra, index, cuota ? cuota.amount : 0);
  }

  // ---------- Bloques compartidos ----------

  // Fila compacta de una compra (Deudas, detalle de compras compartidas).
  // Dentro de Deuda Tarjetas se usa otra fila propia (ver
  // deudatarjetas.js), porque ahí lo que importa es el banco, no la persona.
  function buildCompraMiniRow(compra, opciones) {
    var conBoton = opciones && opciones.conBotonPagada;
    var row = document.createElement("div");
    row.className = "compra-mini-row" + (compra.pagada ? " compra-mini-pagada" : "");

    var info = document.createElement("div");
    info.className = "compra-mini-info";
    var descEl = document.createElement("span");
    descEl.className = "compra-mini-desc";
    descEl.textContent = compraDisplayName(compra);
    var metaEl = document.createElement("span");
    metaEl.className = "compra-mini-meta";
    var metaTexto = formatDateDisplay(compra.fecha) + " · " + categoriaLabel(compra) + " · " + metodoPagoLabel(compra);
    if (compra.recurrenceId) {
      metaTexto += " · 🔁 " + compra.recurrenceIndex + "/" + compra.recurrenceTotal;
      var prox = suscripcionProximoCargoIso(compra);
      if (prox) metaTexto += " · próximo " + formatDateDisplay(prox);
    }
    metaEl.textContent = metaTexto;
    info.appendChild(descEl);
    info.appendChild(metaEl);

    if (compra.compartidaId) {
      var shareEl = document.createElement("span");
      shareEl.className = "compra-mini-meta";
      shareEl.textContent = "🤝 Compra compartida, total " + formatCurrency(compra.compartidaTotal) +
        " entre: " + compartidaParticipantesTexto(compra);
      info.appendChild(shareEl);

      var itemsTexto = itemsResumenTexto(compra);
      if (itemsTexto) {
        var itemsEl = document.createElement("span");
        itemsEl.className = "compra-mini-meta";
        itemsEl.textContent = "🧾 " + itemsTexto;
        info.appendChild(itemsEl);
      }
    }

    if (compra.fechaPagoAcordada && !compra.pagada) {
      var fechaAcordadaEl = document.createElement("span");
      fechaAcordadaEl.className = "compra-mini-meta";
      fechaAcordadaEl.textContent = "📅 Pago acordado: " + formatDateDisplay(compra.fechaPagoAcordada);
      info.appendChild(fechaAcordadaEl);
    }

    row.appendChild(info);

    var valueEl = document.createElement("span");
    valueEl.className = "compra-mini-value";
    valueEl.textContent = formatCurrency(compra.monto);
    row.appendChild(valueEl);

    if (conBoton) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn-small " + (compra.pagada ? "btn-secondary" : "btn-primary");
      btn.textContent = compra.pagada ? "✓ Pagada" : "Marcar pagada";
      btn.addEventListener("click", function () { toggleCompraPagada(compra.id); });
      row.appendChild(btn);
    }

    return row;
  }

  // Compra en cuotas: en vez de una fila simple, muestra el cronograma
  // completo (cada cuota con su fecha y monto) para poder marcar cuotas
  // específicas como pagadas, además del abono genérico al total.
  function buildCuotaBlock(compra) {
    var wrap = document.createElement("div");
    wrap.className = "cuota-schedule-block";

    var header = document.createElement("div");
    header.className = "compra-mini-row";
    var info = document.createElement("div");
    info.className = "compra-mini-info";
    var descEl = document.createElement("span");
    descEl.className = "compra-mini-desc";
    descEl.textContent = compraDisplayName(compra);
    var metaEl = document.createElement("span");
    metaEl.className = "compra-mini-meta";
    var valorCuota = Math.round((Number(compra.monto) || 0) / (compra.cuotas || 1));
    metaEl.textContent = "Comprado el " + formatDateDisplay(compra.fecha) + " · " + compra.cuotas +
      " cuotas de " + formatCurrency(valorCuota) + " · total " + formatCurrency(compra.monto) +
      (compra.tieneInteres ? " · con interés" : " · sin interés");
    info.appendChild(descEl);
    info.appendChild(metaEl);
    header.appendChild(info);

    var valueEl = document.createElement("span");
    valueEl.className = "compra-mini-value";
    valueEl.textContent = formatCurrency(compra.monto);
    header.appendChild(valueEl);

    var todoBtn = document.createElement("button");
    todoBtn.type = "button";
    todoBtn.className = "btn btn-small " + (compra.pagada ? "btn-secondary" : "btn-primary");
    todoBtn.textContent = compra.pagada ? "✓ Pagada" : "Marcar pagada";
    todoBtn.addEventListener("click", function () { toggleCompraPagada(compra.id); });
    header.appendChild(todoBtn);

    wrap.appendChild(header);

    buildCuotaSchedule(compra).forEach(function (cuota) {
      var pagada = cuota.paid || compra.pagada;
      var row = document.createElement("div");
      row.className = "cuota-schedule-row" + (pagada ? " cuota-paid" : "");

      var label = document.createElement("span");
      label.className = "cuota-schedule-label";
      label.textContent = "Cuota " + (cuota.index + 1) + "/" + compra.cuotas + " — " + formatCurrency(cuota.amount) + " — vence " + formatDateDisplay(cuota.dueIso);
      row.appendChild(label);

      var toggleBtn = document.createElement("button");
      toggleBtn.type = "button";
      toggleBtn.className = "btn btn-small " + (pagada ? "btn-secondary" : "btn-primary");
      toggleBtn.textContent = pagada ? "✓ Pagada" : "Marcar pagada";
      toggleBtn.disabled = !!compra.pagada;
      toggleBtn.addEventListener("click", function () { toggleCuotaPagada(compra.id, cuota.index); });
      row.appendChild(toggleBtn);

      wrap.appendChild(row);
    });

    return wrap;
  }

  function buildAbonoRow(abono) {
    var row = document.createElement("div");
    row.className = "abono-row";

    var infoWrap = document.createElement("div");
    infoWrap.className = "abono-row-info";
    var amountEl = document.createElement("span");
    amountEl.className = "abono-row-amount";
    amountEl.textContent = formatCurrency(abono.amount);
    var metaEl = document.createElement("span");
    metaEl.className = "abono-row-meta";
    metaEl.textContent = formatDateDisplay(abono.date) + (abono.note ? " · " + abono.note : "");
    infoWrap.appendChild(amountEl);
    infoWrap.appendChild(metaEl);
    row.appendChild(infoWrap);

    var deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "btn btn-danger btn-small";
    deleteBtn.textContent = "Eliminar";
    deleteBtn.addEventListener("click", function () { requestDelete("abono", abono.id); });
    row.appendChild(deleteBtn);

    return row;
  }

  // Mini-formulario inline genérico (monto + fecha + nota + guardar) que se
  // reusa para abonar cualquier deuda o una tarjeta.
  function buildInlinePaymentForm(onSave) {
    var wrap = document.createElement("div");
    wrap.className = "deuda-payment-form hidden";

    var amountInput = document.createElement("input");
    amountInput.type = "number";
    amountInput.min = "0";
    amountInput.step = "1";
    amountInput.placeholder = "Monto";
    amountInput.className = "deuda-payment-amount";

    var dateInput = document.createElement("input");
    dateInput.type = "date";
    dateInput.value = todayStamp();
    dateInput.className = "deuda-payment-date";

    var noteInput = document.createElement("input");
    noteInput.type = "text";
    noteInput.placeholder = "Nota (opcional)";
    noteInput.className = "deuda-payment-note";

    var saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "btn btn-primary btn-small";
    saveBtn.textContent = "Guardar";
    saveBtn.addEventListener("click", function () {
      var amount = Number(amountInput.value);
      if (!amount || amount <= 0) {
        showToast("Ingresa un monto válido.");
        return;
      }
      if (!dateInput.value) {
        showToast("Selecciona una fecha.");
        return;
      }
      onSave(amount, dateInput.value, noteInput.value.trim());
    });

    wrap.appendChild(amountInput);
    wrap.appendChild(dateInput);
    wrap.appendChild(noteInput);
    wrap.appendChild(saveBtn);
    return wrap;
  }

  // Agrupa una lista de compras por quién las compró, conservando el orden
  // de aparición del primer grupo encontrado. Se usa para separar, dentro de
  // una misma deuda, los distintos "flujos" de plata (ej. lo que compró
  // Colun vs. lo que compré yo directamente).
  function agruparComprasPorComprador(compras) {
    var grupos = [];
    var indices = {};
    compras.forEach(function (c) {
      var key = compradorKey(c);
      if (!(key in indices)) {
        indices[key] = grupos.length;
        grupos.push({ nombre: compradorNombre(c), compras: [] });
      }
      grupos[indices[key]].compras.push(c);
    });
    return grupos;
  }

  // Pinta una lista de compras dentro de `container`, agrupando por
  // comprador con su propio subtotal cuando hay más de uno (ver comentario
  // de agruparComprasPorComprador). Reusado tanto para las compras activas
  // como para las ya pagadas, cuando se muestran por separado.
  function renderComprasEnContenedor(container, compras) {
    container.innerHTML = "";
    var renderCompraItem = function (c) {
      container.appendChild(c.tipo === "cuotas" ? buildCuotaBlock(c) : buildCompraMiniRow(c, { conBotonPagada: true }));
    };
    var grupos = agruparComprasPorComprador(compras);
    if (grupos.length > 1) {
      grupos.forEach(function (grupo, i) {
        var totalGrupo = grupo.compras.reduce(function (sum, c) { return sum + (Number(c.monto) || 0); }, 0);
        var pendienteGrupo = grupo.compras.reduce(function (sum, c) { return sum + Math.max(0, (Number(c.monto) || 0) - compraCubierta(c)); }, 0);

        var grupoHead = document.createElement("div");
        grupoHead.className = "compra-grupo-head" + (i === 0 ? " compra-grupo-head-first" : "");
        var grupoNombre = document.createElement("span");
        grupoNombre.textContent = "🧑 Compró: " + grupo.nombre;
        var grupoMonto = document.createElement("span");
        grupoMonto.textContent = pendienteGrupo > 0
          ? "Pendiente " + formatCurrency(pendienteGrupo) + " de " + formatCurrency(totalGrupo)
          : formatCurrency(totalGrupo) + " (al día)";
        grupoHead.appendChild(grupoNombre);
        grupoHead.appendChild(grupoMonto);
        container.appendChild(grupoHead);

        grupo.compras.forEach(renderCompraItem);
      });
    } else {
      compras.forEach(renderCompraItem);
    }
  }

  // ---------- Tarjeta de deuda (formato unificado para ambas vistas) ----------
  //
  // Plegada por defecto: solo el nombre y las dos cifras que importan (lo
  // que se debe hoy y lo ya devuelto). Todo lo demás — avisos, botones,
  // compras y abonos — vive adentro y se ve al tocarla, para que la lista
  // completa de personas quepa de un vistazo en vez de una pantalla larga
  // de tarjetas todas abiertas.
  function buildDeudaCard(config) {
    var balance = balanceDe(config.compras, config.abonos);

    var card = document.createElement("details");
    card.className = "deuda-card";
    if (config.claveKey) card.dataset.key = config.claveKey;

    var head = document.createElement("summary");
    head.className = "deuda-card-head";

    var titleWrap = document.createElement("div");
    titleWrap.className = "deuda-card-title-wrap";
    var titleEl = document.createElement("div");
    titleEl.className = "deuda-card-title";
    titleEl.textContent = config.titulo;
    titleWrap.appendChild(titleEl);
    if (config.subtitulo) {
      var subEl = document.createElement("div");
      subEl.className = "deuda-card-subtitle";
      subEl.textContent = config.subtitulo;
      titleWrap.appendChild(subEl);
    }
    head.appendChild(titleWrap);

    var stats = document.createElement("div");
    stats.className = "deuda-card-stats";

    var statDeuda = document.createElement("div");
    statDeuda.className = "deuda-stat";
    var deudaLabel = document.createElement("span");
    deudaLabel.className = "deuda-stat-label";
    deudaLabel.textContent = "💲 Deuda actual";
    var deudaValue = document.createElement("span");
    deudaValue.className = "deuda-stat-value" + (balance.pendiente > 0 ? " pendiente" : " al-dia");
    deudaValue.textContent = balance.pendiente > 0 ? formatCurrency(balance.pendiente) : "Al día";
    statDeuda.appendChild(deudaLabel);
    statDeuda.appendChild(deudaValue);
    stats.appendChild(statDeuda);

    var statPagado = document.createElement("div");
    statPagado.className = "deuda-stat";
    var pagadoLabel = document.createElement("span");
    pagadoLabel.className = "deuda-stat-label";
    pagadoLabel.textContent = config.labelPagado || "Ya devuelto";
    var pagadoValue = document.createElement("span");
    pagadoValue.className = "deuda-stat-value pagado";
    pagadoValue.textContent = formatCurrency(balance.abonado);
    statPagado.appendChild(pagadoLabel);
    statPagado.appendChild(pagadoValue);
    stats.appendChild(statPagado);

    head.appendChild(stats);
    card.appendChild(head);

    var body = document.createElement("div");
    body.className = "deuda-card-body";

    // Avisos que explican por qué las cifras no calzan con las etiquetas.
    if (balance.sinAsignar > 0) {
      var libre = document.createElement("p");
      libre.className = "deuda-card-nota";
      libre.textContent = "💡 Ya registraste " + formatCurrency(balance.sinAsignar) +
        " como recibido, pero todavía no quedó ligado a ninguna compra o cuota específica. La próxima vez que marques una como pagada, este dinero se usa primero — así no se cuenta dos veces.";
      body.appendChild(libre);
    }
    if (balance.sinRespaldo > 0) {
      var sinPlata = document.createElement("p");
      sinPlata.className = "deuda-card-nota aviso";
      sinPlata.textContent = "⚠️ Hay " + formatCurrency(balance.sinRespaldo) +
        " marcados como pagados sin dinero registrado. La deuda sigue contándolos hasta que registres el pago.";
      body.appendChild(sinPlata);
    }

    var actions = document.createElement("div");
    actions.className = "tarjeta-card-actions";
    var paymentForm = config.paymentForm;

    var addPaymentBtn = document.createElement("button");
    addPaymentBtn.type = "button";
    addPaymentBtn.className = "btn btn-primary btn-small";
    addPaymentBtn.textContent = config.botonPago || "➕ Registrar pago parcial";
    addPaymentBtn.addEventListener("click", function () { paymentForm.classList.toggle("hidden"); });
    actions.appendChild(addPaymentBtn);

    if (config.onMarcarTodoPagado && balance.pendiente > 0) {
      var pagarTodoBtn = document.createElement("button");
      pagarTodoBtn.type = "button";
      pagarTodoBtn.className = "btn btn-secondary btn-small";
      pagarTodoBtn.textContent = "✅ Marcar toda la deuda como pagada";
      pagarTodoBtn.addEventListener("click", function () { config.onMarcarTodoPagado(balance.pendiente); });
      actions.appendChild(pagarTodoBtn);
    }

    body.appendChild(actions);
    body.appendChild(paymentForm);

    var compras = config.compras.slice().sort(function (a, b) { return String(b.fecha).localeCompare(String(a.fecha)); });
    if (compras.length > 0) {
      var comprasHeader = document.createElement("div");
      comprasHeader.className = "cuota-subtitle-row";
      var comprasTitle = document.createElement("div");
      comprasTitle.className = "cuota-subtitle";
      comprasTitle.textContent = "Compras que componen esta deuda";
      comprasHeader.appendChild(comprasTitle);

      // Las ya pagadas se guardan aparte, plegadas, para no llenar la vista
      // de compras que ya no hay que revisar — pero a veces conviene verlo
      // todo junto y ordenado por fecha para encontrar algo puntual.
      var hayPagadas = compras.some(function (c) { return c.pagada; });
      var fusionarInput = null;
      if (hayPagadas) {
        var fusionarLabel = document.createElement("label");
        fusionarLabel.className = "compras-fusionar-toggle";
        fusionarInput = document.createElement("input");
        fusionarInput.type = "checkbox";
        var fusionarTexto = document.createElement("span");
        fusionarTexto.textContent = "Ver todo junto (para buscar)";
        fusionarLabel.appendChild(fusionarInput);
        fusionarLabel.appendChild(fusionarTexto);
        comprasHeader.appendChild(fusionarLabel);
      }
      body.appendChild(comprasHeader);

      var comprasActivasEl = document.createElement("div");
      body.appendChild(comprasActivasEl);

      var pagadasBox = null;
      var pagadasSummary = null;
      var pagadasContenidoEl = null;
      if (hayPagadas) {
        pagadasBox = document.createElement("details");
        pagadasBox.className = "compras-pagadas-box";
        pagadasSummary = document.createElement("summary");
        pagadasBox.appendChild(pagadasSummary);
        pagadasContenidoEl = document.createElement("div");
        pagadasBox.appendChild(pagadasContenidoEl);
        body.appendChild(pagadasBox);
      }

      var renderComprasSeccion = function () {
        if (!hayPagadas || fusionarInput.checked) {
          renderComprasEnContenedor(comprasActivasEl, compras);
          if (pagadasBox) pagadasBox.classList.add("hidden");
          return;
        }
        var pendientes = compras.filter(function (c) { return !c.pagada; });
        var pagadas = compras.filter(function (c) { return c.pagada; });
        renderComprasEnContenedor(comprasActivasEl, pendientes);
        pagadasBox.classList.remove("hidden");
        pagadasSummary.textContent = "✓ Compras ya pagadas (" + pagadas.length + ")";
        renderComprasEnContenedor(pagadasContenidoEl, pagadas);
      };

      if (fusionarInput) fusionarInput.addEventListener("change", renderComprasSeccion);
      renderComprasSeccion();
    }

    var abonos = config.abonos.slice().sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
    if (abonos.length > 0) {
      var abonosTitle = document.createElement("div");
      abonosTitle.className = "cuota-subtitle";
      abonosTitle.textContent = config.tituloAbonos || "Pagos registrados";
      body.appendChild(abonosTitle);
      abonos.forEach(function (a) {
        var row = buildAbonoRow(a);
        if (a.aplicarATarjetaId) {
          var pendApl = montoPendienteDeAplicarDeAbono(a);
          var aplicado = montoAplicadoDeAbono(a);
          var tag = document.createElement("span");
          if (pendApl <= 0) {
            tag.className = "due-badge ok";
            tag.textContent = "Ya aplicado a " + tarjetaLabel(a.aplicarATarjetaId);
          } else if (aplicado > 0) {
            tag.className = "due-badge soon";
            tag.textContent = "Aplicado " + formatCurrency(aplicado) + " de " + formatCurrency(a.amount) + " a " + tarjetaLabel(a.aplicarATarjetaId);
          } else {
            tag.className = "due-badge soon";
            tag.textContent = "Pendiente de aplicar a " + tarjetaLabel(a.aplicarATarjetaId);
          }
          row.insertBefore(tag, row.lastChild);
        }
        body.appendChild(row);
      });
    }

    card.appendChild(body);
    return card;
  }

  // ---------- Me deben ----------

  function buildMeDebenPaymentForm(key) {
    // Solo tarjetas con el ciclo abierto: aplicar un reembolso a una tarjeta
    // ya cerrada dejaría un abono sobre un periodo sin consumo.
    var cardsUsed = Array.from(new Set(
      comprasMeDeben(key)
        .filter(function (c) { return !c.archivado; })
        .map(function (c) { return c.tarjetaId; })
        .filter(esTarjetaPersonal)
    ));

    var cardSelect = null;
    if (cardsUsed.length > 0) {
      cardSelect = document.createElement("select");
      cardSelect.className = "deuda-payment-card-select";
      var noneOpt = document.createElement("option");
      noneOpt.value = "";
      noneOpt.textContent = "No aplica / fue en efectivo";
      cardSelect.appendChild(noneOpt);
      cardsUsed.forEach(function (tarjetaId) {
        var opt = document.createElement("option");
        opt.value = tarjetaId;
        opt.textContent = "Aplicar a " + tarjetaLabel(tarjetaId);
        cardSelect.appendChild(opt);
      });
    }

    var wrap = buildInlinePaymentForm(function (amount, date, note) {
      var aplicarATarjetaId = cardSelect && cardSelect.value ? cardSelect.value : null;
      addAbono("me_deben", key, amount, date, note, { aplicarATarjetaId: aplicarATarjetaId });
    });

    if (cardSelect) wrap.insertBefore(cardSelect, wrap.lastChild);
    return wrap;
  }

  function renderMeDeben() {
    var deudores = deudoresConDeuda();

    meDebenEmptyState.classList.toggle("hidden", deudores.length !== 0);
    meDebenList.innerHTML = "";
    deudores.forEach(function (key) {
      meDebenList.appendChild(buildDeudaCard({
        claveKey: "me_deben::" + key,
        titulo: deudorNombre(key),
        subtitulo: "Le pagaste tú · pendiente de reembolso",
        labelPagado: "Ya te devolvió",
        botonPago: "➕ Registrar reembolso recibido",
        tituloAbonos: "Reembolsos recibidos",
        compras: comprasMeDeben(key),
        abonos: abonosMeDeben(key),
        paymentForm: buildMeDebenPaymentForm(key),
        onMarcarTodoPagado: function (pendiente) {
          pedirConfirmacionPago(
            "Se registrará " + formatCurrency(pendiente) + " como recibido de " + deudorNombre(key) + " y su deuda quedará al día.",
            function () { addAbono("me_deben", key, pendiente, todayStamp(), "Marcado como pagado por completo"); }
          );
        }
      }));
    });

    meDebenPendienteResumenEl.textContent = formatCurrency(totalMeDeben());
  }

  // ---------- Lo que debo ----------

  function renderDeudasMias() {
    var acreedores = acreedoresConDeuda();

    deudasMiasEmptyState.classList.toggle("hidden", acreedores.length !== 0);
    deudasMiasList.innerHTML = "";
    acreedores.forEach(function (id) {
      deudasMiasList.appendChild(buildDeudaCard({
        claveKey: "deuda_mia::" + id,
        titulo: personaNombre(id),
        subtitulo: "Puso la plata por ti · pendiente de devolución",
        labelPagado: "Ya le devolviste",
        botonPago: "➕ Registrar devolución",
        tituloAbonos: "Devoluciones registradas",
        compras: comprasDeudaMia(id),
        abonos: abonosDeudaMia(id),
        paymentForm: buildInlinePaymentForm(function (amount, date, note) {
          addAbono("deuda_mia", id, amount, date, note);
        }),
        onMarcarTodoPagado: function (pendiente) {
          pedirConfirmacionPago(
            "Se registrará una devolución de " + formatCurrency(pendiente) + " a " + personaNombre(id) + " y quedarás al día.",
            function () { addAbono("deuda_mia", id, pendiente, todayStamp(), "Marcado como pagado por completo"); }
          );
        }
      }));
    });

    deudasMiasPendienteResumenEl.textContent = formatCurrency(totalDeudasMias());
  }

  // ---------- Deudas pagadas (archivo) ----------
  //
  // Quien ya quedó al día sale del listado activo de arriba (para no
  // llenarlo de tarjetas en $0) pero sigue disponible acá, plegado, por si
  // hace falta revisar el historial.

  var deudasPagadasList = document.getElementById("deudas-pagadas-list");
  var deudasPagadasEmpty = document.getElementById("deudas-pagadas-empty");

  function renderDeudasPagadas() {
    if (!deudasPagadasList) return;
    var deudores = deudoresAlDia();
    var acreedores = acreedoresAlDia();

    deudasPagadasEmpty.classList.toggle("hidden", deudores.length !== 0 || acreedores.length !== 0);
    deudasPagadasList.innerHTML = "";

    deudores.forEach(function (key) {
      deudasPagadasList.appendChild(buildDeudaCard({
        claveKey: "me_deben::" + key,
        titulo: deudorNombre(key),
        subtitulo: "Ya te devolvió todo lo que le pagaste",
        labelPagado: "Te devolvió",
        botonPago: "➕ Registrar reembolso recibido",
        tituloAbonos: "Reembolsos recibidos",
        compras: comprasMeDeben(key),
        abonos: abonosMeDeben(key),
        paymentForm: buildMeDebenPaymentForm(key)
      }));
    });

    acreedores.forEach(function (id) {
      deudasPagadasList.appendChild(buildDeudaCard({
        claveKey: "deuda_mia::" + id,
        titulo: personaNombre(id),
        subtitulo: "Ya le devolviste todo lo que puso por ti",
        labelPagado: "Le devolviste",
        botonPago: "➕ Registrar devolución",
        tituloAbonos: "Devoluciones registradas",
        compras: comprasDeudaMia(id),
        abonos: abonosDeudaMia(id),
        paymentForm: buildInlinePaymentForm(function (amount, date, note) {
          addAbono("deuda_mia", id, amount, date, note);
        })
      }));
    });
  }

  // Abre y desplaza hasta el cuadro de deuda con esa clave (ver data-key en
  // buildDeudaCard), para saltar directo desde el resumen de saldo neto sin
  // tener que buscarlo a mano entre "Me deben" y "Lo que debo".
  function irACuadroDeuda(claveCard) {
    var card = document.querySelector('details.deuda-card[data-key="' + claveCard + '"]');
    if (!card) return;
    card.open = true;
    card.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  // ---------- Saldo neto por persona ----------
  //
  // Cruza ambas direcciones para no pagar de más: si papá te debe $35.000 y
  // tú le debes $12.000, lo que importa es que te debe $23.000.

  function renderSaldoNeto() {
    var claves = Array.from(new Set(deudoresConDeuda().concat(acreedoresConDeuda())));

    var filas = claves.map(function (key) {
      var meDeben = balanceMeDeben(key).pendiente;
      var leDebo = balanceDeudaMia(key).pendiente;
      return { key: key, meDeben: meDeben, leDebo: leDebo, neto: meDeben - leDebo };
    }).filter(function (f) { return f.meDeben > 0 || f.leDebo > 0; })
      .sort(function (a, b) { return Math.abs(b.neto) - Math.abs(a.neto); });

    saldoNetoList.innerHTML = "";
    saldoNetoSection.classList.toggle("hidden", filas.length === 0);

    filas.forEach(function (f) {
      var row = document.createElement("div");
      row.className = "saldo-neto-row";

      var izq = document.createElement("div");
      izq.className = "saldo-neto-info";
      var nombre = document.createElement("button");
      nombre.type = "button";
      nombre.className = "saldo-neto-nombre saldo-neto-nombre-btn";
      nombre.textContent = deudorNombre(f.key);
      // Si me debe y le debo a la vez, prioriza el cuadro del lado que pesa
      // más (el mismo que decide el signo del neto de arriba).
      var claveCard = (f.neto >= 0 ? "me_deben::" : "deuda_mia::") + f.key;
      nombre.addEventListener("click", function () { irACuadroDeuda(claveCard); });
      izq.appendChild(nombre);
      var detalle = document.createElement("span");
      detalle.className = "saldo-neto-detalle";
      detalle.textContent = "Te debe " + formatCurrency(f.meDeben) + " · le debes " + formatCurrency(f.leDebo);
      izq.appendChild(detalle);
      row.appendChild(izq);

      var valor = document.createElement("span");
      if (f.neto > 0) {
        valor.className = "saldo-neto-valor a-favor";
        valor.textContent = "Te debe " + formatCurrency(f.neto);
      } else if (f.neto < 0) {
        valor.className = "saldo-neto-valor en-contra";
        valor.textContent = "Le debes " + formatCurrency(-f.neto);
      } else {
        valor.className = "saldo-neto-valor";
        valor.textContent = "Están a mano";
      }
      row.appendChild(valor);

      saldoNetoList.appendChild(row);
    });
  }

  // Al marcar algo como pagado o eliminarlo se reconstruyen estas listas
  // desde cero, lo que por defecto cierra cualquier cuadro <details> que el
  // usuario tenía abierto (todos vuelven a su estado inicial: cerrado) y,
  // como la página encoge de golpe, el navegador ajusta el scroll y da la
  // sensación de que "salta". Se evita guardando qué cuadros (identificados
  // por su data-key) estaban abiertos y la posición del scroll antes de
  // reconstruir, para dejarlos tal como estaban después.
  function conPosicionPreservada(fn) {
    var abiertos = new Set();
    document.querySelectorAll("details[data-key][open]").forEach(function (d) { abiertos.add(d.dataset.key); });
    var scrollY = window.scrollY;

    fn();

    document.querySelectorAll("details[data-key]").forEach(function (d) {
      if (abiertos.has(d.dataset.key)) d.open = true;
    });
    window.scrollTo(0, scrollY);
  }

  function renderDeudas() {
    conPosicionPreservada(function () {
      renderSaldoNeto();
      renderMeDeben();
      renderDeudasMias();
      renderDeudasPagadas();
      renderDeudaTarjetasResumen();
    });
    actualizarToolbarMinimizar();
  }

  // ---------- Minimizar todo ----------
  //
  // Con varias personas abiertas a la vez la pestaña se vuelve eterna: la
  // barra (fija arriba al hacer scroll) cuenta cuántos cuadros hay abiertos
  // y los cierra todos de un toque.
  var tabDeudasEl = document.getElementById("tab-deudas");
  var deudasMinimizarBtn = document.getElementById("deudas-minimizar-btn");
  var deudasAbiertosTexto = document.getElementById("deudas-abiertos-texto");

  function cuadrosAbiertosDeudas() {
    return Array.from(tabDeudasEl.querySelectorAll("details[open]"));
  }

  function actualizarToolbarMinimizar() {
    var abiertos = cuadrosAbiertosDeudas().filter(function (d) { return d.classList.contains("deuda-card"); }).length;
    deudasAbiertosTexto.textContent = abiertos === 0
      ? "Todos los cuadros están cerrados"
      : abiertos + (abiertos === 1 ? " cuadro abierto" : " cuadros abiertos");
    deudasMinimizarBtn.disabled = cuadrosAbiertosDeudas().length === 0;
  }

  deudasMinimizarBtn.addEventListener("click", function () {
    cuadrosAbiertosDeudas().forEach(function (d) { d.open = false; });
    actualizarToolbarMinimizar();
    tabDeudasEl.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  // "toggle" no burbujea: se escucha en fase de captura para enterarse de
  // cualquier cuadro que se abra o cierre dentro de la pestaña.
  tabDeudasEl.addEventListener("toggle", actualizarToolbarMinimizar, true);
