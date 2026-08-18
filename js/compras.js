"use strict";

  // =========================================================
  // COMPRAS — registro de gastos (fijos, suscripciones y variables)
  // =========================================================

  var compraForm = document.getElementById("compra-form");
  var compraIdInput = document.getElementById("compra-id");
  var compraCategoriaSelect = document.getElementById("compra-categoria");
  var compraCategoriaOtherField = document.getElementById("compra-categoria-other-field");
  var compraCategoriaOtherInput = document.getElementById("compra-categoria-other");
  var compraAutoField = document.getElementById("compra-auto-field");
  var compraAutoOptionsEl = document.getElementById("compra-auto-options");
  var compraDescripcionInput = document.getElementById("compra-descripcion");
  var compraMontoInput = document.getElementById("compra-monto");
  var compraFechaInput = document.getElementById("compra-fecha");
  var compraCuotasField = document.getElementById("compra-cuotas-field");
  var compraCuotasCountInput = document.getElementById("compra-cuotas-count");
  var compraInteresField = document.getElementById("compra-interes-field");
  var compraTieneInteresInput = document.getElementById("compra-tiene-interes");
  var compraFechaPagoInput = document.getElementById("compra-fecha-pago");
  var compraMetodoPagoSelect = document.getElementById("compra-metodo-pago");
  var compraSuscripcionField = document.getElementById("compra-suscripcion-field");
  var compraSuscripcionRepiteInput = document.getElementById("compra-suscripcion-repite");
  var compraSuscripcionDetalleField = document.getElementById("compra-suscripcion-detalle-field");
  var compraSuscripcionHastaFechaInput = document.getElementById("compra-suscripcion-hasta-fecha");
  var compraSuscripcionMesesInput = document.getElementById("compra-suscripcion-meses");
  var compraFijoRecordatorioField = document.getElementById("compra-fijo-recordatorio-field");
  var compraFijoFechaPagoInput = document.getElementById("compra-fijo-fecha-pago");
  var compraFijoRecordatorioHint = document.getElementById("compra-fijo-recordatorio-hint");
  var compraCompradorSelect = document.getElementById("compra-comprador");
  var compraCompradorOtroField = document.getElementById("compra-comprador-otro-field");
  var compraCompradorOtroInput = document.getElementById("compra-comprador-otro");
  var compraCompradorOtroStatsInput = document.getElementById("compra-comprador-otro-stats");
  var compraAcreedorSelect = document.getElementById("compra-acreedor");
  var compraPersonaField = document.getElementById("compra-persona-field");
  var compraPersonaInput = document.getElementById("compra-persona");
  var compraOrigenField = document.getElementById("compra-origen-field");
  var compraSobreField = document.getElementById("compra-sobre-field");
  var compraSobreSelect = document.getElementById("compra-sobre");
  var compraHogarHint = document.getElementById("compra-hogar-hint");
  var compraNotasInput = document.getElementById("compra-notas");
  var compraTipoPagoField = document.getElementById("compra-tipo-pago-field");
  var compraMontoField = document.getElementById("compra-monto-field");
  var compraCompradorField = document.getElementById("compra-comprador-field");
  var compraHogarField = document.getElementById("compra-hogar-field");
  var compraAcreedorField = document.getElementById("compra-acreedor-field");
  var compraCompartidaField = document.getElementById("compra-compartida-field");
  var compraCompartidaEditNotice = document.getElementById("compra-compartida-edit-notice");
  var compraParticipantesListEl = document.getElementById("compra-participantes-list");
  var compraParticipanteAddBtn = document.getElementById("compra-participante-add-btn");
  var compraCompartidaTotalEl = document.getElementById("compra-compartida-total");
  var compraItemsListEl = document.getElementById("compra-items-list");
  var compraItemAddBtn = document.getElementById("compra-item-add-btn");
  var compraItemsAutocompletarBtn = document.getElementById("compra-items-autocompletar-btn");
  var submitCompraBtn = document.getElementById("submit-compra-btn");
  var cancelEditCompraBtn = document.getElementById("cancel-edit-compra-btn");
  var formTitleCompra = document.getElementById("form-title-compra");

  var comprasFilterTexto = document.getElementById("compras-filter-texto");
  var comprasFilterTarjeta = document.getElementById("compras-filter-tarjeta");
  var comprasFilterComprador = document.getElementById("compras-filter-comprador");
  var comprasFilterAcreedor = document.getElementById("compras-filter-acreedor");
  var comprasFilterFrom = document.getElementById("compras-filter-from");
  var comprasFilterTo = document.getElementById("compras-filter-to");
  var comprasFilterDatesClear = document.getElementById("compras-filter-dates-clear");

  var comprasTotalGastadoEl = document.getElementById("compras-total-gastado");
  var comprasTotalFijosEl = document.getElementById("compras-total-fijos");
  var comprasTotalSuscripcionesEl = document.getElementById("compras-total-suscripciones");
  var comprasTotalVariablesEl = document.getElementById("compras-total-variables");

  var fijosMonthsWrapper = document.getElementById("fijos-months-wrapper");
  var fijosEmptyState = document.getElementById("fijos-empty-state");
  var variablesMonthsWrapper = document.getElementById("variables-months-wrapper");
  var variablesEmptyState = document.getElementById("variables-empty-state");

  // ---------- Categoría select ----------

  function populateCategoriaSelect() {
    var previousValue = compraCategoriaSelect.value;
    compraCategoriaSelect.innerHTML = "";
    ["fijo", "suscripcion", "variable"].forEach(function (group) {
      var optgroup = document.createElement("optgroup");
      optgroup.label = CATEGORIA_GROUP_LABELS[group];
      CATEGORIAS.filter(function (c) { return c.group === group; }).forEach(function (c) {
        var opt = document.createElement("option");
        opt.value = c.id;
        opt.textContent = c.label;
        optgroup.appendChild(opt);
      });
      compraCategoriaSelect.appendChild(optgroup);
    });
    if (Array.from(compraCategoriaSelect.options).some(function (o) { return o.value === previousValue; })) {
      compraCategoriaSelect.value = previousValue;
    }
  }

  function isOtroCategoria(categoriaId) {
    return categoriaId === "otro_fijo" || categoriaId === "otra_suscripcion" || categoriaId === "otro_variable";
  }

  function selectedCategoriaGroup() {
    var cat = categoriaById(compraCategoriaSelect.value);
    return cat ? cat.group : "variable";
  }

  // Radios "¿de qué auto es este gasto?" (solo para la categoría Autos).
  function buildAutoOptions() {
    compraAutoOptionsEl.innerHTML = "";
    AUTOS.forEach(function (auto, i) {
      var label = document.createElement("label");
      label.className = "radio-option";
      var radio = document.createElement("input");
      radio.type = "radio";
      radio.name = "compra-auto";
      radio.value = auto.id;
      if (i === 0) radio.checked = true;
      label.appendChild(radio);
      label.appendChild(document.createTextNode(" " + auto.label));
      compraAutoOptionsEl.appendChild(label);
    });
  }
  buildAutoOptions();

  function selectedAuto() {
    var checked = compraAutoOptionsEl.querySelector('input[name="compra-auto"]:checked');
    return checked ? checked.value : null;
  }

  // Muestra/oculta los campos que dependen de la categoría elegida: "otro"
  // con texto libre, sub-opción de auto, recurrencia de suscripción, y
  // recordatorio de gasto fijo.
  function updateCategoriaDependentFields() {
    var catId = compraCategoriaSelect.value;
    var group = selectedCategoriaGroup();

    compraCategoriaOtherField.classList.toggle("hidden", !isOtroCategoria(catId));
    compraAutoField.classList.toggle("hidden", catId !== "autos");

    compraSuscripcionField.classList.toggle("hidden", group !== "suscripcion");
    compraSuscripcionDetalleField.classList.toggle("hidden", group !== "suscripcion" || !compraSuscripcionRepiteInput.checked);

    compraFijoRecordatorioField.classList.toggle("hidden", group !== "fijo");
    if (group === "fijo") {
      var existing = getFijoRecordatorio(catId);
      compraFijoRecordatorioHint.textContent = existing ? ("Recordatorio actual: se paga el día " + existing + " de cada mes.") : "";
    }

    // Una compra compartida no admite suscripción recurrente (son dos formas
    // distintas de generar varias compras a la vez): si está activa, la
    // sección de suscripción se mantiene oculta pase lo que pase.
    if (typeof esCompartidaActiva === "function" && esCompartidaActiva()) {
      compraSuscripcionField.classList.add("hidden");
      compraSuscripcionDetalleField.classList.add("hidden");
    }
  }

  // Las cuentas y la comida suelen ser del hogar; suscripciones y compras
  // variables suelen ser personales. Es solo el valor por defecto: siempre
  // se puede cambiar antes de guardar.
  function applyHogarDefault() {
    var esFijo = selectedCategoriaGroup() === "fijo";
    var radio = document.querySelector('input[name="compra-hogar"][value="' + (esFijo ? "si" : "no") + '"]');
    if (radio) radio.checked = true;
  }

  compraCategoriaSelect.addEventListener("change", function () {
    updateCategoriaDependentFields();
    if (!editingCompraId) applyHogarDefault();
    updateDeudaDependentFields();
  });

  compraSuscripcionRepiteInput.addEventListener("change", function () {
    compraSuscripcionDetalleField.classList.toggle("hidden", !compraSuscripcionRepiteInput.checked);
  });

  document.querySelectorAll('input[name="compra-suscripcion-modo"]').forEach(function (radio) {
    radio.addEventListener("change", function () {
      var modo = document.querySelector('input[name="compra-suscripcion-modo"]:checked').value;
      compraSuscripcionHastaFechaInput.classList.toggle("hidden", modo !== "fecha");
      compraSuscripcionMesesInput.classList.toggle("hidden", modo !== "meses");
    });
  });

  // ---------- Toggle de campos según tipo de pago / deuda ----------

  function setCompraType(type) {
    compraCuotasField.classList.toggle("hidden", type !== "cuotas");
    compraInteresField.classList.toggle("hidden", type !== "cuotas");
    if (type !== "cuotas") {
      compraCuotasCountInput.value = "";
      compraTieneInteresInput.checked = false;
    }
  }

  document.querySelectorAll('input[name="compra-type"]').forEach(function (radio) {
    radio.addEventListener("change", function () { setCompraType(radio.value); });
  });

  // ---------- Comprador / acreedor ----------
  //
  // Comprador y acreedor son independientes: se puede registrar que papá
  // compró algo y me lo debe a mí, o que yo compré algo y se lo debo a mamá.
  // El campo de texto libre "¿quién me debe?" solo hace falta cuando la
  // compra la hice yo y el deudor no es un integrante del hogar.

  function esCompraHogar() {
    var checked = document.querySelector('input[name="compra-hogar"]:checked');
    return !!checked && checked.value === "si";
  }

  function populateSobreSelect() {
    var previousValue = compraSobreSelect.value;
    compraSobreSelect.innerHTML = "";
    var autoOpt = document.createElement("option");
    autoOpt.value = "";
    autoOpt.textContent = "Automático según la categoría";
    compraSobreSelect.appendChild(autoOpt);
    sobresDeGasto().forEach(function (s) {
      var o = document.createElement("option");
      o.value = s.id;
      o.textContent = s.nombre;
      compraSobreSelect.appendChild(o);
    });
    if (Array.from(compraSobreSelect.options).some(function (o) { return o.value === previousValue; })) {
      compraSobreSelect.value = previousValue;
    }
  }

  function updateDeudaDependentFields() {
    var comprador = compraCompradorSelect.value || YO.id;
    var acreedor = compraAcreedorSelect.value || "nadie";
    var hogar = esCompraHogar();
    var esOtro = comprador === COMPRADOR_OTRO.id;

    compraCompradorOtroField.classList.toggle("hidden", !esOtro);
    if (!esOtro) compraCompradorOtroInput.value = "";

    // Si el comprador es "otra persona", ella misma es la deudora: no hace
    // falta el segundo campo de texto.
    var necesitaPersonaLibre = acreedor === "mi" && comprador === YO.id;
    compraPersonaField.classList.toggle("hidden", !necesitaPersonaLibre);
    if (!necesitaPersonaLibre) compraPersonaInput.value = "";

    // El sueldo solo cubre gastos personales míos: si la compra es para el
    // hogar o la hizo otra persona, no hay nada que descontar del sueldo.
    var mostrarOrigen = !hogar && comprador === YO.id && loadSueldo().length > 0;
    compraOrigenField.classList.toggle("hidden", !mostrarOrigen);

    var origenRadio = document.querySelector('input[name="compra-origen"]:checked');
    var pagaConSueldo = mostrarOrigen && origenRadio && origenRadio.value === "sueldo";
    compraSobreField.classList.toggle("hidden", !pagaConSueldo);
    if (pagaConSueldo) populateSobreSelect();

    var nombreComprador = esOtro
      ? (compraCompradorOtroInput.value.trim() || "esa persona")
      : personaNombre(comprador);

    if (hogar) {
      compraHogarHint.textContent = "Se sumará a los aportes al hogar de " + nombreComprador + ".";
    } else if (comprador === YO.id) {
      compraHogarHint.textContent = "Gasto personal tuyo: descuenta de tu sueldo si lo pagas con él.";
    } else {
      compraHogarHint.textContent = "Se registrará en \"Dinero de " + nombreComprador + "\".";
    }
  }

  compraCompradorSelect.addEventListener("change", updateDeudaDependentFields);
  compraCompradorOtroInput.addEventListener("input", updateDeudaDependentFields);
  compraAcreedorSelect.addEventListener("change", updateDeudaDependentFields);
  document.querySelectorAll('input[name="compra-hogar"]').forEach(function (radio) {
    radio.addEventListener("change", updateDeudaDependentFields);
  });
  document.querySelectorAll('input[name="compra-origen"]').forEach(function (radio) {
    radio.addEventListener("change", updateDeudaDependentFields);
  });

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

  // Sugiere automáticamente la fecha de pago según el día de pago de la
  // tarjeta elegida, pero solo si el usuario todavía no ha escrito una fecha
  // (para no pisarle un valor que ya haya editado a mano).
  compraMetodoPagoSelect.addEventListener("change", function () {
    if (compraFechaPagoInput.value) return;
    if (!esMetodoPagoTarjeta(compraMetodoPagoSelect.value)) return;
    var tarjeta = tarjetaById(compraMetodoPagoSelect.value);
    if (!tarjeta || !tarjeta.diaPago) return;
    var base = compraFechaInput.value || todayStamp();
    compraFechaPagoInput.value = nextOccurrenceOfDay(Number(tarjeta.diaPago), base);
  });

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
  function buildCuotaSchedule(compra) {
    var n = compra.cuotas || 1;
    var base = Math.floor((Number(compra.monto) || 0) / n);
    var baseDate = compra.fechaPago || addMonthsToIso(compra.fecha, 1);
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

  // =========================================================
  // Compra compartida entre varias personas
  //
  // En vez de inventar un modelo de deuda nuevo, una compra compartida genera
  // UNA compra normal por participante (misma fecha/categoría/método de pago,
  // pero con su propio monto). Cada una reutiliza tal cual el motor de deudas
  // que ya existe (comprasMeDeben, balanceMeDeben, "marcar pagada" con su
  // control anti-duplicado): no hace falta tocar esa lógica para que cada
  // parte se pueda pagar y marcar de forma independiente.
  // =========================================================

  var participanteRowSeq = 0;

  function esCompartidaActiva() {
    var checked = document.querySelector('input[name="compra-compartida"]:checked');
    return !!checked && checked.value === "si";
  }

  function personaPickerOptions() {
    return compradoresDisponibles().map(function (p) { return { value: p.id, label: p.nombre }; });
  }

  function participanteRowLabel(row) {
    var select = row.querySelector(".participante-persona");
    if (select.value === COMPRADOR_OTRO.id) {
      var nombre = row.querySelector(".participante-otro-nombre").value.trim();
      return nombre || "Otra persona";
    }
    var opt = select.options[select.selectedIndex];
    return opt ? opt.textContent : "Participante";
  }

  // El selector de "a quién corresponde" de cada ítem se arma a partir de las
  // filas de participantes actuales, así que hay que rehacerlo cada vez que
  // se agrega, quita o renombra un participante.
  function refreshItemParticipanteOptions() {
    var participantRows = Array.from(compraParticipantesListEl.querySelectorAll(".participante-row"));
    compraItemsListEl.querySelectorAll(".item-participante").forEach(function (sel) {
      var previous = sel.value;
      sel.innerHTML = "";
      var noneOpt = document.createElement("option");
      noneOpt.value = "";
      noneOpt.textContent = "Sin asignar";
      sel.appendChild(noneOpt);
      participantRows.forEach(function (row) {
        var o = document.createElement("option");
        o.value = row.getAttribute("data-row-id");
        o.textContent = participanteRowLabel(row);
        sel.appendChild(o);
      });
      if (Array.from(sel.options).some(function (o) { return o.value === previous; })) sel.value = previous;
    });
  }

  function recomputeCompartidaTotal() {
    var total = 0;
    compraParticipantesListEl.querySelectorAll(".participante-monto").forEach(function (inp) {
      total += Number(inp.value) || 0;
    });
    compraCompartidaTotalEl.textContent = formatCurrency(total);
    return total;
  }

  function buildParticipanteRow() {
    participanteRowSeq++;
    var rowId = "p" + participanteRowSeq;
    var row = document.createElement("div");
    row.className = "participante-row";
    row.setAttribute("data-row-id", rowId);

    var select = document.createElement("select");
    select.className = "participante-persona";
    personaPickerOptions().forEach(function (opt) {
      var o = document.createElement("option");
      o.value = opt.value;
      o.textContent = opt.label;
      select.appendChild(o);
    });
    row.appendChild(select);

    var otroInput = document.createElement("input");
    otroInput.type = "text";
    otroInput.className = "participante-otro-nombre hidden";
    otroInput.placeholder = "Nombre de la persona";
    row.appendChild(otroInput);

    var montoInput = document.createElement("input");
    montoInput.type = "number";
    montoInput.className = "participante-monto";
    montoInput.min = "0";
    montoInput.step = "1";
    montoInput.placeholder = "Su parte";
    row.appendChild(montoInput);

    var removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "btn btn-danger btn-small";
    removeBtn.textContent = "Quitar";
    row.appendChild(removeBtn);

    select.addEventListener("change", function () {
      otroInput.classList.toggle("hidden", select.value !== COMPRADOR_OTRO.id);
      refreshItemParticipanteOptions();
    });
    otroInput.addEventListener("input", refreshItemParticipanteOptions);
    montoInput.addEventListener("input", recomputeCompartidaTotal);
    removeBtn.addEventListener("click", function () {
      row.remove();
      recomputeCompartidaTotal();
      refreshItemParticipanteOptions();
    });

    return row;
  }

  function addParticipanteRow() {
    compraParticipantesListEl.appendChild(buildParticipanteRow());
    refreshItemParticipanteOptions();
  }

  function buildItemRow() {
    var row = document.createElement("div");
    row.className = "item-row";

    var desc = document.createElement("input");
    desc.type = "text";
    desc.className = "item-descripcion";
    desc.placeholder = "Ej: Detergente";
    row.appendChild(desc);

    var monto = document.createElement("input");
    monto.type = "number";
    monto.className = "item-monto";
    monto.min = "0";
    monto.step = "1";
    monto.placeholder = "Monto (opcional)";
    row.appendChild(monto);

    var sel = document.createElement("select");
    sel.className = "item-participante";
    row.appendChild(sel);

    var removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "btn btn-danger btn-small";
    removeBtn.textContent = "Quitar";
    removeBtn.addEventListener("click", function () { row.remove(); });
    row.appendChild(removeBtn);

    return row;
  }

  function addItemRow() {
    compraItemsListEl.appendChild(buildItemRow());
    refreshItemParticipanteOptions();
  }

  // Suma los ítems asignados a cada participante y llena su monto con eso.
  // Es un atajo: los montos por persona siguen siendo el dato real que se
  // guarda, así que esto no reemplaza la posibilidad de escribirlos a mano.
  function autocompletarMontosDesdeItems() {
    var sumas = {};
    Array.from(compraItemsListEl.querySelectorAll(".item-row")).forEach(function (row) {
      var rowId = row.querySelector(".item-participante").value;
      var monto = Number(row.querySelector(".item-monto").value);
      if (!rowId || !monto) return;
      sumas[rowId] = (sumas[rowId] || 0) + monto;
    });
    var huboCambios = false;
    Array.from(compraParticipantesListEl.querySelectorAll(".participante-row")).forEach(function (row) {
      var rowId = row.getAttribute("data-row-id");
      if (sumas[rowId] != null) {
        row.querySelector(".participante-monto").value = sumas[rowId];
        huboCambios = true;
      }
    });
    recomputeCompartidaTotal();
    showToast(huboCambios ? "Montos calculados desde los ítems asignados." : "Asigna ítems a un participante para poder calcular sus montos.");
  }

  function resetCompartidaLists() {
    compraParticipantesListEl.innerHTML = "";
    compraItemsListEl.innerHTML = "";
    recomputeCompartidaTotal();
  }

  // Única función que decide qué campos se ven: cuando la compra es
  // compartida, todo lo que asume "un solo comprador y un solo acreedor"
  // (monto, tipo de pago, comprador, hogar, acreedor, suscripción) se oculta
  // y lo reemplaza el bloque de participantes.
  function updateCompartidaDependentFields() {
    var activa = esCompartidaActiva();
    compraCompartidaField.classList.toggle("hidden", !activa);
    compraMontoField.classList.toggle("hidden", activa);
    compraTipoPagoField.classList.toggle("hidden", activa);
    compraCompradorField.classList.toggle("hidden", activa);
    compraHogarField.classList.toggle("hidden", activa);
    compraAcreedorField.classList.toggle("hidden", activa);

    if (activa) {
      compraCompradorOtroField.classList.add("hidden");
      compraPersonaField.classList.add("hidden");
      compraOrigenField.classList.add("hidden");
      compraSobreField.classList.add("hidden");
      compraSuscripcionField.classList.add("hidden");
      compraSuscripcionDetalleField.classList.add("hidden");
      setCompraType("unico");
      if (compraParticipantesListEl.children.length === 0) {
        addParticipanteRow();
        addParticipanteRow();
      }
    } else {
      updateDeudaDependentFields();
      updateCategoriaDependentFields();
    }
  }

  document.querySelectorAll('input[name="compra-compartida"]').forEach(function (radio) {
    radio.addEventListener("change", updateCompartidaDependentFields);
  });
  compraParticipanteAddBtn.addEventListener("click", addParticipanteRow);
  compraItemAddBtn.addEventListener("click", addItemRow);
  compraItemsAutocompletarBtn.addEventListener("click", autocompletarMontosDesdeItems);

  // Lee y valida las filas de participantes e ítems tal como están en el
  // formulario. Las filas totalmente vacías se ignoran en vez de exigir que
  // se borren a mano.
  function leerParticipantesYItems() {
    var rows = Array.from(compraParticipantesListEl.querySelectorAll(".participante-row"));
    var participantes = [];
    var vistos = {};
    var error = null;

    rows.forEach(function (row) {
      if (error) return;
      var select = row.querySelector(".participante-persona");
      var otroInput = row.querySelector(".participante-otro-nombre");
      var montoInput = row.querySelector(".participante-monto");
      var personaId = select.value;
      var esOtro = personaId === COMPRADOR_OTRO.id;
      var nombreOtro = esOtro ? otroInput.value.trim() : "";
      var monto = Number(montoInput.value);

      if (!monto && (!esOtro || !nombreOtro)) return; // fila sin usar

      if (!monto || monto <= 0) {
        error = "Cada participante necesita un monto mayor a cero.";
        return;
      }
      if (esOtro && !nombreOtro) {
        error = "Escribe el nombre de cada participante que no está en tu lista.";
        return;
      }

      var clave = esOtro ? "otro::" + nombreOtro.toLowerCase() : personaId;
      if (vistos[clave]) {
        error = "Agregaste a la misma persona más de una vez.";
        return;
      }
      vistos[clave] = true;

      participantes.push({
        personaId: personaId,
        esOtro: esOtro,
        nombre: esOtro ? nombreOtro : participanteRowLabel(row),
        monto: monto,
        rowId: row.getAttribute("data-row-id")
      });
    });

    if (!error && participantes.length < 2) {
      error = "Agrega al menos 2 personas entre las que se dividió la compra (puedes incluirte a ti).";
    }

    var items = [];
    if (!error) {
      Array.from(compraItemsListEl.querySelectorAll(".item-row")).forEach(function (row) {
        var descripcion = row.querySelector(".item-descripcion").value.trim();
        if (!descripcion) return;
        var monto = Number(row.querySelector(".item-monto").value) || null;
        var rowId = row.querySelector(".item-participante").value;
        var participante = participantes.find(function (p) { return p.rowId === rowId; });
        items.push({ descripcion: descripcion, monto: monto, paraNombre: participante ? participante.nombre : null });
      });
    }

    var total = participantes.reduce(function (sum, p) { return sum + p.monto; }, 0);
    return { valid: !error, error: error, participantes: participantes, items: items, total: total };
  }

  // Genera una compra normal por participante: la de "yo" (si corresponde)
  // es un gasto propio sin deuda; la de cada otra persona queda con
  // acreedor "mi", exactamente como cuando alguien "compra algo y me debe" —
  // por eso el resto de la app (deudas, tarjetas, estadísticas) no necesita
  // saber nada especial sobre compras compartidas para tratarlas bien.
  function submitCompartida() {
    var resultado = leerParticipantesYItems();
    if (!resultado.valid) {
      setCompraError("compra-participantes", resultado.error);
      return;
    }
    document.getElementById("error-compra-participantes").textContent = "";

    var categoria = compraCategoriaSelect.value;
    var categoriaOtro = isOtroCategoria(categoria) ? compraCategoriaOtherInput.value.trim() : null;
    var auto = categoria === "autos" ? selectedAuto() : null;
    var descripcion = compraDescripcionInput.value.trim() || null;
    var fecha = compraFechaInput.value || todayStamp();
    var fechaPago = compraFechaPagoInput.value || null;
    var metodoPagoValue = compraMetodoPagoSelect.value;
    var esTarjeta = esMetodoPagoTarjeta(metodoPagoValue);
    var notas = compraNotasInput.value.trim() || null;

    var grupoId = uid();
    var resumenParticipantes = resultado.participantes.map(function (p) {
      return { nombre: p.nombre, monto: p.monto };
    });

    var compras = loadCompras();
    resultado.participantes.forEach(function (p) {
      var esYo = p.personaId === YO.id;
      compras.push({
        id: uid(), createdAt: Date.now(),
        tipo: "unico", categoria: categoria, categoriaOtro: categoriaOtro, auto: auto,
        descripcion: descripcion, monto: p.monto, fecha: fecha, cuotas: 1, tieneInteres: false,
        fechaPago: fechaPago,
        tarjetaId: esTarjeta ? metodoPagoValue : null,
        metodoPago: esTarjeta ? null : metodoPagoValue,
        comprador: p.esOtro ? COMPRADOR_OTRO.id : p.personaId,
        compradorOtro: p.esOtro ? p.nombre : null,
        acreedor: esYo ? "nadie" : "mi",
        persona: null,
        esHogar: false,
        origenDinero: null,
        sobreId: null,
        notas: notas,
        compartidaId: grupoId,
        compartidaTotal: resultado.total,
        compartidaParticipantes: resumenParticipantes,
        items: resultado.items
      });
      if (p.esOtro) rememberPersona(p.nombre);
    });

    if (selectedCategoriaGroup() === "fijo" && compraFijoFechaPagoInput.value) {
      setFijoRecordatorio(categoria, Number(compraFijoFechaPagoInput.value.split("-")[2]));
    }

    if (saveCompras(compras)) {
      resetCompraForm();
      renderAll();
      showToast("Compra dividida entre " + resultado.participantes.length + " personas (total " + formatCurrency(resultado.total) + ").");
    }
  }

  // ---------- Validación ----------

  function clearCompraErrors() {
    ["compra-categoria-other", "compra-monto", "compra-fecha", "compra-cuotas-count", "compra-persona", "compra-suscripcion", "compra-participantes"].forEach(function (id) {
      document.getElementById("error-" + id).textContent = "";
      var input = document.getElementById(id);
      if (input) input.classList.remove("invalid");
    });
  }

  function setCompraError(fieldId, message) {
    document.getElementById("error-" + fieldId).textContent = message;
    var input = document.getElementById(fieldId);
    if (input) input.classList.add("invalid");
  }

  function validateCompraForm(data) {
    clearCompraErrors();
    var valid = true;
    // Solo se exige lo mínimo para que la compra tenga sentido: el monto y la
    // cantidad de cuotas cuando corresponde. Todo lo demás se puede saltar.
    if (data.monto === "" || isNaN(data.monto) || Number(data.monto) <= 0) {
      setCompraError("compra-monto", "Ingresa un monto válido (mayor a cero).");
      valid = false;
    }
    if (data.tipo === "cuotas" && (!data.cuotas || data.cuotas < 2)) {
      setCompraError("compra-cuotas-count", "Ingresa la cantidad de cuotas (2 o más).");
      valid = false;
    }
    if (selectedCategoriaGroup() === "suscripcion" && compraSuscripcionRepiteInput.checked) {
      var modo = document.querySelector('input[name="compra-suscripcion-modo"]:checked').value;
      if (modo === "fecha") {
        if (!compraSuscripcionHastaFechaInput.value || compraSuscripcionHastaFechaInput.value <= data.fecha) {
          setCompraError("compra-suscripcion", "Elige una fecha posterior a la fecha de la compra.");
          valid = false;
        }
      } else {
        var meses = Number(compraSuscripcionMesesInput.value);
        if (!meses || meses < 2) {
          setCompraError("compra-suscripcion", "Ingresa la cantidad de meses (2 o más).");
          valid = false;
        }
      }
    }
    return valid;
  }

  function resetCompraForm() {
    compraForm.reset();
    compraIdInput.value = "";
    editingCompraId = null;
    clearCompraErrors();
    compraFechaInput.value = todayStamp();
    populateCategoriaSelect();
    populateMetodoPagoSelect(compraMetodoPagoSelect);
    compraMetodoPagoSelect.value = "efectivo";
    populatePersonaSelects();
    compraCompradorSelect.value = YO.id;
    compraAcreedorSelect.value = "nadie";
    buildAutoOptions();
    compraSuscripcionRepiteInput.checked = false;
    compraSuscripcionMesesInput.classList.add("hidden");
    compraSuscripcionHastaFechaInput.classList.remove("hidden");
    updateCategoriaDependentFields();
    setCompraType("unico");
    applyHogarDefault();
    populateSobreSelect();
    updateDeudaDependentFields();
    resetCompartidaLists();
    compraCompartidaEditNotice.classList.add("hidden");
    updateCompartidaDependentFields();
    submitCompraBtn.textContent = "Registrar compra";
    formTitleCompra.textContent = "Registrar compra";
    cancelEditCompraBtn.classList.add("hidden");
  }

  function startEditCompra(id) {
    var compra = loadCompras().find(function (c) { return c.id === id; });
    if (!compra) return;

    editingCompraId = id;
    compraIdInput.value = id;
    document.querySelector('input[name="compra-type"][value="' + compra.tipo + '"]').checked = true;
    setCompraType(compra.tipo);
    populateCategoriaSelect();
    compraCategoriaSelect.value = compra.categoria;
    compraCategoriaOtherInput.value = compra.categoriaOtro || "";
    compraDescripcionInput.value = compra.descripcion || "";
    compraMontoInput.value = compra.monto;
    compraFechaInput.value = compra.fecha;
    compraCuotasCountInput.value = compra.cuotas > 1 ? compra.cuotas : "";
    compraTieneInteresInput.checked = !!compra.tieneInteres;
    compraFechaPagoInput.value = compra.fechaPago || "";
    populateMetodoPagoSelect(compraMetodoPagoSelect);
    compraMetodoPagoSelect.value = compra.tarjetaId || compra.metodoPago || "efectivo";
    compraSuscripcionRepiteInput.checked = false; // editar no regenera la serie, solo esta compra
    compraSuscripcionDetalleField.classList.add("hidden");
    buildAutoOptions();
    updateCategoriaDependentFields();
    if (compra.auto) {
      var autoRadio = compraAutoOptionsEl.querySelector('input[name="compra-auto"][value="' + compra.auto + '"]');
      if (autoRadio) autoRadio.checked = true;
    }
    populatePersonaSelects();
    compraCompradorSelect.value = compra.comprador || YO.id;
    compraCompradorOtroInput.value = compra.compradorOtro || "";
    compraCompradorOtroStatsInput.checked = !!compra.mostrarEnEstad;
    compraAcreedorSelect.value = compra.acreedor || "nadie";
    var hogarRadio = document.querySelector('input[name="compra-hogar"][value="' + (compra.esHogar ? "si" : "no") + '"]');
    if (hogarRadio) hogarRadio.checked = true;
    compraPersonaInput.value = compra.persona || "";
    var origenRadio = document.querySelector('input[name="compra-origen"][value="' + (compra.origenDinero || "sueldo") + '"]');
    if (origenRadio) origenRadio.checked = true;
    populateSobreSelect();
    compraSobreSelect.value = compra.sobreId || "";
    updateDeudaDependentFields();
    compraNotasInput.value = compra.notas || "";

    // Editar una compra compartida solo edita ESTA parte (comprador/acreedor
    // ya quedaron fijos al crearla); el grupo completo no se reabre para
    // edición, solo se avisa de dónde viene.
    document.querySelector('input[name="compra-compartida"][value="no"]').checked = true;
    resetCompartidaLists();
    updateCompartidaDependentFields();
    if (compra.compartidaId) {
      compraCompartidaEditNotice.textContent = "🤝 Esta compra es tu parte de una compra compartida (total del grupo " +
        formatCurrency(compra.compartidaTotal) + ", entre: " + compartidaParticipantesTexto(compra) +
        "). Para cambiar el grupo completo, elimina estas filas y regístralo de nuevo.";
      compraCompartidaEditNotice.classList.remove("hidden");
    } else {
      compraCompartidaEditNotice.classList.add("hidden");
    }

    submitCompraBtn.textContent = "Guardar cambios";
    formTitleCompra.textContent = "Editar compra";
    cancelEditCompraBtn.classList.remove("hidden");
    clearCompraErrors();
    activateTab("compras");
    compraForm.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  cancelEditCompraBtn.addEventListener("click", resetCompraForm);

  // Genera las fechas mensuales de una suscripción recurrente: la fecha de
  // la compra más las siguientes hasta la fecha límite o cantidad de meses.
  function buildSubscriptionDates(fechaInicial) {
    var modo = document.querySelector('input[name="compra-suscripcion-modo"]:checked').value;
    var dates = [fechaInicial];
    if (modo === "fecha") {
      var hasta = compraSuscripcionHastaFechaInput.value;
      var next = addMonthsToIso(fechaInicial, 1);
      var guard = 0;
      while (next <= hasta && guard < 60) {
        dates.push(next);
        next = addMonthsToIso(next, 1);
        guard++;
      }
    } else {
      var meses = Number(compraSuscripcionMesesInput.value) || 2;
      for (var i = 1; i < meses; i++) dates.push(addMonthsToIso(fechaInicial, i));
    }
    return dates;
  }

  compraForm.addEventListener("submit", function (e) {
    e.preventDefault();

    // Una compra compartida sigue un camino totalmente aparte: genera varias
    // compras (una por participante) en vez de una sola. Solo aplica al
    // registrar; editar una fila existente siempre es de a una.
    if (esCompartidaActiva() && !editingCompraId) {
      submitCompartida();
      return;
    }

    var tipo = document.querySelector('input[name="compra-type"]:checked').value;
    var comprador = compraCompradorSelect.value || YO.id;
    var acreedor = compraAcreedorSelect.value || "nadie";
    var metodoPagoValue = compraMetodoPagoSelect.value;
    var esTarjeta = esMetodoPagoTarjeta(metodoPagoValue);
    var origenRadio = document.querySelector('input[name="compra-origen"]:checked');
    var mostrandoOrigen = !compraOrigenField.classList.contains("hidden");
    var hogar = esCompraHogar();
    var origenDinero = mostrandoOrigen && origenRadio ? origenRadio.value : null;

    var data = {
      tipo: tipo,
      categoria: compraCategoriaSelect.value,
      categoriaOtro: isOtroCategoria(compraCategoriaSelect.value) ? compraCategoriaOtherInput.value.trim() : null,
      auto: compraCategoriaSelect.value === "autos" ? selectedAuto() : null,
      descripcion: compraDescripcionInput.value.trim() || null,
      monto: compraMontoInput.value,
      // Si se deja en blanco se asume hoy, en vez de bloquear el guardado.
      fecha: compraFechaInput.value || todayStamp(),
      cuotas: tipo === "cuotas" ? Number(compraCuotasCountInput.value) : 1,
      tieneInteres: tipo === "cuotas" ? compraTieneInteresInput.checked : false,
      fechaPago: compraFechaPagoInput.value || null,
      tarjetaId: esTarjeta ? metodoPagoValue : null,
      metodoPago: esTarjeta ? null : metodoPagoValue,
      comprador: comprador,
      compradorOtro: comprador === COMPRADOR_OTRO.id ? (compraCompradorOtroInput.value.trim() || null) : null,
      mostrarEnEstad: comprador === COMPRADOR_OTRO.id ? compraCompradorOtroStatsInput.checked : null,
      acreedor: acreedor,
      persona: acreedor === "mi" && comprador === YO.id ? compraPersonaInput.value.trim() : null,
      esHogar: hogar,
      origenDinero: origenDinero,
      sobreId: origenDinero === "sueldo" ? (compraSobreSelect.value || null) : null,
      notas: compraNotasInput.value.trim() || null
    };

    if (!validateCompraForm(data)) return;

    var compras = loadCompras();
    var esSuscripcionRecurrente = !editingCompraId && selectedCategoriaGroup() === "suscripcion" && compraSuscripcionRepiteInput.checked;

    if (editingCompraId) {
      var idx = compras.findIndex(function (c) { return c.id === editingCompraId; });
      if (idx !== -1) {
        compras[idx] = Object.assign({}, compras[idx], data, { lastEditedAt: Date.now() });
      }
      showToast("Compra actualizada.");
    } else if (esSuscripcionRecurrente) {
      var dates = buildSubscriptionDates(data.fecha);
      var recurrenceId = uid();
      dates.forEach(function (fecha, i) {
        compras.push(Object.assign({ id: uid(), createdAt: Date.now() }, data, {
          fecha: fecha,
          recurrenceId: recurrenceId,
          recurrenceIndex: i + 1,
          recurrenceTotal: dates.length
        }));
      });
      showToast(dates.length + " compras de suscripción generadas.");
    } else {
      compras.push(Object.assign({ id: uid(), createdAt: Date.now() }, data));
      showToast("Compra registrada.");
    }

    if (data.persona) rememberPersona(data.persona);
    if (data.compradorOtro) rememberPersona(data.compradorOtro);
    if (selectedCategoriaGroup() === "fijo" && compraFijoFechaPagoInput.value) {
      setFijoRecordatorio(data.categoria, Number(compraFijoFechaPagoInput.value.split("-")[2]));
    }

    if (saveCompras(compras)) {
      resetCompraForm();
      renderAll();
    }
  });

  // ---------- Filtros ----------

  comprasFilterTexto.addEventListener("input", renderCompras);
  comprasFilterTarjeta.addEventListener("change", renderCompras);
  comprasFilterComprador.addEventListener("change", renderCompras);
  comprasFilterAcreedor.addEventListener("change", renderCompras);
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

    var tdFecha = document.createElement("td");
    tdFecha.textContent = formatDateDisplay(compra.fecha);
    tr.appendChild(tdFecha);

    var tdDesc = document.createElement("td");
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
    if (compra.compartidaId) {
      var shareBadge = document.createElement("span");
      shareBadge.className = "compartida-badge";
      shareBadge.title = "Compra compartida entre: " + compartidaParticipantesTexto(compra);
      shareBadge.textContent = "🤝 compartida";
      tdDesc.appendChild(shareBadge);

      var shareNote = document.createElement("span");
      shareNote.className = "recurrencia-proximo";
      shareNote.textContent = "Con " + compartidaParticipantesTexto(compra) + " · total " + formatCurrency(compra.compartidaTotal);
      tdDesc.appendChild(shareNote);

      var itemsTexto = itemsResumenTexto(compra);
      if (itemsTexto) {
        var itemsNote = document.createElement("span");
        itemsNote.className = "recurrencia-proximo";
        itemsNote.textContent = "🧾 " + itemsTexto;
        tdDesc.appendChild(itemsNote);
      }
    }
    tr.appendChild(tdDesc);

    var tdCat = document.createElement("td");
    var catTag = document.createElement("span");
    catTag.className = "categoria-tag " + categoriaGroup(compra);
    catTag.textContent = categoriaLabel(compra);
    tdCat.appendChild(catTag);
    tr.appendChild(tdCat);

    var tdTarjeta = document.createElement("td");
    tdTarjeta.textContent = metodoPagoLabel(compra);
    tr.appendChild(tdTarjeta);

    var tdCuotas = document.createElement("td");
    tdCuotas.textContent = compra.cuotas > 1 ? (compra.cuotas + "x" + (compra.tieneInteres ? " · con interés" : " · sin interés")) : "Único";
    tr.appendChild(tdCuotas);

    var tdComprador = document.createElement("td");
    tdComprador.textContent = compradorNombre(compra);
    tr.appendChild(tdComprador);

    var tdDebe = document.createElement("td");
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
      thead.innerHTML = "<tr><th>Fecha</th><th>Descripción</th><th>Categoría</th><th>Método</th><th>Cuotas</th><th>Compró</th><th>Deuda</th><th class=\"col-value\">Monto</th><th class=\"col-actions\">Acciones</th></tr>";
      table.appendChild(thead);
      var tbody = document.createElement("tbody");
      items.forEach(function (c) { tbody.appendChild(buildCompraRow(c)); });
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

  document.getElementById("export-fijos-csv-btn").addEventListener("click", function () {
    var list = applyComprasFilters(loadCompras()).filter(function (c) { return categoriaGroup(c) !== "variable"; });
    exportComprasCSV(list, "gastos_fijos");
  });
  document.getElementById("export-variables-csv-btn").addEventListener("click", function () {
    var list = applyComprasFilters(loadCompras()).filter(function (c) { return categoriaGroup(c) === "variable"; });
    exportComprasCSV(list, "compras_variables");
  });

  // ---------- Render principal ----------

  function renderCompras() {
    var filtered = applyComprasFilters(loadCompras());

    var totalGastado = filtered.reduce(function (sum, c) { return sum + (Number(c.monto) || 0); }, 0);
    var totalFijos = filtered.filter(function (c) { return categoriaGroup(c) === "fijo"; }).reduce(function (sum, c) { return sum + (Number(c.monto) || 0); }, 0);
    var totalSuscripciones = filtered.filter(function (c) { return categoriaGroup(c) === "suscripcion"; }).reduce(function (sum, c) { return sum + (Number(c.monto) || 0); }, 0);
    var totalVariables = filtered.filter(function (c) { return categoriaGroup(c) === "variable"; }).reduce(function (sum, c) { return sum + (Number(c.monto) || 0); }, 0);

    comprasTotalGastadoEl.textContent = formatCurrency(totalGastado);
    comprasTotalFijosEl.textContent = formatCurrency(totalFijos);
    comprasTotalSuscripcionesEl.textContent = formatCurrency(totalSuscripciones);
    comprasTotalVariablesEl.textContent = formatCurrency(totalVariables);

    renderMonthGroups(fijosMonthsWrapper, fijosEmptyState, filtered.filter(function (c) { return categoriaGroup(c) !== "variable"; }));
    renderMonthGroups(variablesMonthsWrapper, variablesEmptyState, filtered.filter(function (c) { return categoriaGroup(c) === "variable"; }));

    populateMetodoPagoSelect(compraMetodoPagoSelect);
    refreshPersonasConocidas();
    // El selector de origen del dinero depende de si ya hay sueldo registrado.
    updateDeudaDependentFields();
  }
