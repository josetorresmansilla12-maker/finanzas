"use strict";

  // =========================================================
  // DEUDA DE TARJETAS — por estado de cuenta (mes de pago)
  //
  // Antes la deuda de cada tarjeta era un saldo corrido ("todo lo cargado
  // menos todo lo abonado") que solo se reiniciaba al apretar "Marcar como
  // pagado". Eso mezclaba compras de distintos estados de cuenta: una
  // compra hecha después del cierre aparecía como si hubiera que pagarla
  // ya, y al cerrar a mano se archivaban compras que en realidad eran del
  // mes siguiente.
  //
  // Ahora cada compra genera "cargos" en el estado de cuenta que le toca
  // según el ciclo real de la tarjeta (ver periodoDeFecha en tarjetas.js):
  // el monto completo si es pago único, o una cuota por mes si es en
  // cuotas. Cada abono queda asignado a un estado de cuenta (`periodo`,
  // el mes de pago "YYYY-MM"). Así cada mes se sabe solo: cuánto vence,
  // cuánto ya se abonó y si está pagado.
  //
  // Compatibilidad con los datos anteriores:
  // - Compras archivadas (cierres hechos a mano) se consideran pagadas.
  // - Abonos sin `periodo` y sin archivar (saldo corrido del modelo viejo)
  //   pagan los estados de cuenta más antiguos primero, que es justo lo que
  //   significaban: plata abonada al saldo total.
  // - Lo abonado de más en un mes pasa como saldo a favor al siguiente.
  // =========================================================

  var tarjetasDeudaList = document.getElementById("tarjetas-deuda-list");
  var tarjetasDeudaEmptyState = document.getElementById("tarjetas-deuda-empty-state");
  var tarjetasMesSelect = document.getElementById("tarjetas-mes-select");
  var tarjetasMesHint = document.getElementById("tarjetas-mes-hint");
  var tarjetasMesStats = document.getElementById("tarjetas-mes-stats");
  var tarjetasMesPersonas = document.getElementById("tarjetas-mes-personas");
  var tarjetasCicloAvisos = document.getElementById("tarjetas-ciclo-avisos");
  var tarjetasAtrasadasAviso = document.getElementById("tarjetas-atrasadas-aviso");

  var deudasTarjetasResumenList = document.getElementById("deudas-tarjetas-resumen-list");
  var deudasTarjetasResumenEmpty = document.getElementById("deudas-tarjetas-resumen-empty");
  var deudasTarjetasResumenHint = document.getElementById("deudas-tarjetas-resumen-hint");

  var tarjetasArchivoList = document.getElementById("tarjetas-archivo-list");
  var tarjetasArchivoEmpty = document.getElementById("tarjetas-archivo-empty");
  var tarjetasArchivoRangeSelect = document.getElementById("tarjetas-archivo-range");

  // Mes de pago elegido a mano (null = el que corresponde hoy).
  var tarjetasMesSeleccionado = null;
  // Menús de compra abiertos ("compraId|mes") y tarjetas que el usuario
  // plegó a mano: sobreviven a los re-render de la pestaña.
  var cargoMenusAbiertos = new Set();
  var tarjetaBoxesPlegadas = new Set();
  var tarjetaBoxesAbiertasAntes = new Set();

  // =========================================================
  // Reembolsos de terceros pendientes de abonar al banco
  //
  // Plata que una persona ya me devolvió por una compra hecha con mi
  // tarjeta, pero que todavía no le pasé al banco (recibir el dinero no
  // significa que ya pagué la tarjeta). Se puede aplicar de a poco, así que
  // lo que importa es cuánto de CADA reembolso sigue sin aplicar.
  // =========================================================

  function montoAplicadoDeAbono(abono) {
    return Math.min(Number(abono.amount) || 0, Number(abono.aplicadoAlBancoMonto) || 0);
  }

  function montoPendienteDeAplicarDeAbono(abono) {
    return Math.max(0, (Number(abono.amount) || 0) - montoAplicadoDeAbono(abono));
  }

  function pendienteAplicarBanco(tarjetaId) {
    return Math.round(loadAbonos().filter(function (a) {
      return a.tipo === "me_deben" && a.aplicarATarjetaId === tarjetaId;
    }).reduce(function (sum, a) { return sum + montoPendienteDeAplicarDeAbono(a); }, 0));
  }

  // Mutación EN MEMORIA (no guarda): descuenta `monto` del cupo de
  // reembolsos de esta tarjeta, dentro del array de abonos ya cargado.
  // Devuelve de qué reembolso salió cuánto, para anotarlo en el abono de
  // tarjeta que los consume y poder devolverlo si ese abono se borra.
  function consumirPendienteAplicarBancoEnMemoria(abonos, tarjetaId, monto) {
    var restante = monto;
    var origenes = [];
    abonos.forEach(function (a) {
      if (restante <= 0) return;
      if (a.tipo !== "me_deben" || a.aplicarATarjetaId !== tarjetaId) return;
      var pend = montoPendienteDeAplicarDeAbono(a);
      if (pend <= 0) return;
      var tomar = Math.min(pend, restante);
      a.aplicadoAlBancoMonto = montoAplicadoDeAbono(a) + tomar;
      a.aplicadoAlBanco = montoPendienteDeAplicarDeAbono(a) <= 0;
      origenes.push({ id: a.id, monto: tomar });
      restante -= tomar;
    });
    return origenes;
  }

  // Al quitar un abono de tarjeta, la plata de reembolsos que había usado
  // vuelve a quedar "recibida, pendiente de abonar" (en memoria).
  function revertirOrigenesDeAbonoTarjeta(abonos, abonoTarjeta) {
    (abonoTarjeta.origenMontos || []).forEach(function (o) {
      var origen = abonos.find(function (a) { return a.id === o.id; });
      if (!origen) return;
      origen.aplicadoAlBancoMonto = Math.max(0, montoAplicadoDeAbono(origen) - (Number(o.monto) || 0));
      origen.aplicadoAlBanco = montoPendienteDeAplicarDeAbono(origen) <= 0;
    });
  }

  // =========================================================
  // Cargos y estados de cuenta
  // =========================================================

  // Primer estado de cuenta de una compra. Si es en cuotas y se anotó a
  // mano un primer vencimiento POSTERIOR (ej. "3 meses sin pagar" del
  // banco), se respeta; uno anterior al ciclo real se ignora, porque no
  // puede cobrarse antes de que la tarjeta cierre.
  function primerPeriodoKeyDeCompra(compra, tarjeta) {
    var key = periodoDeFecha(tarjeta, compra.fecha).key;
    if (compra.tipo === "cuotas" && compra.fechaPago) {
      var keyPago = monthKey(compra.fechaPago);
      if (keyPago > key) key = keyPago;
    }
    return key;
  }

  // Primer vencimiento de una compra en cuotas con tarjeta (usado por
  // buildCuotaSchedule para fechar las cuotas). Null si no se puede saber.
  function primerVencimientoDeCompraTarjeta(compra) {
    var tarjeta = compra.tarjetaId ? tarjetaById(compra.tarjetaId) : null;
    if (!tarjeta || !tieneCicloCompleto(tarjeta)) return null;
    return periodoPorKey(tarjeta, primerPeriodoKeyDeCompra(compra, tarjeta)).pagoIso;
  }

  function cargosDeCompra(compra, tarjeta) {
    var primerKey = primerPeriodoKeyDeCompra(compra, tarjeta);
    var n = compra.tipo === "cuotas" ? (Number(compra.cuotas) || 1) : 1;
    if (n <= 1) {
      return [{ compra: compra, periodoKey: primerKey, monto: Number(compra.monto) || 0, cuotaIndex: null, cuotasTotal: 1 }];
    }
    return buildCuotaSchedule(compra).map(function (cuota) {
      return {
        compra: compra, periodoKey: sumarMesesKey(primerKey, cuota.index),
        monto: cuota.amount, cuotaIndex: cuota.index, cuotasTotal: n
      };
    });
  }

  function abonoCubreCompra(abono, compraId) {
    return abono.compraId === compraId || (Array.isArray(abono.compraIds) && abono.compraIds.indexOf(compraId) !== -1);
  }

  function estadoVacio(tarjeta, key) {
    return {
      key: key, tarjeta: tarjeta, periodo: periodoPorKey(tarjeta, key),
      cargos: [], total: 0, cerradoAntes: 0, abonos: [], abonado: 0,
      cubierto: 0, pendiente: 0, pagadoTotal: 0
    };
  }

  // Todos los estados de cuenta de una tarjeta, del más antiguo al más
  // nuevo, con cuánto vence en cada uno y cuánto ya se pagó.
  function estadosDeCuentaTarjeta(tarjeta) {
    var porKey = {};
    function estado(key) {
      if (!porKey[key]) porKey[key] = estadoVacio(tarjeta, key);
      return porKey[key];
    }

    loadCompras().forEach(function (c) {
      if (c.tarjetaId !== tarjeta.id || esCargoFuturo(c)) return;
      cargosDeCompra(c, tarjeta).forEach(function (cargo) {
        var e = estado(cargo.periodoKey);
        e.cargos.push(cargo);
        e.total += cargo.monto;
        if (c.archivado) e.cerradoAntes += cargo.monto;
      });
    });

    var saldoCorridoAntiguo = 0;
    loadAbonos().forEach(function (a) {
      if (a.tipo !== "tarjeta" || a.tarjetaId !== tarjeta.id) return;
      if (a.periodo) {
        var e = estado(a.periodo);
        e.abonos.push(a);
        e.abonado += Number(a.amount) || 0;
      } else if (!a.archivado) {
        saldoCorridoAntiguo += Number(a.amount) || 0;
      }
      // Abonos archivados sin periodo: ya están reflejados en las compras
      // archivadas, que cuentan como pagadas.
    });

    var keys = Object.keys(porKey).sort();
    var arrastre = saldoCorridoAntiguo;
    keys.forEach(function (key) {
      var e = porKey[key];
      var neto = Math.max(0, e.total - e.cerradoAntes);
      var disponible = e.abonado + arrastre;
      e.cubierto = Math.min(neto, disponible);
      // Parte de lo cubierto que no vino de abonos de este mes, sino de
      // abonos antiguos o de lo pagado de más en meses anteriores.
      e.desdeArrastre = Math.round(Math.max(0, e.cubierto - e.abonado));
      arrastre = disponible - e.cubierto;
      e.pendiente = Math.max(0, Math.round(neto - e.cubierto));
      e.pagadoTotal = Math.round(e.cerradoAntes + e.cubierto);
      e.total = Math.round(e.total);
    });

    return { porKey: porKey, keys: keys, saldoAFavor: Math.round(arrastre) };
  }

  // Cache por render: estadosDeCuentaTarjeta lee todo el almacenamiento, y
  // una sola pantalla lo pide muchas veces.
  var cacheEstados = null;
  function estadosCacheados(tarjeta) {
    if (!cacheEstados) cacheEstados = {};
    if (!cacheEstados[tarjeta.id]) cacheEstados[tarjeta.id] = estadosDeCuentaTarjeta(tarjeta);
    return cacheEstados[tarjeta.id];
  }
  function invalidarCacheEstados() { cacheEstados = null; }

  function estadoDeCuenta(tarjeta, key) {
    return estadosCacheados(tarjeta).porKey[key] || estadoVacio(tarjeta, key);
  }

  function diasHasta(iso) {
    return daysBetweenDates(todayStamp(), iso);
  }

  function textoVence(iso) {
    var dias = diasHasta(iso);
    if (dias === 0) return "vence hoy";
    if (dias === 1) return "vence mañana";
    if (dias > 1) return "vence en " + dias + " días (" + formatDateDisplay(iso) + ")";
    return "venció el " + formatDateDisplay(iso);
  }

  // Situación de un estado de cuenta, en palabras.
  function situacionDe(e) {
    var hoy = todayStamp();
    if (e.total <= 0 && e.abonado <= 0) return { id: "vacio", texto: "Sin compras", clase: "neutral" };
    if (e.pendiente <= 0) return { id: "pagado", texto: "✅ Pagado", clase: "ok" };
    if (hoy > e.periodo.vencimientoIso) return { id: "vencido", texto: "⚠️ Vencido (" + formatDateDisplay(e.periodo.vencimientoIso) + ")", clase: "vencido" };
    if (hoy > e.periodo.cierreIso) {
      var aviso = e.tarjeta.diasAviso != null ? e.tarjeta.diasAviso : DEFAULT_DIAS_AVISO;
      return {
        id: "por-pagar",
        texto: "⏳ Por pagar · " + textoVence(e.periodo.vencimientoIso),
        clase: diasHasta(e.periodo.vencimientoIso) <= aviso ? "soon" : "pendiente"
      };
    }
    return { id: "en-curso", texto: "🛒 En curso · cierra el " + formatDateDisplay(e.periodo.cierreIso), clase: "curso" };
  }

  // =========================================================
  // Resumen de un mes de pago (todas mis tarjetas juntas)
  // =========================================================

  function resumenMesTarjetas(key) {
    var r = { key: key, total: 0, pagado: 0, pendiente: 0, estados: [], cargos: [] };
    misTarjetas().forEach(function (t) {
      var e = estadoDeCuenta(t, key);
      r.estados.push(e);
      r.total += e.total;
      r.pagado += e.pagadoTotal;
      r.pendiente += e.pendiente;
      e.cargos.forEach(function (cargo) { r.cargos.push({ cargo: cargo, estado: e }); });
    });
    return r;
  }

  function mesActualKey() {
    return monthKey(todayStamp());
  }

  // El mes que conviene mostrar al abrir: el de este mes; si ya está todo
  // pagado (o no hay nada), el siguiente — que es lo que viene por pagar.
  function mesPorDefecto() {
    var actual = mesActualKey();
    var r = resumenMesTarjetas(actual);
    if (r.pendiente <= 0) {
      var siguiente = sumarMesesKey(actual, 1);
      if (resumenMesTarjetas(siguiente).total > 0) return siguiente;
    }
    return actual;
  }

  function mesesDisponibles() {
    var set = {};
    var actual = mesActualKey();
    set[actual] = true;
    set[sumarMesesKey(actual, 1)] = true;
    misTarjetas().forEach(function (t) {
      estadosCacheados(t).keys.forEach(function (k) { set[k] = true; });
    });
    return Object.keys(set).sort();
  }

  function mesSeleccionado() {
    return tarjetasMesSeleccionado || mesPorDefecto();
  }

  // Estados de cuenta ya vencidos que siguen con saldo: típicamente meses
  // que se pagaron en la vida real pero nunca se marcaron en la app.
  function estadosAtrasados() {
    var lista = [];
    misTarjetas().forEach(function (t) {
      var info = estadosCacheados(t);
      info.keys.forEach(function (k) {
        var e = info.porKey[k];
        if (e.pendiente > 0 && situacionDe(e).id === "vencido") lista.push(e);
      });
    });
    return lista;
  }

  // =========================================================
  // Acciones
  // =========================================================

  function nuevoAbonoTarjeta(tarjetaId, periodoKey, monto, fecha, nota, extra) {
    return Object.assign({
      id: uid(), tipo: "tarjeta", tarjetaId: tarjetaId, periodo: periodoKey,
      amount: Math.round(monto), date: fecha || todayStamp(), note: nota || null, createdAt: Date.now()
    }, extra || {});
  }

  function despuesDeGuardarTarjetas(mensaje) {
    invalidarCacheEstados();
    renderAll();
    if (mensaje) showToast(mensaje);
  }

  // Paga lo que falta del estado de cuenta de ese mes (no archiva nada:
  // las compras siguen en su mes, solo que ya cubiertas).
  function markTarjetaPagada(tarjetaId, periodoKey) {
    var tarjeta = tarjetaById(tarjetaId);
    if (!tarjeta) return;
    var key = periodoKey || mesSeleccionado();
    var e = estadosDeCuentaTarjeta(tarjeta).porKey[key];
    if (!e || e.pendiente <= 0) {
      showToast("La deuda de " + mesLargo(key) + " de " + tarjeta.nombre + " ya está pagada.");
      return;
    }
    pedirConfirmacionPago(
      "Se registrará un pago de " + formatCurrency(e.pendiente) + " a " + tarjetaLabel(tarjetaId) +
        " y la deuda de " + mesLargo(key) + " quedará pagada.",
      function () {
        var abonos = loadAbonos();
        abonos.push(nuevoAbonoTarjeta(tarjetaId, key, e.pendiente, todayStamp(), "Pago de la deuda de " + mesLargo(key)));
        if (saveAbonos(abonos)) despuesDeGuardarTarjetas("Deuda de " + mesLargo(key) + " marcada como pagada.");
      }
    );
  }

  // Marca como pagados, de una vez, todos los meses ya vencidos que
  // quedaron con saldo (para ponerse al día con datos antiguos).
  function marcarAtrasadosPagados() {
    var atrasados = estadosAtrasados();
    if (atrasados.length === 0) return;
    var total = atrasados.reduce(function (sum, e) { return sum + e.pendiente; }, 0);
    pedirConfirmacionPago(
      "Se registrarán como pagados " + atrasados.length + (atrasados.length === 1 ? " estado de cuenta vencido" : " estados de cuenta vencidos") +
        " por un total de " + formatCurrency(total) + ". Úsalo si esos meses ya los pagaste en el banco.",
      function () {
        var abonos = loadAbonos();
        atrasados.forEach(function (e) {
          abonos.push(nuevoAbonoTarjeta(e.tarjeta.id, e.key, e.pendiente, e.periodo.vencimientoIso,
            "Pago de la deuda de " + mesLargo(e.key) + " (marcado al ponerse al día)"));
        });
        if (saveAbonos(abonos)) despuesDeGuardarTarjetas("Meses anteriores marcados como pagados.");
      }
    );
  }

  // Abono a un estado de cuenta. Si se indican compras, quedan marcadas
  // como abonadas. `montoDesdeReembolsos` es la parte de esas compras que
  // la persona ya te había devuelto: se descuenta del cupo de "reembolsos
  // por abonar" de la tarjeta, para que esa misma plata no se aplique dos
  // veces (y para no gastar reembolsos de otros en una compra tuya).
  function registrarAbonoTarjeta(tarjetaId, periodoKey, amount, date, note, compraIds, montoDesdeReembolsos) {
    var abonos = loadAbonos();
    var ids = (compraIds || []).slice();
    var desdeReembolsos = Math.min(Number(montoDesdeReembolsos) || 0, amount);
    var origenes = desdeReembolsos > 0 ? consumirPendienteAplicarBancoEnMemoria(abonos, tarjetaId, desdeReembolsos) : [];
    var extra = { origenMontos: origenes, origenReembolsos: origenes.map(function (o) { return o.id; }) };
    if (ids.length === 1) extra.compraId = ids[0];
    else if (ids.length > 1) extra.compraIds = ids;
    abonos.push(nuevoAbonoTarjeta(tarjetaId, periodoKey, amount, date, note, extra));
    if (saveAbonos(abonos)) despuesDeGuardarTarjetas("Abono a la deuda de " + mesLargo(periodoKey) + " registrado.");
  }

  function cargoFueDevuelto(cargo) {
    return !!cargo.compra.pagada && esMeDeben(cargo.compra);
  }

  function marcarCargoAbonado(cargo, tarjetaId) {
    registrarAbonoTarjeta(tarjetaId, cargo.periodoKey, cargo.monto, todayStamp(),
      "Abono de: " + compraDisplayName(cargo.compra) + (cargo.cuotaIndex !== null ? " (cuota " + (cargo.cuotaIndex + 1) + "/" + cargo.cuotasTotal + ")" : ""),
      [cargo.compra.id], cargoFueDevuelto(cargo) ? cargo.monto : 0);
  }

  // Quitar la marca de "abonada" es borrar el abono que la generó (si ese
  // abono cubría varias compras, se descuenta solo la parte de esta).
  function quitarAbonoDeCompra(abonoId, compraId, montoCargo) {
    var abonos = loadAbonos();
    var idx = abonos.findIndex(function (a) { return a.id === abonoId; });
    if (idx === -1) return;
    var abono = abonos[idx];
    if (Array.isArray(abono.compraIds) && abono.compraIds.length > 1) {
      abono.compraIds = abono.compraIds.filter(function (id) { return id !== compraId; });
      abono.amount = Math.max(0, (Number(abono.amount) || 0) - montoCargo);
      if (abono.amount <= 0) abonos.splice(idx, 1);
    } else {
      revertirOrigenesDeAbonoTarjeta(abonos, abono);
      abonos.splice(idx, 1);
    }
    if (saveAbonos(abonos)) despuesDeGuardarTarjetas("Abono quitado. La compra vuelve a quedar por pagar.");
  }

  function aplicarReembolsosABanco(tarjetaId, periodoKey, montoSolicitado) {
    var totalPendiente = pendienteAplicarBanco(tarjetaId);
    if (totalPendiente <= 0) return;
    var monto = Math.min(Math.max(0, Math.round(Number(montoSolicitado) || totalPendiente)), totalPendiente);
    if (monto <= 0) {
      showToast("Ingresa un monto válido.");
      return;
    }
    pedirConfirmacionPago(
      "Se abonarán " + formatCurrency(monto) + " de reembolsos ya recibidos a la deuda de " + mesLargo(periodoKey) +
        " de " + tarjetaLabel(tarjetaId) + "." + (monto < totalPendiente ? " El resto queda pendiente para después." : ""),
      function () {
        var abonos = loadAbonos();
        var origenes = consumirPendienteAplicarBancoEnMemoria(abonos, tarjetaId, monto);
        abonos.push(nuevoAbonoTarjeta(tarjetaId, periodoKey, monto, todayStamp(), "Reembolsos de terceros abonados al banco", {
          origenMontos: origenes, origenReembolsos: origenes.map(function (o) { return o.id; })
        }));
        if (saveAbonos(abonos)) despuesDeGuardarTarjetas(formatCurrency(monto) + " abonados a la deuda de " + mesLargo(periodoKey) + ".");
      }
    );
  }

  // =========================================================
  // UI — selector de mes, estadísticas y personas
  // =========================================================

  function etiquetaMes(key) {
    var actual = mesActualKey();
    var sufijo = key === actual ? " · este mes" : (key === sumarMesesKey(actual, 1) ? " · próximo mes" : "");
    return "Deuda de " + monthLabel(key).toLowerCase() + sufijo;
  }

  function renderMesNav(key) {
    tarjetasMesSelect.innerHTML = "";
    mesesDisponibles().forEach(function (k) {
      var opt = document.createElement("option");
      opt.value = k;
      opt.textContent = etiquetaMes(k);
      tarjetasMesSelect.appendChild(opt);
    });
    tarjetasMesSelect.value = key;

    var actual = mesActualKey();
    tarjetasMesHint.textContent = key < actual
      ? "Estás viendo un mes pasado."
      : key === actual
        ? "Lo que vence este mes en tus tarjetas: compras del periodo que ya cerró (o está por cerrar) y la cuota del mes de cada compra en cuotas."
        : "Lo que se está acumulando para pagar en " + mesLargo(key) + ": compras hechas después del último cierre.";
  }

  function crearStatCard(label, valor, sub, clase) {
    var card = document.createElement("div");
    card.className = "card" + (clase ? " " + clase : "");
    var l = document.createElement("span");
    l.className = "card-label";
    l.textContent = label;
    var v = document.createElement("span");
    v.className = "card-value";
    v.textContent = valor;
    card.appendChild(l);
    card.appendChild(v);
    if (sub) {
      var s = document.createElement("span");
      s.className = "card-sublabel";
      s.textContent = sub;
      card.appendChild(s);
    }
    return card;
  }

  function renderMesStats(r) {
    tarjetasMesStats.innerHTML = "";
    var mes = mesLargo(r.key);

    // El próximo vencimiento con saldo, para decir "hasta cuándo".
    var conSaldo = r.estados.filter(function (e) { return e.pendiente > 0; })
      .sort(function (a, b) { return a.periodo.vencimientoIso.localeCompare(b.periodo.vencimientoIso); });
    var subFalta = "";
    var claseFalta = "card-ok";
    if (r.total <= 0) {
      subFalta = "Sin compras para este mes";
    } else if (conSaldo.length === 0) {
      subFalta = "✅ Todo pagado";
    } else {
      var sit = situacionDe(conSaldo[0]);
      subFalta = sit.id === "en-curso" ? "Aún se está acumulando (cierra el " + formatDateDisplay(conSaldo[0].periodo.cierreIso) + ")" : sit.texto.replace(/^[^ ]+ /, "");
      claseFalta = sit.id === "vencido" ? "card-alerta" : (sit.id === "en-curso" ? "" : "card-pendiente");
    }

    tarjetasMesStats.appendChild(crearStatCard("💳 Deuda de " + mes, formatCurrency(r.total),
      r.estados.filter(function (e) { return e.total > 0; }).length + " tarjeta(s) con compras"));
    tarjetasMesStats.appendChild(crearStatCard("✅ Ya pagado / abonado", formatCurrency(r.pagado), ""));
    tarjetasMesStats.appendChild(crearStatCard("⏳ Falta pagar", formatCurrency(r.pendiente), subFalta, claseFalta));
  }

  // Compras del mes agrupadas por quién las hizo.
  function renderMesPersonas(r) {
    tarjetasMesPersonas.innerHTML = "";
    var grupos = {};
    var orden = [];
    r.cargos.forEach(function (item) {
      var c = item.cargo.compra;
      var key = compradorKey(c);
      if (!grupos[key]) {
        grupos[key] = { key: key, nombre: compradorNombre(c), total: 0, items: [] };
        orden.push(key);
      }
      grupos[key].total += item.cargo.monto;
      grupos[key].items.push(item);
    });

    if (orden.length === 0) {
      var vacio = document.createElement("p");
      vacio.className = "empty-state";
      vacio.textContent = "No hay compras con tus tarjetas en este mes.";
      tarjetasMesPersonas.appendChild(vacio);
      return;
    }

    // "Yo" primero (es lo que sale de tu bolsillo), el resto de mayor a menor.
    orden.sort(function (a, b) {
      if (a === YO.id) return -1;
      if (b === YO.id) return 1;
      return grupos[b].total - grupos[a].total;
    }).forEach(function (key) {
      var g = grupos[key];
      var card = document.createElement("details");
      card.className = "persona-mes-card" + (key === YO.id ? " persona-mes-yo" : "");
      card.dataset.key = "tarjetas-persona::" + key;

      var head = document.createElement("summary");
      var nombre = document.createElement("span");
      nombre.className = "persona-mes-nombre";
      nombre.textContent = key === YO.id ? "🙋 Yo" : "🧑 " + g.nombre;
      var monto = document.createElement("span");
      monto.className = "persona-mes-monto";
      monto.textContent = formatCurrency(g.total);
      var cant = document.createElement("span");
      cant.className = "persona-mes-cant";
      cant.textContent = g.items.length + (g.items.length === 1 ? " compra" : " compras") + (key === YO.id ? (g.items.length === 1 ? " tuya" : " tuyas") : "");
      head.appendChild(nombre);
      head.appendChild(monto);
      head.appendChild(cant);
      card.appendChild(head);

      var body = document.createElement("div");
      body.className = "persona-mes-body";
      g.items.slice().sort(function (a, b) { return b.cargo.monto - a.cargo.monto; }).forEach(function (item) {
        var fila = document.createElement("div");
        fila.className = "persona-mes-fila";
        var desc = document.createElement("span");
        var c = item.cargo.compra;
        desc.textContent = compraDisplayName(c) +
          (item.cargo.cuotaIndex !== null ? " (cuota " + (item.cargo.cuotaIndex + 1) + "/" + item.cargo.cuotasTotal + ")" : "") +
          " · " + item.estado.tarjeta.nombre;
        var val = document.createElement("strong");
        val.textContent = formatCurrency(item.cargo.monto);
        fila.appendChild(desc);
        fila.appendChild(val);
        body.appendChild(fila);
      });
      card.appendChild(body);
      tarjetasMesPersonas.appendChild(card);
    });
  }

  function renderAvisosCiclo() {
    tarjetasCicloAvisos.innerHTML = "";
    misTarjetas().forEach(function (t) {
      var faltan = datosCicloFaltantes(t);
      if (faltan.length === 0) return;
      var aviso = document.createElement("div");
      aviso.className = "app-alert aviso-ciclo";
      var texto = document.createElement("span");
      texto.className = "app-alert-text";
      texto.textContent = "⚠️ " + tarjetaLabel(t.id) + ": falta el " + faltan.join(" y el ") +
        ". Mientras tanto se calcula por mes calendario (aproximado), y puede que el mes no calce con tu estado de cuenta.";
      aviso.appendChild(texto);
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn-secondary btn-small";
      btn.textContent = "Completar datos";
      btn.addEventListener("click", function () { startEditTarjeta(t.id); });
      aviso.appendChild(btn);
      tarjetasCicloAvisos.appendChild(aviso);
    });
  }

  function renderAvisoAtrasados() {
    tarjetasAtrasadasAviso.innerHTML = "";
    var atrasados = estadosAtrasados();
    if (atrasados.length === 0) return;
    var total = atrasados.reduce(function (sum, e) { return sum + e.pendiente; }, 0);
    var aviso = document.createElement("div");
    aviso.className = "app-alert aviso-atrasados";
    var texto = document.createElement("span");
    texto.className = "app-alert-text";
    texto.textContent = "🔔 Hay meses ya vencidos que siguen con saldo en la app (" +
      atrasados.map(function (e) { return e.tarjeta.nombre + " · " + mesLargo(e.key) + " " + formatCurrency(e.pendiente); }).join(", ") +
      "). Si ya los pagaste en el banco, márcalos como pagados para que no se mezclen con este mes.";
    aviso.appendChild(texto);
    var acciones = document.createElement("div");
    acciones.className = "aviso-acciones";
    var verBtn = document.createElement("button");
    verBtn.type = "button";
    verBtn.className = "btn btn-outline btn-small";
    verBtn.textContent = "Ver " + mesLargo(atrasados[0].key);
    verBtn.addEventListener("click", function () { tarjetasMesSeleccionado = atrasados[0].key; renderDeudaTarjetas(); });
    var todoBtn = document.createElement("button");
    todoBtn.type = "button";
    todoBtn.className = "btn btn-secondary btn-small";
    todoBtn.textContent = "Marcar todo eso como pagado (" + formatCurrency(total) + ")";
    todoBtn.addEventListener("click", marcarAtrasadosPagados);
    acciones.appendChild(verBtn);
    acciones.appendChild(todoBtn);
    aviso.appendChild(acciones);
    tarjetasAtrasadasAviso.appendChild(aviso);
  }

  // =========================================================
  // UI — estado de cuenta de cada tarjeta
  // =========================================================

  // Cómo está una compra dentro de su estado de cuenta.
  function situacionCargo(cargo, e) {
    var c = cargo.compra;
    var abonoPropio = e.abonos.find(function (a) { return abonoCubreCompra(a, c.id); }) || null;
    if (c.archivado) return { id: "pagada", texto: "✅ Pagada", clase: "ok", abono: null };
    if (abonoPropio || c.aplicadoABanco) return { id: "abonada", texto: "✅ Abonada", clase: "ok", abono: abonoPropio };
    if (e.pendiente <= 0) return { id: "pagada", texto: "✅ Pagada", clase: "ok", abono: null };
    if (c.pagada && esMeDeben(c)) return { id: "devuelta", texto: "💵 Te la devolvieron · falta abonar", clase: "aviso", abono: null };
    return { id: "por-pagar", texto: "⏳ Por pagar", clase: "pendiente", abono: null };
  }

  function celda(clase, etiqueta, contenido) {
    var div = document.createElement("div");
    div.className = "cargo-celda " + clase;
    if (etiqueta) div.dataset.label = etiqueta;
    if (contenido instanceof Node) div.appendChild(contenido);
    else div.textContent = contenido;
    return div;
  }

  function buildCargosHeader() {
    var head = document.createElement("div");
    head.className = "cargo-row cargo-row-head";
    ["Fecha", "Qué se compró", "Compró", "A quién se le debe", "Tarjeta", "Monto", "Estado"].forEach(function (t, i) {
      var d = document.createElement("div");
      d.className = "cargo-celda" + (i === 5 ? " cargo-monto" : "");
      d.textContent = t;
      head.appendChild(d);
    });
    return head;
  }

  // "A quién se le debe" visto desde la tarjeta: el banco siempre cobra a
  // la dueña de la tarjeta (tú); esto dice si además alguien te debe a ti
  // esa compra, o si tú se la debes a alguien.
  function deudaVistaTarjeta(c) {
    if (esMeDeben(c)) return "A mí (" + deudorNombre(deudorKey(c)) + " me debe)";
    if (esDeudaMia(c)) return "A " + personaNombre(c.acreedor);
    return "Nadie (gasto propio)";
  }

  function buildCargoRow(cargo, e) {
    var c = cargo.compra;
    var sit = situacionCargo(cargo, e);
    var menuKey = c.id + "|" + cargo.periodoKey;

    var wrap = document.createElement("div");
    wrap.className = "cargo-item";

    var row = document.createElement("div");
    row.className = "cargo-row cargo-" + sit.id;
    row.tabIndex = 0;
    row.setAttribute("role", "button");
    row.setAttribute("aria-expanded", String(cargoMenusAbiertos.has(menuKey)));
    row.title = "Toca para ver opciones";

    var descWrap = document.createElement("div");
    var descTexto = document.createElement("span");
    descTexto.className = "cargo-desc-texto";
    descTexto.textContent = compraDisplayName(c);
    descWrap.appendChild(descTexto);
    if (cargo.cuotaIndex !== null) {
      var cuotaTag = document.createElement("span");
      cuotaTag.className = "cargo-cuota-tag";
      cuotaTag.textContent = "Cuota " + (cargo.cuotaIndex + 1) + "/" + cargo.cuotasTotal + " · total " + formatCurrency(c.monto);
      descWrap.appendChild(cuotaTag);
    }
    if (c.compartidaId) {
      var compTag = document.createElement("span");
      compTag.className = "cargo-cuota-tag";
      compTag.textContent = "🤝 Compartida entre: " + compartidaParticipantesTexto(c);
      descWrap.appendChild(compTag);
    }

    var estadoBadge = document.createElement("span");
    estadoBadge.className = "cargo-estado-badge " + sit.clase;
    estadoBadge.textContent = sit.texto;
    var estadoWrap = document.createElement("div");
    estadoWrap.className = "cargo-estado-wrap";
    estadoWrap.appendChild(estadoBadge);
    var flecha = document.createElement("span");
    flecha.className = "cargo-flecha";
    flecha.textContent = cargoMenusAbiertos.has(menuKey) ? "▴" : "▾";
    estadoWrap.appendChild(flecha);

    row.appendChild(celda("cargo-fecha", "Fecha", formatDateDisplay(c.fecha)));
    row.appendChild(celda("cargo-desc", "", descWrap));
    row.appendChild(celda("cargo-comprador", "Compró", compradorNombre(c)));
    row.appendChild(celda("cargo-deuda", "Se le debe a", deudaVistaTarjeta(c)));
    row.appendChild(celda("cargo-tarjeta", "Tarjeta", e.tarjeta.nombre));
    row.appendChild(celda("cargo-monto", "", formatCurrency(cargo.monto)));
    row.appendChild(celda("cargo-estado", "", estadoWrap));
    wrap.appendChild(row);

    var menu = document.createElement("div");
    menu.className = "cargo-menu" + (cargoMenusAbiertos.has(menuKey) ? "" : " hidden");

    function opcion(texto, clase, fn) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "btn btn-small " + clase;
      b.textContent = texto;
      b.addEventListener("click", function (ev) { ev.stopPropagation(); fn(); });
      menu.appendChild(b);
    }

    if (sit.id === "por-pagar" || sit.id === "devuelta") {
      opcion("💳 Ya la aboné a la tarjeta (" + formatCurrency(cargo.monto) + ")", "btn-primary", function () { marcarCargoAbonado(cargo, e.tarjeta.id); });
    }
    if (sit.id === "abonada" && sit.abono) {
      opcion("↩️ Quitar abono", "btn-secondary", function () { quitarAbonoDeCompra(sit.abono.id, c.id, cargo.monto); });
    }
    if (esMeDeben(c)) {
      opcion(c.pagada ? "↩️ Quitar \"me la devolvieron\"" : "💵 " + deudorNombre(deudorKey(c)) + " ya me la devolvió", "btn-secondary",
        function () { toggleCompraPagada(c.id); });
    }
    opcion("✏️ Editar compra", "btn-outline", function () { startEditCompra(c.id); });

    var ayuda = document.createElement("span");
    ayuda.className = "cargo-menu-ayuda";
    ayuda.textContent = sit.id === "devuelta"
      ? "Ya tienes esta plata: falta pasarla al banco."
      : "\"Abonada\" = ya pagaste esta compra al banco, aunque la deuda del mes no esté completa.";
    menu.appendChild(ayuda);
    wrap.appendChild(menu);

    function toggleMenu() {
      var abrir = menu.classList.contains("hidden");
      menu.classList.toggle("hidden", !abrir);
      flecha.textContent = abrir ? "▴" : "▾";
      row.setAttribute("aria-expanded", String(abrir));
      if (abrir) cargoMenusAbiertos.add(menuKey); else cargoMenusAbiertos.delete(menuKey);
    }
    row.addEventListener("click", toggleMenu);
    row.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); toggleMenu(); }
    });

    return wrap;
  }

  // Formulario para abonar a un estado de cuenta, con la opción de marcar a
  // qué compras corresponde (avisa si el monto no calza con lo marcado).
  function buildAbonoTarjetaForm(tarjeta, keyInicial) {
    var wrap = document.createElement("div");
    wrap.className = "deuda-payment-form abono-tarjeta-form hidden";

    var periodoSelect = document.createElement("select");
    periodoSelect.className = "deuda-payment-card-select";
    var opciones = {};
    [keyInicial, periodoCerradoMasReciente(tarjeta).key, periodoEnCurso(tarjeta).key, sumarMesesKey(periodoEnCurso(tarjeta).key, 1)]
      .forEach(function (k) { opciones[k] = true; });
    Object.keys(opciones).sort().forEach(function (k) {
      var e = estadoDeCuenta(tarjeta, k);
      var opt = document.createElement("option");
      opt.value = k;
      opt.textContent = "A la deuda de " + mesLargo(k) + (e.pendiente > 0 ? " (falta " + formatCurrency(e.pendiente) + ")" : " (pagada)");
      periodoSelect.appendChild(opt);
    });
    periodoSelect.value = keyInicial;

    var amountInput = document.createElement("input");
    amountInput.type = "number";
    amountInput.min = "0";
    amountInput.step = "1";
    amountInput.placeholder = "Monto abonado";
    amountInput.className = "deuda-payment-amount";

    var dateInput = document.createElement("input");
    dateInput.type = "date";
    dateInput.value = todayStamp();
    dateInput.className = "deuda-payment-date";

    var noteInput = document.createElement("input");
    noteInput.type = "text";
    noteInput.placeholder = "Nota (opcional)";
    noteInput.className = "deuda-payment-note";

    var picker = document.createElement("div");
    picker.className = "abono-compras-picker";
    var diffHint = document.createElement("p");
    diffHint.className = "deuda-payment-diff-hint hidden";
    var checks = [];
    var montoAutomatico = true;

    function actualizarDiff() {
      var sel = checks.filter(function (ch) { return ch.input.checked; });
      var suma = sel.reduce(function (s, ch) { return s + ch.cargo.monto; }, 0);
      if (montoAutomatico && sel.length > 0) amountInput.value = String(Math.round(suma));
      var monto = Number(amountInput.value) || 0;
      var mostrar = sel.length > 0 && monto > 0 && Math.round(monto) !== Math.round(suma);
      diffHint.classList.toggle("hidden", !mostrar);
      if (mostrar) {
        diffHint.textContent = "⚠️ Las compras marcadas suman " + formatCurrency(suma) + " y el abono es de " + formatCurrency(monto) +
          " (" + (monto > suma ? "sobran " : "faltan ") + formatCurrency(Math.abs(monto - suma)) + ").";
      }
    }

    function renderPicker() {
      picker.innerHTML = "";
      checks = [];
      var e = estadoDeCuenta(tarjeta, periodoSelect.value);
      var candidatos = e.cargos.filter(function (cargo) {
        var id = situacionCargo(cargo, e).id;
        return id === "por-pagar" || id === "devuelta";
      });
      if (candidatos.length === 0) return;
      var titulo = document.createElement("span");
      titulo.className = "abono-compras-picker-title";
      titulo.textContent = "¿A qué compras corresponde? (opcional — quedan marcadas como abonadas)";
      picker.appendChild(titulo);
      candidatos.forEach(function (cargo) {
        var label = document.createElement("label");
        label.className = "abono-compra-check";
        var input = document.createElement("input");
        input.type = "checkbox";
        input.addEventListener("change", actualizarDiff);
        var texto = document.createElement("span");
        texto.textContent = compraDisplayName(cargo.compra) +
          (cargo.cuotaIndex !== null ? " (cuota " + (cargo.cuotaIndex + 1) + "/" + cargo.cuotasTotal + ")" : "") +
          " · " + compradorNombre(cargo.compra) + " · " + formatCurrency(cargo.monto);
        label.appendChild(input);
        label.appendChild(texto);
        picker.appendChild(label);
        checks.push({ input: input, cargo: cargo });
      });
    }

    amountInput.addEventListener("input", function () { montoAutomatico = amountInput.value === ""; actualizarDiff(); });
    periodoSelect.addEventListener("change", function () { renderPicker(); actualizarDiff(); });

    var saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "btn btn-primary btn-small";
    saveBtn.textContent = "Guardar abono";
    saveBtn.addEventListener("click", function () {
      var amount = Math.round(Number(amountInput.value));
      if (!amount || amount <= 0) { showToast("Ingresa un monto válido."); return; }
      var sel = checks.filter(function (ch) { return ch.input.checked; });
      var desdeReembolsos = sel.filter(function (ch) { return cargoFueDevuelto(ch.cargo); })
        .reduce(function (s, ch) { return s + ch.cargo.monto; }, 0);
      var nota = noteInput.value.trim() ||
        (sel.length > 0 ? "Abono de: " + sel.map(function (ch) { return compraDisplayName(ch.cargo.compra); }).join(", ") : "Abono manual");
      registrarAbonoTarjeta(tarjeta.id, periodoSelect.value, amount, dateInput.value || todayStamp(), nota,
        sel.map(function (ch) { return ch.cargo.compra.id; }), desdeReembolsos);
    });

    wrap.appendChild(periodoSelect);
    wrap.appendChild(amountInput);
    wrap.appendChild(dateInput);
    wrap.appendChild(noteInput);
    wrap.appendChild(saveBtn);
    wrap.appendChild(picker);
    wrap.appendChild(diffHint);
    renderPicker();
    return wrap;
  }

  function buildMiniStat(label, valor, clase) {
    var d = document.createElement("div");
    d.className = "tarjeta-mes-stat" + (clase ? " " + clase : "");
    var l = document.createElement("span");
    l.className = "tarjeta-mes-stat-label";
    l.textContent = label;
    var v = document.createElement("span");
    v.className = "tarjeta-mes-stat-value";
    v.textContent = formatCurrency(valor);
    d.appendChild(l);
    d.appendChild(v);
    return d;
  }

  function buildTarjetaMesBox(tarjeta, key) {
    var e = estadoDeCuenta(tarjeta, key);
    var sit = situacionDe(e);
    var boxKey = "tarjeta-mes::" + tarjeta.id;

    var box = document.createElement("details");
    box.className = "tarjeta-mes-box situacion-" + sit.id;
    box.dataset.boxKey = boxKey;
    // Abierta si tiene algo por pagar (las ya pagadas se pliegan para no
    // estorbar), salvo que la hayas cerrado a mano; y si estaba abierta
    // antes de este render, sigue abierta aunque recién haya quedado pagada.
    box.open = tarjetaBoxesAbiertasAntes.has(boxKey) ||
      (e.pendiente > 0 && !tarjetaBoxesPlegadas.has(boxKey));
    box.addEventListener("toggle", function () {
      if (box.open) tarjetaBoxesPlegadas.delete(boxKey); else tarjetaBoxesPlegadas.add(boxKey);
    });

    // --- Encabezado (visible aunque esté plegada) ---
    var head = document.createElement("summary");
    head.className = "tarjeta-mes-head";
    var titulo = document.createElement("div");
    titulo.className = "tarjeta-mes-titulo";
    var nombre = document.createElement("span");
    nombre.className = "tarjeta-nombre";
    nombre.textContent = "💳 " + tarjeta.nombre + (tarjeta.ultimos4 ? " •••• " + tarjeta.ultimos4 : "");
    var badge = document.createElement("span");
    badge.className = "situacion-badge " + sit.clase;
    badge.textContent = sit.texto;
    titulo.appendChild(nombre);
    titulo.appendChild(badge);
    head.appendChild(titulo);

    var periodoTxt = document.createElement("div");
    periodoTxt.className = "tarjeta-mes-periodo";
    periodoTxt.textContent = (e.periodo.aproximado ? "≈ " : "") + "Compras del " + formatDateDisplay(e.periodo.inicioIso) +
      " al " + formatDateDisplay(e.periodo.cierreIso) +
      (e.periodo.pagoIso ? " · se paga el " + formatDateDisplay(e.periodo.pagoIso) : " · se paga en " + mesLargo(key));
    head.appendChild(periodoTxt);

    var stats = document.createElement("div");
    stats.className = "tarjeta-mes-stats";
    stats.appendChild(buildMiniStat("Deuda de " + mesLargo(key), e.total, ""));
    stats.appendChild(buildMiniStat("Ya pagado / abonado", e.pagadoTotal, "ok"));
    stats.appendChild(buildMiniStat("Falta pagar", e.pendiente, e.pendiente > 0 ? "pendiente" : "ok"));
    head.appendChild(stats);
    box.appendChild(head);

    var body = document.createElement("div");
    body.className = "tarjeta-mes-body";

    if (e.periodo.aproximado) {
      var aprox = document.createElement("p");
      aprox.className = "deuda-card-nota aviso";
      aprox.textContent = "⚠️ Falta el " + datosCicloFaltantes(tarjeta).join(" y el ") +
        " de esta tarjeta: el periodo es aproximado (mes calendario).";
      body.appendChild(aprox);
    }

    // Reembolsos ya recibidos que todavía no pasan al banco.
    var pendienteAplicar = pendienteAplicarBanco(tarjeta.id);
    if (pendienteAplicar > 0) {
      var callout = document.createElement("div");
      callout.className = "app-alert reembolsos-callout";
      var calloutText = document.createElement("span");
      calloutText.className = "app-alert-text";
      calloutText.textContent = "💰 Te devolvieron " + formatCurrency(pendienteAplicar) +
        " por compras de esta tarjeta que aún no abonas al banco. ¿Cuánto de eso ya abonaste?";
      callout.appendChild(calloutText);
      var accion = document.createElement("div");
      accion.className = "app-alert-aplicar-accion";
      var montoInput = document.createElement("input");
      montoInput.type = "number";
      montoInput.className = "app-alert-amount";
      montoInput.min = "0";
      montoInput.step = "1";
      montoInput.max = String(pendienteAplicar);
      montoInput.value = String(pendienteAplicar);
      accion.appendChild(montoInput);
      var aplicarBtn = document.createElement("button");
      aplicarBtn.type = "button";
      aplicarBtn.className = "btn btn-secondary btn-small";
      aplicarBtn.textContent = "Abonar a la deuda de " + mesLargo(key);
      aplicarBtn.addEventListener("click", function () { aplicarReembolsosABanco(tarjeta.id, key, montoInput.value); });
      accion.appendChild(aplicarBtn);
      callout.appendChild(accion);
      body.appendChild(callout);
    }

    var actions = document.createElement("div");
    actions.className = "tarjeta-card-actions";
    if (e.pendiente > 0) {
      var pagarBtn = document.createElement("button");
      pagarBtn.type = "button";
      pagarBtn.className = "btn btn-primary btn-small";
      pagarBtn.textContent = "✅ Marcar deuda de " + mesLargo(key) + " como pagada";
      pagarBtn.addEventListener("click", function () { markTarjetaPagada(tarjeta.id, key); });
      actions.appendChild(pagarBtn);
    }
    var abonoForm = buildAbonoTarjetaForm(tarjeta, key);
    var abonoBtn = document.createElement("button");
    abonoBtn.type = "button";
    abonoBtn.className = "btn btn-secondary btn-small";
    abonoBtn.textContent = "➕ Registrar abono";
    abonoBtn.addEventListener("click", function () { abonoForm.classList.toggle("hidden"); });
    actions.appendChild(abonoBtn);
    body.appendChild(actions);
    body.appendChild(abonoForm);

    if (e.cargos.length > 0) {
      var subt = document.createElement("div");
      subt.className = "cuota-subtitle";
      subt.textContent = "🧾 Compras de este estado de cuenta (" + e.cargos.length + ")";
      body.appendChild(subt);

      var lista = document.createElement("div");
      lista.className = "cargos-lista";
      lista.appendChild(buildCargosHeader());
      e.cargos.slice().sort(function (a, b) { return String(b.compra.fecha).localeCompare(String(a.compra.fecha)); })
        .forEach(function (cargo) { lista.appendChild(buildCargoRow(cargo, e)); });
      body.appendChild(lista);
    } else {
      var sin = document.createElement("p");
      sin.className = "empty-state";
      sin.textContent = "Sin compras con esta tarjeta en la deuda de " + mesLargo(key) + ".";
      body.appendChild(sin);
    }

    if (e.abonos.length > 0 || e.desdeArrastre > 0) {
      var abonosTitle = document.createElement("div");
      abonosTitle.className = "cuota-subtitle";
      abonosTitle.textContent = "💸 Pagos y abonos a esta deuda";
      body.appendChild(abonosTitle);
      e.abonos.slice().sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); })
        .forEach(function (a) { body.appendChild(buildAbonoRow(a)); });
      if (e.desdeArrastre > 0) {
        var arrastreNota = document.createElement("p");
        arrastreNota.className = "deuda-card-nota";
        arrastreNota.textContent = "💡 Incluye " + formatCurrency(e.desdeArrastre) +
          " de abonos anteriores a este sistema por meses, o pagados de más en un mes anterior (saldo a favor).";
        body.appendChild(arrastreNota);
      }
    }

    box.appendChild(body);
    return box;
  }

  // =========================================================
  // Render principal de la pestaña
  // =========================================================

  function renderDeudaTarjetas() {
    invalidarCacheEstados();
    var key = mesSeleccionado();
    var scrollY = window.scrollY;
    var personasAbiertas = new Set();
    tarjetasMesPersonas.querySelectorAll("details[open]").forEach(function (d) { personasAbiertas.add(d.dataset.key); });

    renderMesNav(key);
    renderAvisosCiclo();
    renderAvisoAtrasados();

    var r = resumenMesTarjetas(key);
    renderMesStats(r);
    renderMesPersonas(r);
    tarjetasMesPersonas.querySelectorAll("details").forEach(function (d) {
      if (personasAbiertas.has(d.dataset.key)) d.open = true;
    });

    var tarjetas = misTarjetas().slice().sort(function (a, b) {
      return estadoDeCuenta(b, key).pendiente - estadoDeCuenta(a, key).pendiente ||
        estadoDeCuenta(b, key).total - estadoDeCuenta(a, key).total;
    });
    tarjetasDeudaEmptyState.classList.toggle("hidden", tarjetas.length !== 0);
    tarjetaBoxesAbiertasAntes = new Set();
    tarjetasDeudaList.querySelectorAll(".tarjeta-mes-box[open]").forEach(function (b) {
      tarjetaBoxesAbiertasAntes.add(b.dataset.boxKey);
    });
    tarjetasDeudaList.innerHTML = "";
    tarjetas.forEach(function (t) { tarjetasDeudaList.appendChild(buildTarjetaMesBox(t, key)); });

    renderArchivoTarjetas();
    window.scrollTo(0, scrollY);
  }

  tarjetasMesSelect.addEventListener("change", function () {
    tarjetasMesSeleccionado = tarjetasMesSelect.value;
    renderDeudaTarjetas();
  });

  function moverMesTarjetas(paso) {
    tarjetasMesSeleccionado = sumarMesesKey(mesSeleccionado(), paso);
    renderDeudaTarjetas();
  }
  document.getElementById("tarjetas-mes-prev").addEventListener("click", function () { moverMesTarjetas(-1); });
  document.getElementById("tarjetas-mes-next").addEventListener("click", function () { moverMesTarjetas(1); });

  // =========================================================
  // Resumen en la pestaña Deudas, Estadísticas y avisos
  // =========================================================

  function renderDeudaTarjetasResumen() {
    if (!deudasTarjetasResumenList) return;
    invalidarCacheEstados();
    var key = mesPorDefecto();
    deudasTarjetasResumenHint.textContent = "Lo que falta pagarle al banco en la deuda de " + mesLargo(key) +
      ", tarjeta por tarjeta — sea gasto tuyo, compartido o algo que te deban.";

    var filas = misTarjetas().map(function (t) { return estadoDeCuenta(t, key); })
      .filter(function (e) { return e.pendiente > 0; })
      .sort(function (a, b) { return b.pendiente - a.pendiente; });

    deudasTarjetasResumenEmpty.classList.toggle("hidden", filas.length !== 0);
    deudasTarjetasResumenList.innerHTML = "";
    filas.forEach(function (e) {
      var row = document.createElement("div");
      row.className = "compra-mini-row";
      var info = document.createElement("div");
      info.className = "compra-mini-info";
      var nombreEl = document.createElement("span");
      nombreEl.className = "compra-mini-desc";
      nombreEl.textContent = tarjetaLabel(e.tarjeta.id);
      var metaEl = document.createElement("span");
      metaEl.className = "compra-mini-meta";
      metaEl.textContent = "Deuda de " + mesLargo(key) + ": " + formatCurrency(e.total) + " · ya abonado " +
        formatCurrency(e.pagadoTotal) + " · " + situacionDe(e).texto.replace(/^[^ ]+ /, "");
      info.appendChild(nombreEl);
      info.appendChild(metaEl);
      row.appendChild(info);
      var valueEl = document.createElement("span");
      valueEl.className = "compra-mini-value";
      valueEl.textContent = formatCurrency(e.pendiente);
      row.appendChild(valueEl);
      deudasTarjetasResumenList.appendChild(row);
    });
  }

  var irADeudaTarjetasBtn = document.getElementById("ir-a-deuda-tarjetas-btn");
  if (irADeudaTarjetasBtn) {
    irADeudaTarjetasBtn.addEventListener("click", function () { activateTab("deuda-tarjetas"); });
  }

  // Lo que necesitan Estadísticas y los avisos: cifras del mes de pago
  // actual, sin la deuda total acumulada de la tarjeta.
  function resumenTarjetasParaEstadisticas() {
    invalidarCacheEstados();
    var key = mesActualKey();
    var r = resumenMesTarjetas(key);
    var mio = r.cargos.filter(function (item) { return (item.cargo.compra.comprador || YO.id) === YO.id; })
      .reduce(function (sum, item) { return sum + item.cargo.monto; }, 0);
    var conSaldo = r.estados.filter(function (e) { return e.pendiente > 0; })
      .sort(function (a, b) { return a.periodo.vencimientoIso.localeCompare(b.periodo.vencimientoIso); });
    return {
      key: key, total: r.total, pagado: r.pagado, pendiente: r.pendiente, mio: Math.round(mio),
      situacion: r.total <= 0 ? "Sin compras este mes" : (conSaldo.length === 0 ? "✅ Todo pagado" : situacionDe(conSaldo[0]).texto)
    };
  }

  // Tarjetas propias con un estado de cuenta por vencer (dentro de su
  // ventana de aviso) que todavía tiene saldo.
  function tarjetasPorVencerConSaldo() {
    invalidarCacheEstados();
    var hoy = todayStamp();
    return misTarjetas().map(function (t) {
      var e = estadoDeCuenta(t, periodoCerradoMasReciente(t).key);
      if (e.pendiente <= 0 || hoy > e.periodo.vencimientoIso || !e.periodo.pagoIso) return null;
      var aviso = t.diasAviso != null ? t.diasAviso : DEFAULT_DIAS_AVISO;
      var dias = diasHasta(e.periodo.vencimientoIso);
      return dias <= aviso ? { tarjeta: t, estado: e, dias: dias } : null;
    }).filter(Boolean).sort(function (a, b) { return a.dias - b.dias; });
  }

  // =========================================================
  // Cierres anteriores (modelo antiguo, solo lectura)
  //
  // El archivo se ordena por el mes de la compra (no por cuándo se cerró
  // el ciclo), que es lo que sirve para responder "en qué se gastó en julio".
  // =========================================================

  function renderArchivoTarjetas() {
    var archivadas = loadCompras().filter(function (c) { return c.tarjetaId && c.archivado; });

    buildTimeFilterOptions(tarjetasArchivoRangeSelect, archivadas.map(function (c) { return c.fecha; }), "all");
    var rango = tarjetasArchivoRangeSelect.value;
    var visibles = archivadas.filter(function (c) { return timeFilterMatches(rango, c.fecha); });

    tarjetasArchivoList.innerHTML = "";
    tarjetasArchivoEmpty.classList.toggle("hidden", visibles.length !== 0);
    if (visibles.length === 0) {
      tarjetasArchivoEmpty.textContent = archivadas.length === 0
        ? "No hay cierres del registro antiguo."
        : "No hay consumos archivados en el periodo elegido.";
      return;
    }

    var byMonth = {};
    visibles.forEach(function (c) {
      var key = monthKey(c.fecha);
      if (!byMonth[key]) byMonth[key] = [];
      byMonth[key].push(c);
    });

    Object.keys(byMonth).sort().reverse().forEach(function (key) {
      var items = byMonth[key].sort(function (a, b) { return String(b.fecha).localeCompare(String(a.fecha)); });
      var total = items.reduce(function (sum, c) { return sum + (Number(c.monto) || 0); }, 0);

      var details = document.createElement("details");
      details.className = "month-group";

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
      thead.innerHTML = "<tr><th>Fecha</th><th>Qué se compró</th><th>Categoría</th><th>Tarjeta</th><th>Cerrado el</th><th class=\"col-value\">Monto</th></tr>";
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
