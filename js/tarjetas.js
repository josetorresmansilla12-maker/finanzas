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
