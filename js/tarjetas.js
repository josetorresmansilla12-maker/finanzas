"use strict";

  // =========================================================
  // TARJETAS — datos de cada tarjeta y cálculo de próximos vencimientos
  // Todos los campos son opcionales salvo el nombre: quien recién empieza a
  // usar la app puede guardar una tarjeta sin fechas y completarlas después.
  // =========================================================

  var tarjetaForm = document.getElementById("tarjeta-form");
  var tarjetaIdInput = document.getElementById("tarjeta-id");
  var tarjetaNombreInput = document.getElementById("tarjeta-nombre");
  var tarjetaOwnerSelect = document.getElementById("tarjeta-owner");
  var tarjetaUltimos4Input = document.getElementById("tarjeta-ultimos4");
  var tarjetaDiaFacturacionInput = document.getElementById("tarjeta-dia-facturacion");
  var tarjetaDiaFacturacionHastaInput = document.getElementById("tarjeta-dia-facturacion-hasta");
  var tarjetaDiaPagoInput = document.getElementById("tarjeta-dia-pago");
  var tarjetaDiaPagoHastaInput = document.getElementById("tarjeta-dia-pago-hasta");
  var tarjetaDiasAvisoInput = document.getElementById("tarjeta-dias-aviso");
  var tarjetaNotasInput = document.getElementById("tarjeta-notas");
  var submitTarjetaBtn = document.getElementById("submit-tarjeta-btn");
  var cancelEditTarjetaBtn = document.getElementById("cancel-edit-tarjeta-btn");
  var formTitleTarjeta = document.getElementById("form-title-tarjeta");

  var tarjetasListEl = document.getElementById("tarjetas-list");
  var tarjetasEmptyState = document.getElementById("tarjetas-empty-state");
  var tarjetasTotalEl = document.getElementById("tarjetas-total");
  var tarjetasProximosListEl = document.getElementById("tarjetas-proximos-list");

  var DEFAULT_DIAS_AVISO = 5;

  // ---------- Cálculo de fechas recurrentes (día del mes) ----------

  function daysInMonth(year, monthIndex) {
    return new Date(year, monthIndex + 1, 0).getDate();
  }

  function dateToIso(y, monthIndex, d) {
    return y + "-" + String(monthIndex + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0");
  }

  // Próxima fecha (>= fromIso) en la que cae el día "day" del mes. Si el mes
  // no tiene ese día (ej. día 31 en febrero), usa el último día del mes.
  function nextOccurrenceOfDay(day, fromIso) {
    var from = fromIso || todayStamp();
    var parts = from.split("-").map(Number);
    var y = parts[0], m = parts[1] - 1;
    var clampedThis = Math.min(day, daysInMonth(y, m));
    var candidate = dateToIso(y, m, clampedThis);
    if (candidate >= from) return candidate;
    var ny = m === 11 ? y + 1 : y;
    var nm = m === 11 ? 0 : m + 1;
    var clampedNext = Math.min(day, daysInMonth(ny, nm));
    return dateToIso(ny, nm, clampedNext);
  }

  // Muchos bancos no dan un día exacto sino una ventana ("entre el 8 y el
  // 10"). El fin del rango cae en el mismo mes que el inicio, salvo que la
  // ventana cruce el cambio de mes (ej. del 28 al 2).
  function rangeEndIso(startIso, diaHasta) {
    var parts = startIso.split("-").map(Number);
    var y = parts[0], m = parts[1] - 1, dStart = parts[2];
    if (diaHasta >= dStart) return dateToIso(y, m, Math.min(diaHasta, daysInMonth(y, m)));
    var ny = m === 11 ? y + 1 : y;
    var nm = m === 11 ? 0 : m + 1;
    return dateToIso(ny, nm, Math.min(diaHasta, daysInMonth(ny, nm)));
  }

  // Devuelve null cuando la tarjeta no tiene día de pago configurado: no hay
  // nada que calcular ni avisar todavía. Con rango, los avisos usan el primer
  // día para no llegar tarde.
  function nextDueInfo(tarjeta) {
    if (!tarjeta.diaPago) return null;
    var dueIso = nextOccurrenceOfDay(Number(tarjeta.diaPago), todayStamp());
    var info = { dueIso: dueIso, daysUntil: daysBetweenDates(todayStamp(), dueIso) };
    if (tarjeta.diaPagoHasta) info.hastaIso = rangeEndIso(dueIso, Number(tarjeta.diaPagoHasta));
    return info;
  }

  function nextBillingInfo(tarjeta) {
    if (!tarjeta.diaFacturacion) return null;
    var iso = nextOccurrenceOfDay(Number(tarjeta.diaFacturacion), todayStamp());
    var info = { billingIso: iso, daysUntil: daysBetweenDates(todayStamp(), iso) };
    if (tarjeta.diaFacturacionHasta) info.hastaIso = rangeEndIso(iso, Number(tarjeta.diaFacturacionHasta));
    return info;
  }

  // =========================================================
  // Ciclo de facturación (estado de cuenta)
  //
  // Una tarjeta no se paga por mes calendario: el banco "cierra" (factura)
  // un día fijo, y todo lo comprado desde el cierre anterior hasta ese día
  // se paga junto en el día de pago siguiente. Ejemplo con cierre el 20 y
  // pago el 5: lo comprado del 21/08 al 20/09 es la "deuda de octubre"
  // (vence el 05/10), y lo comprado desde el 21/09 ya pasa a noviembre.
  //
  // Cada estado de cuenta se identifica por su MES DE PAGO ("YYYY-MM"), que
  // es como se habla de él: "la deuda de octubre".
  //
  // Si el banco da un rango de cierre ("entre el 18 y el 20") se usa el
  // último día: en la duda, la compra cae en el estado que se paga antes y
  // la plata no te pilla desprevenido. Sin datos, se asume cierre a fin de
  // mes y pago al mes siguiente (marcado como "aproximado").
  // =========================================================

  function diaCierreDe(tarjeta) {
    return Number(tarjeta && (tarjeta.diaFacturacionHasta || tarjeta.diaFacturacion)) || null;
  }

  function diaPagoDe(tarjeta) {
    return Number(tarjeta && tarjeta.diaPago) || null;
  }

  function tieneCicloCompleto(tarjeta) {
    return !!(diaCierreDe(tarjeta) && diaPagoDe(tarjeta));
  }

  // Qué datos faltan para calcular el ciclo real (para el aviso).
  function datosCicloFaltantes(tarjeta) {
    var faltan = [];
    if (!diaCierreDe(tarjeta)) faltan.push("día de cierre (facturación)");
    if (!diaPagoDe(tarjeta)) faltan.push("día de pago (vencimiento)");
    return faltan;
  }

  function isoEnMes(mesKey, dia) {
    var parts = mesKey.split("-").map(Number);
    return dateToIso(parts[0], parts[1] - 1, Math.min(dia, daysInMonth(parts[0], parts[1] - 1)));
  }

  function sumarMesesKey(mesKey, n) {
    return addMonthsToIso(mesKey + "-01", n).slice(0, 7);
  }

  // "octubre", o "octubre 2027" si no es del año en curso.
  function mesLargo(mesKey) {
    var parts = mesKey.split("-");
    var nombre = MESES[Number(parts[1]) - 1] || "";
    return parts[0] === todayStamp().slice(0, 4) ? nombre : nombre + " " + parts[0];
  }

  // Meses entre el cierre y el pago: si se paga un día posterior al cierre,
  // es el mismo mes (cierra el 1, paga el 20); si no, el mes siguiente.
  function offsetMesPago(tarjeta) {
    var cierre = diaCierreDe(tarjeta) || 31;
    var pago = diaPagoDe(tarjeta);
    if (!pago) return 1;
    return pago > cierre ? 0 : 1;
  }

  // Estado de cuenta que se paga en `mesPagoKey`.
  function periodoPorKey(tarjeta, mesPagoKey) {
    var cierreDia = diaCierreDe(tarjeta) || 31;
    var mesCierre = sumarMesesKey(mesPagoKey, -offsetMesPago(tarjeta));
    var cierreIso = isoEnMes(mesCierre, cierreDia);
    var inicioIso = addDaysToIso(isoEnMes(sumarMesesKey(mesCierre, -1), cierreDia), 1);
    var pagoIso = diaPagoDe(tarjeta) ? isoEnMes(mesPagoKey, diaPagoDe(tarjeta)) : null;
    if (pagoIso && pagoIso <= cierreIso) pagoIso = addDaysToIso(cierreIso, 1);
    return {
      key: mesPagoKey,
      inicioIso: inicioIso,
      cierreIso: cierreIso,
      pagoIso: pagoIso,
      // Sin día de pago se considera vencido recién al terminar el mes.
      vencimientoIso: pagoIso || isoEnMes(mesPagoKey, 31),
      aproximado: !tieneCicloCompleto(tarjeta)
    };
  }

  // Estado de cuenta en el que cae una compra hecha el día `iso`.
  function periodoDeFecha(tarjeta, iso) {
    var mes = monthKey(iso);
    var mesCierre = iso <= isoEnMes(mes, diaCierreDe(tarjeta) || 31) ? mes : sumarMesesKey(mes, 1);
    return periodoPorKey(tarjeta, sumarMesesKey(mesCierre, offsetMesPago(tarjeta)));
  }

  // Estado de cuenta en curso hoy (todavía no cierra) y el último ya cerrado.
  function periodoEnCurso(tarjeta) {
    return periodoDeFecha(tarjeta, todayStamp());
  }

  function periodoCerradoMasReciente(tarjeta) {
    return periodoPorKey(tarjeta, sumarMesesKey(periodoEnCurso(tarjeta).key, -1));
  }

  // "día 8" o "entre el 8 y el 10", según haya rango o no.
  function diaOrRangoLabel(dia, diaHasta) {
    if (!dia) return "";
    return diaHasta ? "entre el " + dia + " y el " + diaHasta : "día " + dia;
  }

  function fechaOrRangoLabel(info) {
    if (!info) return "";
    var base = formatDateDisplay(info.dueIso || info.billingIso);
    return info.hastaIso ? base + " al " + formatDateDisplay(info.hastaIso) : base;
  }

  function dueBadgeStatus(daysUntil, avisoDays) {
    if (daysUntil <= avisoDays) return "soon";
    return "ok";
  }

  function dueBadgeLabel(daysUntil) {
    if (daysUntil === 0) return "Vence hoy";
    if (daysUntil === 1) return "Vence mañana";
    return "Vence en " + daysUntil + " días";
  }

  // ---------- Select de tarjetas reales (usado para filtros) ----------

  function populateTarjetaSelect(selectEl, emptyValue, emptyLabel) {
    var previousValue = selectEl.value;
    selectEl.innerHTML = "";
    var emptyOpt = document.createElement("option");
    emptyOpt.value = emptyValue;
    emptyOpt.textContent = emptyLabel;
    selectEl.appendChild(emptyOpt);
    loadTarjetas().forEach(function (t) {
      var opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = tarjetaLabel(t.id);
      selectEl.appendChild(opt);
    });
    if (Array.from(selectEl.options).some(function (o) { return o.value === previousValue; })) {
      selectEl.value = previousValue;
    }
  }

  // ---------- Formulario ----------

  function clearTarjetaErrors() {
    ["tarjeta-nombre", "tarjeta-dia-facturacion", "tarjeta-dia-pago"].forEach(function (id) {
      document.getElementById("error-" + id).textContent = "";
      document.getElementById(id).classList.remove("invalid");
    });
  }

  function setTarjetaError(fieldId, message) {
    document.getElementById("error-" + fieldId).textContent = message;
    document.getElementById(fieldId).classList.add("invalid");
  }

  function validateTarjetaForm(data) {
    clearTarjetaErrors();
    var valid = true;
    if (!data.nombre) {
      setTarjetaError("tarjeta-nombre", "Ingresa el nombre de la tarjeta.");
      valid = false;
    }
    function diaInvalido(d) { return d !== null && (d < 1 || d > 31); }

    if (diaInvalido(data.diaFacturacion) || diaInvalido(data.diaFacturacionHasta)) {
      setTarjetaError("tarjeta-dia-facturacion", "Ingresa días válidos (1 a 31) o déjalos vacíos.");
      valid = false;
    } else if (data.diaFacturacionHasta !== null && data.diaFacturacion === null) {
      setTarjetaError("tarjeta-dia-facturacion", "Para usar un rango, completa primero el día inicial.");
      valid = false;
    }

    if (diaInvalido(data.diaPago) || diaInvalido(data.diaPagoHasta)) {
      setTarjetaError("tarjeta-dia-pago", "Ingresa días válidos (1 a 31) o déjalos vacíos.");
      valid = false;
    } else if (data.diaPagoHasta !== null && data.diaPago === null) {
      setTarjetaError("tarjeta-dia-pago", "Para usar un rango, completa primero el día inicial.");
      valid = false;
    }
    return valid;
  }

  function resetTarjetaForm() {
    tarjetaForm.reset();
    tarjetaIdInput.value = "";
    editingTarjetaId = null;
    clearTarjetaErrors();
    populatePersonaSelects();
    tarjetaOwnerSelect.value = "mia";
    submitTarjetaBtn.textContent = "Agregar tarjeta";
    formTitleTarjeta.textContent = "Agregar tarjeta";
    cancelEditTarjetaBtn.classList.add("hidden");
  }

  function startEditTarjeta(id) {
    var tarjeta = loadTarjetas().find(function (t) { return t.id === id; });
    if (!tarjeta) return;

    editingTarjetaId = id;
    tarjetaIdInput.value = id;
    tarjetaNombreInput.value = tarjeta.nombre;
    populatePersonaSelects();
    tarjetaOwnerSelect.value = tarjeta.owner || "mia";
    tarjetaUltimos4Input.value = tarjeta.ultimos4 || "";
    tarjetaDiaFacturacionInput.value = tarjeta.diaFacturacion || "";
    tarjetaDiaFacturacionHastaInput.value = tarjeta.diaFacturacionHasta || "";
    tarjetaDiaPagoInput.value = tarjeta.diaPago || "";
    tarjetaDiaPagoHastaInput.value = tarjeta.diaPagoHasta || "";
    tarjetaDiasAvisoInput.value = tarjeta.diasAviso != null ? tarjeta.diasAviso : "";
    tarjetaNotasInput.value = tarjeta.notas || "";

    submitTarjetaBtn.textContent = "Guardar cambios";
    formTitleTarjeta.textContent = "Editar tarjeta";
    cancelEditTarjetaBtn.classList.remove("hidden");
    clearTarjetaErrors();
    activateTab("tarjetas");
    tarjetaForm.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  cancelEditTarjetaBtn.addEventListener("click", resetTarjetaForm);

  tarjetaForm.addEventListener("submit", function (e) {
    e.preventDefault();

    var data = {
      nombre: tarjetaNombreInput.value.trim(),
      owner: tarjetaOwnerSelect.value || "mia",
      ultimos4: tarjetaUltimos4Input.value.trim() || null,
      diaFacturacion: tarjetaDiaFacturacionInput.value === "" ? null : Number(tarjetaDiaFacturacionInput.value),
      diaFacturacionHasta: tarjetaDiaFacturacionHastaInput.value === "" ? null : Number(tarjetaDiaFacturacionHastaInput.value),
      diaPago: tarjetaDiaPagoInput.value === "" ? null : Number(tarjetaDiaPagoInput.value),
      diaPagoHasta: tarjetaDiaPagoHastaInput.value === "" ? null : Number(tarjetaDiaPagoHastaInput.value),
      diasAviso: tarjetaDiasAvisoInput.value === "" ? null : Number(tarjetaDiasAvisoInput.value),
      notas: tarjetaNotasInput.value.trim() || null
    };

    if (!validateTarjetaForm(data)) return;

    var tarjetas = loadTarjetas();

    if (editingTarjetaId) {
      var idx = tarjetas.findIndex(function (t) { return t.id === editingTarjetaId; });
      if (idx !== -1) {
        tarjetas[idx].nombre = data.nombre;
        tarjetas[idx].owner = data.owner;
        tarjetas[idx].ultimos4 = data.ultimos4;
        tarjetas[idx].diaFacturacion = data.diaFacturacion;
        tarjetas[idx].diaFacturacionHasta = data.diaFacturacionHasta;
        tarjetas[idx].diaPago = data.diaPago;
        tarjetas[idx].diaPagoHasta = data.diaPagoHasta;
        tarjetas[idx].diasAviso = data.diasAviso;
        tarjetas[idx].notas = data.notas;
      }
      showToast("Tarjeta actualizada.");
    } else {
      tarjetas.push({
        id: uid(),
        nombre: data.nombre,
        owner: data.owner,
        ultimos4: data.ultimos4,
        diaFacturacion: data.diaFacturacion,
        diaFacturacionHasta: data.diaFacturacionHasta,
        diaPago: data.diaPago,
        diaPagoHasta: data.diaPagoHasta,
        diasAviso: data.diasAviso,
        notas: data.notas,
        createdAt: Date.now()
      });
      showToast("Tarjeta registrada.");
    }

    if (saveTarjetas(tarjetas)) {
      resetTarjetaForm();
      renderAll();
    }
  });

  // ---------- Render ----------

  function buildTarjetaCard(tarjeta) {
    var due = nextDueInfo(tarjeta);
    var billing = nextBillingInfo(tarjeta);
    var avisoDays = tarjeta.diasAviso != null ? tarjeta.diasAviso : DEFAULT_DIAS_AVISO;

    var card = document.createElement("div");
    card.className = "tarjeta-card";

    var header = document.createElement("div");
    header.className = "tarjeta-card-header";

    var left = document.createElement("div");
    var nombreEl = document.createElement("span");
    nombreEl.className = "tarjeta-nombre";
    nombreEl.textContent = tarjeta.nombre + (tarjeta.ultimos4 ? " •••• " + tarjeta.ultimos4 : "");
    left.appendChild(nombreEl);
    var ownerBadge = document.createElement("span");
    ownerBadge.className = "tarjeta-owner-badge";
    ownerBadge.textContent = !tarjeta.owner || tarjeta.owner === "mia" ? "Mía" : "De " + personaNombre(tarjeta.owner);
    left.appendChild(ownerBadge);

    if (tarjeta.diaFacturacion || tarjeta.diaPago) {
      var meta = document.createElement("div");
      meta.className = "tarjeta-meta";
      var metaParts = [];
      if (tarjeta.diaFacturacion) {
        metaParts.push("Facturación: " + diaOrRangoLabel(tarjeta.diaFacturacion, tarjeta.diaFacturacionHasta) +
          (billing ? " (próx. " + fechaOrRangoLabel(billing) + ")" : ""));
      }
      if (tarjeta.diaPago) {
        metaParts.push("Pago: " + diaOrRangoLabel(tarjeta.diaPago, tarjeta.diaPagoHasta) +
          " · Aviso: " + avisoDays + " día(s) antes");
      }
      meta.textContent = metaParts.join(" · ");
      left.appendChild(meta);
    } else {
      var noDateMeta = document.createElement("div");
      noDateMeta.className = "tarjeta-meta";
      noDateMeta.textContent = "Sin fechas de facturación/pago configuradas.";
      left.appendChild(noDateMeta);
    }

    if (tarjeta.notas) {
      var notasEl = document.createElement("div");
      notasEl.className = "tarjeta-meta";
      notasEl.textContent = "Nota: " + tarjeta.notas;
      left.appendChild(notasEl);
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

    var actions = document.createElement("div");
    actions.className = "tarjeta-card-actions";

    var editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "btn btn-secondary btn-small";
    editBtn.textContent = "Editar";
    editBtn.addEventListener("click", function () { startEditTarjeta(tarjeta.id); });
    actions.appendChild(editBtn);

    var deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "btn btn-danger btn-small";
    deleteBtn.textContent = "Eliminar";
    deleteBtn.addEventListener("click", function () { requestDelete("tarjeta", tarjeta.id); });
    actions.appendChild(deleteBtn);

    card.appendChild(actions);
    return card;
  }

  function renderTarjetas() {
    var tarjetas = loadTarjetas().slice().sort(function (a, b) {
      var dueA = nextDueInfo(a);
      var dueB = nextDueInfo(b);
      if (!dueA && !dueB) return 0;
      if (!dueA) return 1;
      if (!dueB) return -1;
      return dueA.daysUntil - dueB.daysUntil;
    });

    tarjetasEmptyState.classList.toggle("hidden", tarjetas.length !== 0);
    tarjetasListEl.innerHTML = "";
    tarjetas.forEach(function (t) { tarjetasListEl.appendChild(buildTarjetaCard(t)); });

    tarjetasTotalEl.textContent = String(tarjetas.length);

    // Próximos vencimientos: se listan todas las tarjetas con fecha de pago
    // configurada (no solo la más próxima), para que dos vencimientos del
    // mismo periodo queden igual de visibles.
    tarjetasProximosListEl.innerHTML = "";
    var conFecha = tarjetas.filter(function (t) { return !!nextDueInfo(t); });
    if (conFecha.length === 0) {
      var noneEl = document.createElement("span");
      noneEl.className = "card-value";
      noneEl.textContent = "—";
      tarjetasProximosListEl.appendChild(noneEl);
    } else {
      conFecha.forEach(function (t) {
        var due = nextDueInfo(t);
        var row = document.createElement("div");
        row.className = "tarjeta-proximo-row";
        row.textContent = t.nombre + " — " + dueBadgeLabel(due.daysUntil) + " (" + fechaOrRangoLabel(due) + ")";
        tarjetasProximosListEl.appendChild(row);
      });
    }

    populateTarjetaSelect(document.getElementById("compras-filter-tarjeta"), "", "Todos los métodos de pago");
  }
