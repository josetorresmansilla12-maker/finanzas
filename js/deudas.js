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

  var tarjetasDeudaTotalEl = document.getElementById("tarjetas-deuda-total-resumen");
  var tarjetasDeudaList = document.getElementById("tarjetas-deuda-list");
  var tarjetasDeudaEmptyState = document.getElementById("tarjetas-deuda-empty-state");

  var deudasTarjetasResumenList = document.getElementById("deudas-tarjetas-resumen-list");
  var deudasTarjetasResumenEmpty = document.getElementById("deudas-tarjetas-resumen-empty");

  var saldoNetoSection = document.getElementById("saldo-neto-section");
  var saldoNetoList = document.getElementById("saldo-neto-list");

  var tarjetasArchivoList = document.getElementById("tarjetas-archivo-list");
  var tarjetasArchivoEmpty = document.getElementById("tarjetas-archivo-empty");
  var tarjetasArchivoRangeSelect = document.getElementById("tarjetas-archivo-range");

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

  // ---------- Deuda de tarjetas de crédito propias ----------

  // Solo el ciclo abierto: lo ya pagado y archivado vive en "Estados de
  // cuenta pasados" y no vuelve a sumar en la vista activa.
  function comprasForTarjeta(tarjetaId) {
    return loadCompras().filter(function (c) { return c.tarjetaId === tarjetaId && !c.archivado && !esCargoFuturo(c); });
  }

  function abonosForTarjeta(tarjetaId) {
    return loadAbonos().filter(function (a) { return a.tipo === "tarjeta" && a.tarjetaId === tarjetaId && !a.archivado; });
  }

  // Cierra el ciclo de una tarjeta: todo su consumo y sus abonos abiertos
  // quedan sellados con la misma fecha y pasan al archivo.
  function archivarCicloTarjeta(tarjetaId) {
    var sello = { fecha: todayStamp(), cicloId: uid() };

    var compras = loadCompras();
    var comprasTocadas = false;
    compras.forEach(function (c) {
      if (c.tarjetaId === tarjetaId && !c.archivado) {
        c.archivado = sello;
        comprasTocadas = true;
      }
    });
    if (comprasTocadas) saveCompras(compras);

    var abonos = loadAbonos();
    var abonosTocados = false;
    abonos.forEach(function (a) {
      if (a.tipo === "tarjeta" && a.tarjetaId === tarjetaId && !a.archivado) {
        a.archivado = sello;
        abonosTocados = true;
      }
    });
    if (abonosTocados) saveAbonos(abonos);
  }

  function balanceForTarjeta(tarjetaId) {
    var generado = comprasForTarjeta(tarjetaId).reduce(function (sum, c) { return sum + (Number(c.monto) || 0); }, 0);
    var abonado = abonosForTarjeta(tarjetaId).reduce(function (sum, a) { return sum + (Number(a.amount) || 0); }, 0);
    return { generado: generado, abonado: abonado, pendiente: Math.max(0, generado - abonado) };
  }

  // Reembolsos de "me deben" que la persona ya me devolvió, pero que todavía
  // no le he traspasado al banco (estado intermedio a propósito: recibir el
  // dinero no significa que ya pagué la tarjeta).
  function pendienteAplicarBanco(tarjetaId) {
    return loadAbonos().filter(function (a) {
      return a.tipo === "me_deben" && a.aplicarATarjetaId === tarjetaId && !a.aplicadoAlBanco;
    }).reduce(function (sum, a) { return sum + (Number(a.amount) || 0); }, 0);
  }

  function addTarjetaAbonoManual(tarjetaId, amount, date, note) {
    addAbono("tarjeta", null, amount, date, note, { tarjetaId: tarjetaId });
  }

  // Cerrar el mes: registra lo que falte por pagar y archiva el periodo
  // completo, para que la vista activa quede solo con lo que viene después.
  function markTarjetaPagada(tarjetaId) {
    var balance = balanceForTarjeta(tarjetaId);
    if (balance.generado <= 0 && balance.abonado <= 0) {
      showToast("Esta tarjeta no tiene movimientos que cerrar.");
      return;
    }

    var detalle = balance.pendiente > 0
      ? "Se registrará un abono de " + formatCurrency(balance.pendiente) + " en " + tarjetaLabel(tarjetaId) +
        " y todo el consumo de este periodo pasará a Estados de cuenta pasados."
      : tarjetaLabel(tarjetaId) + " ya está al día. Se cerrará el periodo y su consumo pasará a Estados de cuenta pasados.";

    pedirConfirmacionPago(detalle, function () {
      if (balance.pendiente > 0) {
        var abonos = loadAbonos();
        abonos.push({
          id: uid(), tipo: "tarjeta", tarjetaId: tarjetaId, amount: balance.pendiente,
          date: todayStamp(), note: "Marcado como pagado por completo", createdAt: Date.now()
        });
        if (!saveAbonos(abonos)) return;
      }
      archivarCicloTarjeta(tarjetaId);
      renderAll();
      showToast("Estado de cuenta cerrado y archivado.");
    });
  }

  function aplicarReembolsosABanco(tarjetaId) {
    var pendientes = loadAbonos().filter(function (a) {
      return a.tipo === "me_deben" && a.aplicarATarjetaId === tarjetaId && !a.aplicadoAlBanco;
    });
    if (pendientes.length === 0) return;
    var total = pendientes.reduce(function (sum, a) { return sum + (Number(a.amount) || 0); }, 0);

    pedirConfirmacionPago(
      "Se abonarán " + formatCurrency(total) + " de reembolsos ya recibidos al pago de " + tarjetaLabel(tarjetaId) + ".",
      function () {
        var abonos = loadAbonos();
        abonos.forEach(function (a) {
          if (a.tipo === "me_deben" && a.aplicarATarjetaId === tarjetaId && !a.aplicadoAlBanco) {
            a.aplicadoAlBanco = true;
          }
        });
        abonos.push({
          id: uid(), tipo: "tarjeta", tarjetaId: tarjetaId, amount: total, date: todayStamp(),
          note: "Reembolsos de terceros aplicados al pago del banco", createdAt: Date.now(),
          // Queda anotado de qué reembolsos salió, para poder deshacerlo si
          // alguno de ellos se elimina después.
          origenReembolsos: pendientes.map(function (a) { return a.id; })
        });
        if (saveAbonos(abonos)) {
          renderAll();
          showToast("Reembolsos aplicados al pago de la tarjeta.");
        }
      });
  }

  // ---------- Bloques compartidos ----------

  // "contextoTarjeta" se usa al mostrar esta compra dentro de su tarjeta: ahí
  // que la persona ya te haya devuelto el dinero (compra.pagada) NO se tacha
  // como si el banco ya estuviera pagado — son dos cosas distintas. En su
  // lugar se muestra un aviso de que ese dinero todavía no se abonó ahí.
  function buildCompraMiniRow(compra, opciones) {
    var conBoton = opciones && opciones.conBotonPagada;
    var contextoTarjeta = opciones && opciones.contextoTarjeta;
    var tachar = compra.pagada && !contextoTarjeta;
    var row = document.createElement("div");
    row.className = "compra-mini-row" + (tachar ? " compra-mini-pagada" : "");

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

    if (contextoTarjeta && compra.pagada) {
      var pendienteBancoEl = document.createElement("span");
      pendienteBancoEl.className = "compra-mini-meta aviso-pendiente-banco";
      pendienteBancoEl.textContent = "💰 Dinero recibido, pero aún no abonado a la tarjeta";
      info.appendChild(pendienteBancoEl);
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
      var comprasTitle = document.createElement("div");
      comprasTitle.className = "cuota-subtitle";
      comprasTitle.textContent = "Compras que componen esta deuda";
      body.appendChild(comprasTitle);
      compras.forEach(function (c) {
        body.appendChild(c.tipo === "cuotas" ? buildCuotaBlock(c) : buildCompraMiniRow(c, { conBotonPagada: true }));
      });
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
          var tag = document.createElement("span");
          tag.className = "due-badge " + (a.aplicadoAlBanco ? "ok" : "soon");
          tag.textContent = a.aplicadoAlBanco
            ? "Ya aplicado a " + tarjetaLabel(a.aplicarATarjetaId)
            : "Pendiente de aplicar a " + tarjetaLabel(a.aplicarATarjetaId);
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
      var nombre = document.createElement("span");
      nombre.className = "saldo-neto-nombre";
      nombre.textContent = deudorNombre(f.key);
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

  function renderDeudas() {
    renderSaldoNeto();
    renderMeDeben();
    renderDeudasMias();
    renderDeudasPagadas();
    renderDeudaTarjetasResumen();
  }

  // Resumen rápido de "cuánto tengo que poner yo para pagar cada tarjeta",
  // visible directo en Deudas sin tener que cambiar de pestaña. Reusa el
  // mismo cálculo que la pestaña "Deuda Tarjetas" (balanceForTarjeta): suma
  // todo lo cargado en la tarjeta sin importar para quién fue la compra.
  function buildTarjetaDeudaResumenRow(tarjeta) {
    var balance = balanceForTarjeta(tarjeta.id);

    var row = document.createElement("div");
    row.className = "compra-mini-row";

    var info = document.createElement("div");
    info.className = "compra-mini-info";
    var nombreEl = document.createElement("span");
    nombreEl.className = "compra-mini-desc";
    nombreEl.textContent = tarjetaLabel(tarjeta.id);
    var metaEl = document.createElement("span");
    metaEl.className = "compra-mini-meta";
    metaEl.textContent = "Cargado: " + formatCurrency(balance.generado) + " · Ya abonado: " + formatCurrency(balance.abonado);
    info.appendChild(nombreEl);
    info.appendChild(metaEl);
    row.appendChild(info);

    var valueEl = document.createElement("span");
    valueEl.className = "compra-mini-value";
    valueEl.textContent = formatCurrency(balance.pendiente);
    row.appendChild(valueEl);

    return row;
  }

  function renderDeudaTarjetasResumen() {
    if (!deudasTarjetasResumenList) return;
    var tarjetas = misTarjetas().filter(function (t) { return balanceForTarjeta(t.id).pendiente > 0; })
      .sort(function (a, b) { return balanceForTarjeta(b.id).pendiente - balanceForTarjeta(a.id).pendiente; });

    deudasTarjetasResumenEmpty.classList.toggle("hidden", tarjetas.length !== 0);
    deudasTarjetasResumenList.innerHTML = "";
    tarjetas.forEach(function (t) { deudasTarjetasResumenList.appendChild(buildTarjetaDeudaResumenRow(t)); });
  }

  var irADeudaTarjetasBtn = document.getElementById("ir-a-deuda-tarjetas-btn");
  if (irADeudaTarjetasBtn) {
    irADeudaTarjetasBtn.addEventListener("click", function () { activateTab("deuda-tarjetas"); });
  }

  // ---------- Deuda de tarjetas de crédito (tab aparte) ----------

  function buildTarjetaDeudaCard(tarjeta) {
    var balance = balanceForTarjeta(tarjeta.id);
    var due = nextDueInfo(tarjeta);
    var avisoDays = tarjeta.diasAviso != null ? tarjeta.diasAviso : DEFAULT_DIAS_AVISO;
    var pendienteAplicar = pendienteAplicarBanco(tarjeta.id);

    var card = document.createElement("div");
    card.className = "tarjeta-card";

    var header = document.createElement("div");
    header.className = "tarjeta-card-header";

    var left = document.createElement("div");
    var nombreEl = document.createElement("span");
    nombreEl.className = "tarjeta-nombre";
    nombreEl.textContent = tarjeta.nombre + (tarjeta.ultimos4 ? " •••• " + tarjeta.ultimos4 : "");
    left.appendChild(nombreEl);
    if (tarjeta.diaFacturacion || tarjeta.diaPago) {
      var meta = document.createElement("div");
      meta.className = "tarjeta-meta";
      var metaParts = [];
      if (tarjeta.diaFacturacion) metaParts.push("Facturación: " + diaOrRangoLabel(tarjeta.diaFacturacion, tarjeta.diaFacturacionHasta));
      if (tarjeta.diaPago) metaParts.push("Pago: " + diaOrRangoLabel(tarjeta.diaPago, tarjeta.diaPagoHasta));
      meta.textContent = metaParts.join(" · ");
      left.appendChild(meta);
    }
    header.appendChild(left);

    if (due) {
      var status = dueBadgeStatus(due.daysUntil, avisoDays);
      var badge = document.createElement("span");
      badge.className = "due-badge " + status;
      badge.textContent = dueBadgeLabel(due.daysUntil) + " (" + fechaOrRangoLabel(due) + ")";
      header.appendChild(badge);
    }
    card.appendChild(header);

    var summary = document.createElement("section");
    summary.className = "summary-cards deuda-tarjeta-summary";
    [
      ["Deuda generada", balance.generado, ""],
      ["Abonado al banco", balance.abonado, ""],
      ["Pendiente", balance.pendiente, ""],
      // Plata que ya recibiste de otros pero que todavía no le pasaste al
      // banco: es tuya solo de paso.
      ["Reembolsos por abonar", pendienteAplicar, pendienteAplicar > 0 ? "card-alerta" : ""]
    ].forEach(function (trio) {
      var div = document.createElement("div");
      div.className = "card " + trio[2];
      var label = document.createElement("span");
      label.className = "card-label";
      label.textContent = trio[0];
      var value = document.createElement("span");
      value.className = "card-value";
      value.textContent = formatCurrency(trio[1]);
      div.appendChild(label);
      div.appendChild(value);
      summary.appendChild(div);
    });
    card.appendChild(summary);

    if (pendienteAplicar > 0) {
      var callout = document.createElement("div");
      callout.className = "app-alert";
      callout.style.marginBottom = "12px";
      var calloutText = document.createElement("span");
      calloutText.className = "app-alert-text";
      calloutText.textContent = "💰 Dinero recibido (" + formatCurrency(pendienteAplicar) + "), pero aún no abonado a la tarjeta. Confírmalo cuando de verdad lo hayas pagado al banco.";
      callout.appendChild(calloutText);
      var applyBtn = document.createElement("button");
      applyBtn.type = "button";
      applyBtn.className = "btn btn-secondary btn-small";
      applyBtn.textContent = "Aplicar al pago del banco";
      applyBtn.addEventListener("click", function () { aplicarReembolsosABanco(tarjeta.id); });
      callout.appendChild(applyBtn);
      card.appendChild(callout);
    }

    var actions = document.createElement("div");
    actions.className = "tarjeta-card-actions";

    var pagadaBtn = document.createElement("button");
    pagadaBtn.type = "button";
    pagadaBtn.className = "btn btn-primary btn-small";
    pagadaBtn.textContent = "✅ Marcar como pagado";
    pagadaBtn.addEventListener("click", function () { markTarjetaPagada(tarjeta.id); });
    actions.appendChild(pagadaBtn);

    var abonoForm = buildInlinePaymentForm(function (amount, date, note) {
      addTarjetaAbonoManual(tarjeta.id, amount, date, note);
    });

    var abonoBtn = document.createElement("button");
    abonoBtn.type = "button";
    abonoBtn.className = "btn btn-secondary btn-small";
    abonoBtn.textContent = "➕ Abonar manualmente";
    abonoBtn.addEventListener("click", function () { abonoForm.classList.toggle("hidden"); });
    actions.appendChild(abonoBtn);

    card.appendChild(actions);
    card.appendChild(abonoForm);

    var compras = comprasForTarjeta(tarjeta.id).sort(function (a, b) { return String(b.fecha).localeCompare(String(a.fecha)); });
    if (compras.length > 0) {
      var comprasTitle = document.createElement("div");
      comprasTitle.className = "cuota-subtitle";
      comprasTitle.textContent = "Compras de este periodo";
      card.appendChild(comprasTitle);
      compras.forEach(function (c) { card.appendChild(buildCompraMiniRow(c, { contextoTarjeta: true })); });
    } else if (balance.generado === 0) {
      var sinCiclo = document.createElement("p");
      sinCiclo.className = "empty-state";
      sinCiclo.textContent = "Sin consumos en este periodo. Lo anterior está en Estados de cuenta pasados.";
      card.appendChild(sinCiclo);
    }

    var abonos = abonosForTarjeta(tarjeta.id).sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
    if (abonos.length > 0) {
      var abonosTitle = document.createElement("div");
      abonosTitle.className = "cuota-subtitle";
      abonosTitle.textContent = "Pagos/abonos al banco";
      card.appendChild(abonosTitle);
      abonos.forEach(function (a) { card.appendChild(buildAbonoRow(a)); });
    }

    return card;
  }

  function renderDeudaTarjetas() {
    var tarjetas = misTarjetas().slice().sort(function (a, b) {
      return balanceForTarjeta(b.id).pendiente - balanceForTarjeta(a.id).pendiente;
    });

    tarjetasDeudaEmptyState.classList.toggle("hidden", tarjetas.length !== 0);
    tarjetasDeudaList.innerHTML = "";
    tarjetas.forEach(function (t) { tarjetasDeudaList.appendChild(buildTarjetaDeudaCard(t)); });

    var totalPendiente = tarjetas.reduce(function (sum, t) { return sum + balanceForTarjeta(t.id).pendiente; }, 0);
    tarjetasDeudaTotalEl.textContent = formatCurrency(totalPendiente);

    renderArchivoTarjetas();
  }

  // ---------- Estados de cuenta pasados ----------
  //
  // El archivo se ordena por el mes de la compra (no por cuándo se cerró el
  // ciclo), que es lo que sirve para responder "en qué se gastó en julio".

  function renderArchivoTarjetas() {
    var archivadas = loadCompras().filter(function (c) { return c.tarjetaId && c.archivado; });

    buildTimeFilterOptions(tarjetasArchivoRangeSelect, archivadas.map(function (c) { return c.fecha; }), "all");
    var rango = tarjetasArchivoRangeSelect.value;
    var visibles = archivadas.filter(function (c) { return timeFilterMatches(rango, c.fecha); });

    tarjetasArchivoList.innerHTML = "";
    tarjetasArchivoEmpty.classList.toggle("hidden", visibles.length !== 0);
    if (visibles.length === 0) {
      tarjetasArchivoEmpty.textContent = archivadas.length === 0
        ? "Todavía no hay estados de cuenta cerrados."
        : "No hay consumos archivados en el periodo elegido.";
      return;
    }

    var byMonth = {};
    visibles.forEach(function (c) {
      var key = monthKey(c.fecha);
      if (!byMonth[key]) byMonth[key] = [];
      byMonth[key].push(c);
    });

    Object.keys(byMonth).sort().reverse().forEach(function (key, i) {
      var items = byMonth[key].sort(function (a, b) { return String(b.fecha).localeCompare(String(a.fecha)); });
      var total = items.reduce(function (sum, c) { return sum + (Number(c.monto) || 0); }, 0);

      var details = document.createElement("details");
      details.className = "month-group";
      if (i === 0) details.open = true;

      var summary = document.createElement("summary");
      var titleSpan = document.createElement("span");
      titleSpan.textContent = monthLabel(key);
      var metaSpan = document.createElement("span");
      metaSpan.className = "month-meta";
      metaSpan.textContent = items.length + (items.length === 1 ? " compra · " : " compras · ") + formatCurrency(total);
      summary.appendChild(titleSpan);
      summary.appendChild(metaSpan);
      details.appendChild(summary);

      var tableWrap = document.createElement("div");
      tableWrap.className = "table-wrapper";
      var table = document.createElement("table");
      var thead = document.createElement("thead");
      thead.innerHTML = "<tr><th>Fecha</th><th>Qué se compró</th><th>Categoría</th><th>Tarjeta</th><th>Pagado el</th><th class=\"col-value\">Monto</th></tr>";
      table.appendChild(thead);

      var tbody = document.createElement("tbody");
      items.forEach(function (c) {
        var tr = document.createElement("tr");
        [
          formatDateDisplay(c.fecha),
          compraDisplayName(c),
          categoriaLabel(c),
          tarjetaLabel(c.tarjetaId),
          formatDateDisplay(c.archivado.fecha)
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

      tarjetasArchivoList.appendChild(details);
    });
  }

  tarjetasArchivoRangeSelect.addEventListener("change", renderArchivoTarjetas);
