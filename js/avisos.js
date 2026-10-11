"use strict";

  // =========================================================
  // AVISOS — "Importante / revisar"
  //
  // Junta en un solo lugar lo que está pendiente hace tiempo o vence
  // pronto: tarjetas vencidas o por vencer con saldo, reembolsos recibidos
  // que no figuran abonados al banco, gente que te debe (o a la que le
  // debes) hace más de un mes, y datos que faltan.
  //
  // No guarda nada propio: todo se calcula en el momento desde las mismas
  // compras y abonos de siempre, y cada botón llama a la MISMA acción que
  // en su pestaña (marcar pagado, abonar…). Por eso, marcar algo aquí lo
  // actualiza en toda la app, y viceversa.
  // =========================================================

  var avisosLista = document.getElementById("avisos-lista");
  var avisosVacio = document.getElementById("avisos-vacio");
  var avisosBadge = document.getElementById("avisos-badge");
  var avisosResumen = document.getElementById("avisos-resumen");

  var AVISOS_DIAS_ANTIGUO = 30;

  function diasDesde(iso) {
    return daysBetweenDates(iso, todayStamp());
  }

  function montoPendienteDeCompra(c) {
    return Math.max(0, (Number(c.monto) || 0) - compraCubierta(c));
  }

  // Compras de una deuda que ya llevan rato sin pagarse, o cuya fecha de
  // pago acordada ya pasó.
  function comprasAtrasadas(compras) {
    var hoy = todayStamp();
    return compras.filter(function (c) {
      if (c.pagada || montoPendienteDeCompra(c) <= 0) return false;
      return diasDesde(c.fecha) > AVISOS_DIAS_ANTIGUO || (c.fechaPagoAcordada && c.fechaPagoAcordada < hoy);
    }).sort(function (a, b) { return String(a.fecha).localeCompare(String(b.fecha)); });
  }

  function primerPeriodoConSaldo(tarjeta) {
    var hasta = periodoEnCurso(tarjeta).key;
    var info = estadosCacheados(tarjeta);
    var k = info.keys.filter(function (key) { return key <= hasta && info.porKey[key].pendiente > 0; })[0];
    return k || hasta;
  }

  function irADeudaTarjetasMes(key) {
    tarjetasMesSeleccionado = key;
    activateTab("deuda-tarjetas");
  }

  // Cada aviso: { nivel: "urgente"|"atencion"|"info", icono, titulo,
  // detalle, acciones: [{ texto, clase, fn }], items: [{ texto, monto, acciones }] }
  function calcularAvisos() {
    invalidarCacheEstados();
    var avisos = [];

    // ---- Tarjetas vencidas con saldo ----
    estadosAtrasados().forEach(function (e) {
      avisos.push({
        nivel: "urgente", icono: "⚠️",
        titulo: e.tarjeta.nombre + ": la deuda de " + mesLargo(e.key) + " ya venció",
        detalle: "Venció el " + formatDateDisplay(e.periodo.vencimientoIso) + " y en la app sigue con " + formatCurrency(e.pendiente) +
          " por pagar. Si ya la pagaste en el banco, márcala como pagada.",
        acciones: [
          { texto: "✅ Ya la pagué", clase: "btn-primary", fn: function () { markTarjetaPagada(e.tarjeta.id, e.key); } },
          { texto: "Ver detalle", clase: "btn-outline", fn: function () { irADeudaTarjetasMes(e.key); } }
        ]
      });
    });

    // ---- Tarjetas por vencer con saldo ----
    tarjetasPorVencerConSaldo().forEach(function (x) {
      avisos.push({
        nivel: "atencion", icono: "⏳",
        titulo: x.tarjeta.nombre + ": la deuda de " + mesLargo(x.estado.key) + " " + textoVence(x.estado.periodo.vencimientoIso),
        detalle: "Falta pagar " + formatCurrency(x.estado.pendiente) + " de " + formatCurrency(x.estado.total) + ".",
        acciones: [
          { texto: "✅ Ya la pagué", clase: "btn-primary", fn: function () { markTarjetaPagada(x.tarjeta.id, x.estado.key); } },
          { texto: "Ver detalle", clase: "btn-outline", fn: function () { irADeudaTarjetasMes(x.estado.key); } }
        ]
      });
    });

    // ---- Reembolsos recibidos que no figuran abonados al banco ----
    misTarjetas().forEach(function (t) {
      var monto = reembolsosPorAbonarVisibles(t);
      if (monto <= 0) return;
      var key = primerPeriodoConSaldo(t);
      avisos.push({
        nivel: "atencion", icono: "💰",
        titulo: "Te devolvieron " + formatCurrency(monto) + " por compras de " + t.nombre,
        detalle: "Esa plata todavía no figura abonada a la tarjeta. Si ya la pagaste al banco, toca \"Ya lo aboné\".",
        acciones: [
          { texto: "✓ Ya lo aboné", clase: "btn-primary", fn: function () { descartarReembolsosPendientes(t.id); } },
          { texto: "Abonar a la deuda de " + mesLargo(key), clase: "btn-secondary", fn: function () { aplicarReembolsosABanco(t.id, key, monto); } }
        ]
      });
    });

    // ---- Te deben hace tiempo ----
    deudoresConDeuda().forEach(function (key) {
      var pendiente = balanceMeDeben(key).pendiente;
      var atrasadas = comprasAtrasadas(comprasMeDeben(key));
      if (!atrasadas.length) return;
      var acordadaVencida = atrasadas.filter(function (c) { return c.fechaPagoAcordada && c.fechaPagoAcordada < todayStamp(); })[0];
      avisos.push({
        nivel: acordadaVencida ? "urgente" : "atencion", icono: "🤝",
        titulo: deudorNombre(key) + " te debe " + formatCurrency(pendiente),
        detalle: acordadaVencida
          ? "Quedó en pagarte el " + formatDateDisplay(acordadaVencida.fechaPagoAcordada) + " y esa fecha ya pasó."
          : atrasadas.length + (atrasadas.length === 1 ? " compra" : " compras") + " de hace más de " + AVISOS_DIAS_ANTIGUO +
            " días sin pagar (la más antigua del " + formatDateDisplay(atrasadas[0].fecha) + ").",
        acciones: [
          {
            texto: "✅ Ya me pagó todo", clase: "btn-primary", fn: function () {
              pedirConfirmacionPago("Se registrará " + formatCurrency(pendiente) + " como recibido de " + deudorNombre(key) + " y su deuda quedará al día.",
                function () { addAbono("me_deben", key, pendiente, todayStamp(), "Marcado como pagado por completo (desde Avisos)"); });
            }
          },
          { texto: "Ver en Deudas", clase: "btn-outline", fn: function () { activateTab("deudas"); irACuadroDeuda("me_deben::" + key); } }
        ],
        items: atrasadas.map(function (c) {
          return {
            texto: formatDateDisplay(c.fecha) + " · " + compraDisplayName(c),
            monto: montoPendienteDeCompra(c),
            acciones: [{ texto: "Me la pagó", clase: "btn-secondary", fn: function () { toggleCompraPagada(c.id); } }]
          };
        })
      });
    });

    // ---- Le debes a alguien hace tiempo ----
    acreedoresConDeuda().forEach(function (id) {
      var pendiente = balanceDeudaMia(id).pendiente;
      var atrasadas = comprasAtrasadas(comprasDeudaMia(id));
      if (!atrasadas.length) return;
      avisos.push({
        nivel: "atencion", icono: "💸",
        titulo: "Le debes " + formatCurrency(pendiente) + " a " + personaNombre(id),
        detalle: atrasadas.length + (atrasadas.length === 1 ? " compra pendiente" : " compras pendientes") + " desde el " + formatDateDisplay(atrasadas[0].fecha) + ".",
        acciones: [
          {
            texto: "✅ Ya le pagué todo", clase: "btn-primary", fn: function () {
              pedirConfirmacionPago("Se registrará una devolución de " + formatCurrency(pendiente) + " a " + personaNombre(id) + " y quedarás al día.",
                function () { addAbono("deuda_mia", id, pendiente, todayStamp(), "Marcado como pagado por completo (desde Avisos)"); });
            }
          },
          { texto: "Ver en Deudas", clase: "btn-outline", fn: function () { activateTab("deudas"); irACuadroDeuda("deuda_mia::" + id); } }
        ],
        items: atrasadas.map(function (c) {
          return {
            texto: formatDateDisplay(c.fecha) + " · " + compraDisplayName(c),
            monto: montoPendienteDeCompra(c),
            acciones: [{ texto: "Ya la pagué", clase: "btn-secondary", fn: function () { toggleCompraPagada(c.id); } }]
          };
        })
      });
    });

    // ---- Datos que faltan ----
    misTarjetas().forEach(function (t) {
      var faltan = datosCicloFaltantes(t);
      if (!faltan.length) return;
      avisos.push({
        nivel: "info", icono: "⚙️",
        titulo: t.nombre + ": falta el " + faltan.join(" y el "),
        detalle: "Sin esos datos, la deuda del mes de esta tarjeta se calcula de forma aproximada.",
        acciones: [{ texto: "Completar datos", clase: "btn-secondary", fn: function () { startEditTarjeta(t.id); } }]
      });
    });

    var diasRespaldo = daysSinceLastBackup();
    if (diasRespaldo === null || diasRespaldo >= loadAutoBackupConfig().cadaDias) {
      avisos.push({
        nivel: "info", icono: "💾",
        titulo: diasRespaldo === null ? "Todavía no has hecho un respaldo" : "Tu último respaldo fue hace " + diasRespaldo + " días",
        detalle: "Un respaldo guarda una copia de todos tus datos en un archivo.",
        acciones: [{ texto: "Respaldar ahora", clase: "btn-secondary", fn: function () { document.getElementById("save-backup-btn").click(); } }]
      });
    }

    var orden = { urgente: 0, atencion: 1, info: 2 };
    return avisos.sort(function (a, b) { return orden[a.nivel] - orden[b.nivel]; });
  }

  function buildAvisoCard(aviso) {
    var card = document.createElement("div");
    card.className = "aviso-card aviso-" + aviso.nivel;

    var head = document.createElement("div");
    head.className = "aviso-card-head";
    var icono = document.createElement("span");
    icono.className = "aviso-icono";
    icono.textContent = aviso.icono;
    head.appendChild(icono);
    var textos = document.createElement("div");
    textos.className = "aviso-textos";
    var titulo = document.createElement("strong");
    titulo.textContent = aviso.titulo;
    textos.appendChild(titulo);
    var detalle = document.createElement("span");
    detalle.textContent = aviso.detalle;
    textos.appendChild(detalle);
    head.appendChild(textos);
    card.appendChild(head);

    function botones(acciones, clase) {
      var wrap = document.createElement("div");
      wrap.className = clase;
      acciones.forEach(function (a) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "btn btn-small " + a.clase;
        b.textContent = a.texto;
        b.addEventListener("click", a.fn);
        wrap.appendChild(b);
      });
      return wrap;
    }
    card.appendChild(botones(aviso.acciones, "aviso-acciones"));

    if (aviso.items && aviso.items.length) {
      var det = document.createElement("details");
      det.className = "aviso-items";
      var sum = document.createElement("summary");
      sum.textContent = aviso.items.length === 1 ? "Ver la compra" : "Ver las " + aviso.items.length + " compras";
      det.appendChild(sum);
      aviso.items.forEach(function (it) {
        var fila = document.createElement("div");
        fila.className = "aviso-item";
        var t = document.createElement("span");
        t.textContent = it.texto;
        fila.appendChild(t);
        var m = document.createElement("strong");
        m.textContent = formatCurrency(it.monto);
        fila.appendChild(m);
        fila.appendChild(botones(it.acciones, "aviso-item-acciones"));
        det.appendChild(fila);
      });
      card.appendChild(det);
    }
    return card;
  }

  function contarAvisosImportantes(avisos) {
    return avisos.filter(function (a) { return a.nivel !== "info"; }).length;
  }

  function actualizarBadgeAvisos(avisos) {
    var n = contarAvisosImportantes(avisos || calcularAvisos());
    avisosBadge.textContent = String(n);
    avisosBadge.classList.toggle("hidden", n === 0);
  }

  function renderAvisos() {
    var avisos = calcularAvisos();
    actualizarBadgeAvisos(avisos);
    avisosLista.innerHTML = "";
    avisosVacio.classList.toggle("hidden", avisos.length !== 0);
    var urgentes = avisos.filter(function (a) { return a.nivel === "urgente"; }).length;
    var importantes = contarAvisosImportantes(avisos);
    avisosResumen.textContent = avisos.length === 0 ? ""
      : urgentes > 0 ? "Tienes " + urgentes + (urgentes === 1 ? " cosa urgente" : " cosas urgentes") + " y " + (importantes - urgentes) + " por revisar."
        : importantes > 0 ? "Tienes " + importantes + (importantes === 1 ? " cosa" : " cosas") + " por revisar."
          : "Nada urgente: solo algunos detalles por completar.";
    avisos.forEach(function (a) { avisosLista.appendChild(buildAvisoCard(a)); });
  }
