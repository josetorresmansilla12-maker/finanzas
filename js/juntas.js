"use strict";

  // =========================================================
  // JUNTAS — gastos compartidos entre amigos (no confundir con "compra
  // compartida" de Compras, que es para el hogar y sí genera deuda de
  // verdad dentro de la app). Acá los nombres son libres (no hace falta
  // que sean personas registradas) y no se integra con Deudas: es un
  // cálculo autocontenido para saber quién puso de más y a quién hay que
  // devolverle, más una boleta lista para imprimir o guardar como PDF.
  // =========================================================

  var juntaForm = document.getElementById("junta-form");
  var juntaIdInput = document.getElementById("junta-id");
  var juntaNombreInput = document.getElementById("junta-nombre");
  var juntaFechaInput = document.getElementById("junta-fecha");
  var juntaParticipantesListEl = document.getElementById("junta-participantes-list");
  var juntaParticipanteAddBtn = document.getElementById("junta-participante-add-btn");
  var juntaAportesTotalEl = document.getElementById("junta-aportes-total");
  var juntaMontoInput = document.getElementById("junta-monto");
  var juntaItemsListEl = document.getElementById("junta-items-list");
  var juntaItemAddBtn = document.getElementById("junta-item-add-btn");
  var juntaItemsAutocompletarBtn = document.getElementById("junta-items-autocompletar-btn");
  var juntaNotasInput = document.getElementById("junta-notas");
  var submitJuntaBtn = document.getElementById("submit-junta-btn");
  var cancelEditJuntaBtn = document.getElementById("cancel-edit-junta-btn");
  var formTitleJunta = document.getElementById("form-title-junta");

  var juntaResultadoEl = document.getElementById("junta-resultado");
  var juntaResultadoEmpty = document.getElementById("junta-resultado-empty");
  var juntaImprimirBtn = document.getElementById("junta-imprimir-btn");

  var juntasListaEl = document.getElementById("juntas-lista");
  var juntasListaEmpty = document.getElementById("juntas-lista-empty");

  // ---------- Filas de participantes ----------

  function buildParticipanteJuntaRow(nombre, aporte) {
    var row = document.createElement("div");
    row.className = "junta-participante-row";

    var nombreInput = document.createElement("input");
    nombreInput.type = "text";
    nombreInput.className = "junta-participante-nombre";
    nombreInput.placeholder = "Nombre";
    nombreInput.value = nombre || "";
    row.appendChild(nombreInput);

    var aporteInput = document.createElement("input");
    aporteInput.type = "number";
    aporteInput.className = "junta-participante-aporte";
    aporteInput.placeholder = "Aportó";
    aporteInput.min = "0";
    aporteInput.step = "1";
    if (aporte) aporteInput.value = aporte;
    aporteInput.addEventListener("input", recomputeAportesTotal);
    row.appendChild(aporteInput);

    var removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "btn btn-danger btn-small";
    removeBtn.textContent = "Quitar";
    removeBtn.addEventListener("click", function () {
      row.remove();
      recomputeAportesTotal();
    });
    row.appendChild(removeBtn);

    return row;
  }

  function addParticipanteJuntaRow(nombre, aporte) {
    juntaParticipantesListEl.appendChild(buildParticipanteJuntaRow(nombre, aporte));
  }

  function recomputeAportesTotal() {
    var total = Array.from(juntaParticipantesListEl.querySelectorAll(".junta-participante-aporte"))
      .reduce(function (sum, input) { return sum + (Number(input.value) || 0); }, 0);
    juntaAportesTotalEl.textContent = formatCurrency(total);
  }

  juntaParticipanteAddBtn.addEventListener("click", function () { addParticipanteJuntaRow("", ""); });

  // ---------- Filas de ítems (opcional) ----------

  function buildItemJuntaRow(descripcion, monto) {
    var row = document.createElement("div");
    row.className = "junta-item-row";

    var descInput = document.createElement("input");
    descInput.type = "text";
    descInput.className = "junta-item-descripcion";
    descInput.placeholder = "Ej: Pizza";
    descInput.value = descripcion || "";
    descInput.addEventListener("blur", function () { descInput.value = corregirOrtografia(descInput.value); });
    row.appendChild(descInput);

    var montoInput = document.createElement("input");
    montoInput.type = "number";
    montoInput.className = "junta-item-monto";
    montoInput.placeholder = "Monto";
    montoInput.min = "0";
    montoInput.step = "1";
    if (monto) montoInput.value = monto;
    row.appendChild(montoInput);

    var removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "btn btn-danger btn-small";
    removeBtn.textContent = "Quitar";
    removeBtn.addEventListener("click", function () { row.remove(); });
    row.appendChild(removeBtn);

    return row;
  }

  function addItemJuntaRow(descripcion, monto) {
    juntaItemsListEl.appendChild(buildItemJuntaRow(descripcion, monto));
  }

  juntaItemAddBtn.addEventListener("click", function () { addItemJuntaRow("", ""); });

  juntaItemsAutocompletarBtn.addEventListener("click", function () {
    var total = Array.from(juntaItemsListEl.querySelectorAll(".junta-item-monto"))
      .reduce(function (sum, input) { return sum + (Number(input.value) || 0); }, 0);
    if (total > 0) juntaMontoInput.value = total;
  });

  // ---------- Leer el formulario ----------

  function leerParticipantesJunta() {
    return Array.from(juntaParticipantesListEl.querySelectorAll(".junta-participante-row")).map(function (row) {
      var nombre = row.querySelector(".junta-participante-nombre").value.trim();
      var aporte = Number(row.querySelector(".junta-participante-aporte").value) || 0;
      return { nombre: nombre, aporte: aporte };
    }).filter(function (p) { return p.nombre; }); // una fila sin nombre no cuenta como participante
  }

  function leerItemsJunta() {
    return Array.from(juntaItemsListEl.querySelectorAll(".junta-item-row")).map(function (row) {
      var descripcion = row.querySelector(".junta-item-descripcion").value.trim();
      var monto = Number(row.querySelector(".junta-item-monto").value) || null;
      return { descripcion: descripcion, monto: monto };
    }).filter(function (it) { return it.descripcion; });
  }

  // ---------- Cálculo de saldos y transferencias ----------

  // Se asume que el gasto se reparte en partes iguales entre todos los que
  // participaron. Comparando lo que cada uno aportó contra esa parte igual
  // sale quién puso de más (le deben) y quién puso de menos (debe).
  function calcularSaldosJunta(junta) {
    var n = junta.participantes.length;
    if (n === 0) return [];
    var parte = junta.total / n;
    return junta.participantes.map(function (p) {
      var diferencia = p.aporte - parte;
      return { nombre: p.nombre, aporte: p.aporte, parte: parte, diferencia: diferencia };
    });
  }

  // Algoritmo simple de "quién le paga a quién" para saldar cuentas con la
  // menor cantidad de transferencias: se cruza siempre el mayor deudor con
  // el mayor acreedor hasta que no quede nadie con saldo pendiente.
  function calcularTransferenciasJunta(saldos) {
    var deudores = saldos.filter(function (s) { return s.diferencia < -0.5; })
      .map(function (s) { return { nombre: s.nombre, monto: -s.diferencia }; })
      .sort(function (a, b) { return b.monto - a.monto; });
    var acreedores = saldos.filter(function (s) { return s.diferencia > 0.5; })
      .map(function (s) { return { nombre: s.nombre, monto: s.diferencia }; })
      .sort(function (a, b) { return b.monto - a.monto; });

    var transferencias = [];
    var i = 0, j = 0;
    while (i < deudores.length && j < acreedores.length) {
      var d = deudores[i], a = acreedores[j];
      var monto = Math.min(d.monto, a.monto);
      if (monto > 0.5) transferencias.push({ de: d.nombre, a: a.nombre, monto: Math.round(monto) });
      d.monto -= monto;
      a.monto -= monto;
      if (d.monto <= 0.5) i++;
      if (a.monto <= 0.5) j++;
    }
    return transferencias;
  }

  // ---------- Boleta (compartida entre "recién generada" y "junta guardada") ----------

  function buildBoletaJunta(junta) {
    var wrap = document.createElement("div");

    var header = document.createElement("div");
    header.className = "informe-report-header";
    var h2 = document.createElement("h2");
    h2.textContent = junta.nombre || "Boleta de junta";
    header.appendChild(h2);
    var meta = document.createElement("p");
    meta.className = "informe-report-meta";
    meta.textContent = formatDateDisplay(junta.fecha) + " · " + junta.participantes.length +
      (junta.participantes.length === 1 ? " participante" : " participantes") + " · Total " + formatCurrency(junta.total);
    header.appendChild(meta);
    if (junta.notas) {
      var notas = document.createElement("p");
      notas.className = "informe-report-fecha";
      notas.textContent = junta.notas;
      header.appendChild(notas);
    }
    wrap.appendChild(header);

    // Ítems (si se ingresaron)
    if (junta.items && junta.items.length > 0) {
      var itemsTitulo = document.createElement("h3");
      itemsTitulo.className = "informe-grupo-titulo";
      itemsTitulo.textContent = "Detalle de la compra";
      wrap.appendChild(itemsTitulo);

      var itemsWrap = document.createElement("div");
      itemsWrap.className = "table-wrapper";
      var itemsTable = document.createElement("table");
      itemsTable.className = "informe-tabla";
      itemsTable.innerHTML = "<thead><tr><th>Ítem</th><th class=\"col-value\">Monto</th></tr></thead>";
      var itemsBody = document.createElement("tbody");
      junta.items.forEach(function (it) {
        var tr = document.createElement("tr");
        var tdDesc = document.createElement("td");
        tdDesc.textContent = it.descripcion;
        tr.appendChild(tdDesc);
        var tdMonto = document.createElement("td");
        tdMonto.className = "col-value";
        tdMonto.textContent = it.monto ? formatCurrency(it.monto) : "—";
        tr.appendChild(tdMonto);
        itemsBody.appendChild(tr);
      });
      itemsTable.appendChild(itemsBody);
      itemsWrap.appendChild(itemsTable);
      wrap.appendChild(itemsWrap);
    }

    // Participantes y aportes
    var saldos = calcularSaldosJunta(junta);
    var partTitulo = document.createElement("h3");
    partTitulo.className = "informe-grupo-titulo";
    partTitulo.textContent = "Participantes y aportes";
    wrap.appendChild(partTitulo);

    var partWrap = document.createElement("div");
    partWrap.className = "table-wrapper";
    var partTable = document.createElement("table");
    partTable.className = "informe-tabla";
    partTable.innerHTML = "<thead><tr><th>Nombre</th><th class=\"col-value\">Aportó</th><th class=\"col-value\">Le corresponde</th><th>Estado</th></tr></thead>";
    var partBody = document.createElement("tbody");
    saldos.forEach(function (s) {
      var tr = document.createElement("tr");
      var tdNombre = document.createElement("td");
      tdNombre.textContent = s.nombre;
      tr.appendChild(tdNombre);
      var tdAporte = document.createElement("td");
      tdAporte.className = "col-value";
      tdAporte.textContent = formatCurrency(s.aporte);
      tr.appendChild(tdAporte);
      var tdParte = document.createElement("td");
      tdParte.className = "col-value";
      tdParte.textContent = formatCurrency(s.parte);
      tr.appendChild(tdParte);
      var tdEstado = document.createElement("td");
      var tag = document.createElement("span");
      if (s.diferencia > 0.5) {
        tag.className = "due-badge ok";
        tag.textContent = "Le deben " + formatCurrency(s.diferencia);
      } else if (s.diferencia < -0.5) {
        tag.className = "due-badge overdue";
        tag.textContent = "Debe " + formatCurrency(-s.diferencia);
      } else {
        tag.className = "due-badge ok";
        tag.textContent = "Justo";
      }
      tdEstado.appendChild(tag);
      tr.appendChild(tdEstado);
      partBody.appendChild(tr);
    });
    partTable.appendChild(partBody);
    partWrap.appendChild(partTable);
    wrap.appendChild(partWrap);

    // Total aportado vs. total gastado, si no calzan
    var totalAportado = junta.participantes.reduce(function (sum, p) { return sum + (Number(p.aporte) || 0); }, 0);
    if (Math.round(totalAportado) !== Math.round(junta.total)) {
      var diffNota = document.createElement("p");
      diffNota.className = "deuda-card-nota aviso";
      diffNota.textContent = totalAportado > junta.total
        ? "⚠️ Los aportes suman " + formatCurrency(totalAportado) + ", " + formatCurrency(totalAportado - junta.total) + " más que el total gastado — puede que sobre vuelto por repartir."
        : "⚠️ Los aportes suman " + formatCurrency(totalAportado) + ", " + formatCurrency(junta.total - totalAportado) + " menos que el total gastado — falta cubrir esa diferencia (quizás alguien pagó de más sin registrar su aporte).";
      wrap.appendChild(diffNota);
    }

    // Transferencias sugeridas para saldar cuentas
    var transferencias = calcularTransferenciasJunta(saldos);
    if (transferencias.length > 0) {
      var transTitulo = document.createElement("h3");
      transTitulo.className = "informe-grupo-titulo";
      transTitulo.textContent = "Para quedar a mano";
      wrap.appendChild(transTitulo);

      var transList = document.createElement("div");
      transList.className = "informe-destinatario-lista";
      transferencias.forEach(function (t) {
        var fila = document.createElement("div");
        fila.className = "informe-destinatario-fila";
        var texto = document.createElement("span");
        texto.textContent = t.de + " → " + t.a;
        var valor = document.createElement("span");
        valor.innerHTML = "<strong>" + formatCurrency(t.monto) + "</strong>";
        fila.appendChild(texto);
        fila.appendChild(valor);
        transList.appendChild(fila);
      });
      wrap.appendChild(transList);
    }

    return wrap;
  }

  function mostrarBoletaJunta(junta) {
    juntaResultadoEl.innerHTML = "";
    juntaResultadoEl.appendChild(buildBoletaJunta(junta));
    juntaResultadoEmpty.classList.add("hidden");
    juntaImprimirBtn.classList.remove("hidden");
    juntaResultadoEl.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  juntaImprimirBtn.addEventListener("click", function () { window.print(); });

  // ---------- Formulario: crear / editar ----------

  function resetJuntaForm() {
    juntaForm.reset();
    juntaIdInput.value = "";
    editingJuntaId = null;
    document.getElementById("error-junta-monto").textContent = "";
    document.getElementById("error-junta-participantes").textContent = "";
    juntaFechaInput.value = todayStamp();
    juntaParticipantesListEl.innerHTML = "";
    addParticipanteJuntaRow("", "");
    addParticipanteJuntaRow("", "");
    recomputeAportesTotal();
    juntaItemsListEl.innerHTML = "";
    submitJuntaBtn.textContent = "Generar boleta";
    formTitleJunta.textContent = "🎉 Registrar junta";
    cancelEditJuntaBtn.classList.add("hidden");
  }

  function startEditJunta(id) {
    var junta = loadJuntas().find(function (j) { return j.id === id; });
    if (!junta) return;

    editingJuntaId = id;
    juntaIdInput.value = id;
    juntaNombreInput.value = junta.nombre || "";
    juntaFechaInput.value = junta.fecha || todayStamp();
    juntaMontoInput.value = junta.total;
    juntaNotasInput.value = junta.notas || "";

    juntaParticipantesListEl.innerHTML = "";
    junta.participantes.forEach(function (p) { addParticipanteJuntaRow(p.nombre, p.aporte || ""); });
    recomputeAportesTotal();

    juntaItemsListEl.innerHTML = "";
    (junta.items || []).forEach(function (it) { addItemJuntaRow(it.descripcion, it.monto || ""); });

    submitJuntaBtn.textContent = "Guardar cambios";
    formTitleJunta.textContent = "Editar junta";
    cancelEditJuntaBtn.classList.remove("hidden");
    clearJuntaErrors();
    activateTab("juntas");
    juntaForm.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function clearJuntaErrors() {
    document.getElementById("error-junta-monto").textContent = "";
    document.getElementById("error-junta-participantes").textContent = "";
  }

  cancelEditJuntaBtn.addEventListener("click", resetJuntaForm);

  juntaForm.addEventListener("submit", function (e) {
    e.preventDefault();
    clearJuntaErrors();

    var participantes = leerParticipantesJunta();
    var total = Number(juntaMontoInput.value);
    var valido = true;

    if (!total || total <= 0) {
      document.getElementById("error-junta-monto").textContent = "Ingresa el monto total de la compra (mayor a cero).";
      valido = false;
    }
    if (participantes.length === 0) {
      document.getElementById("error-junta-participantes").textContent = "Agrega al menos un participante con nombre.";
      valido = false;
    }
    if (!valido) return;

    var junta = {
      id: editingJuntaId || uid(),
      nombre: juntaNombreInput.value.trim() || null,
      fecha: juntaFechaInput.value || todayStamp(),
      total: total,
      participantes: participantes,
      items: leerItemsJunta(),
      notas: juntaNotasInput.value.trim() || null,
      createdAt: editingJuntaId ? undefined : Date.now()
    };

    var juntas = loadJuntas();
    if (editingJuntaId) {
      var idx = juntas.findIndex(function (j) { return j.id === editingJuntaId; });
      if (idx !== -1) {
        junta.createdAt = juntas[idx].createdAt;
        juntas[idx] = junta;
      }
    } else {
      juntas.push(junta);
    }

    if (saveJuntas(juntas)) {
      mostrarBoletaJunta(junta);
      renderJuntasLista();
      showToast(editingJuntaId ? "Junta actualizada." : "Junta guardada.");
      resetJuntaForm();
    }
  });

  // ---------- Historial de juntas ----------

  function buildJuntaHistorialRow(junta) {
    var card = document.createElement("details");
    card.className = "deuda-card";

    var head = document.createElement("summary");
    head.className = "deuda-card-head";

    var titleWrap = document.createElement("div");
    titleWrap.className = "deuda-card-title-wrap";
    var titleEl = document.createElement("div");
    titleEl.className = "deuda-card-title";
    titleEl.textContent = junta.nombre || "Junta sin nombre";
    titleWrap.appendChild(titleEl);
    var subEl = document.createElement("div");
    subEl.className = "deuda-card-subtitle";
    subEl.textContent = formatDateDisplay(junta.fecha) + " · " + junta.participantes.length +
      (junta.participantes.length === 1 ? " participante" : " participantes");
    titleWrap.appendChild(subEl);
    head.appendChild(titleWrap);

    var stats = document.createElement("div");
    stats.className = "deuda-card-stats";
    var stat = document.createElement("div");
    stat.className = "deuda-stat";
    var label = document.createElement("span");
    label.className = "deuda-stat-label";
    label.textContent = "Total";
    var value = document.createElement("span");
    value.className = "deuda-stat-value al-dia";
    value.textContent = formatCurrency(junta.total);
    stat.appendChild(label);
    stat.appendChild(value);
    stats.appendChild(stat);
    head.appendChild(stats);
    card.appendChild(head);

    var body = document.createElement("div");
    body.className = "deuda-card-body";

    var actions = document.createElement("div");
    actions.className = "tarjeta-card-actions";
    var verBtn = document.createElement("button");
    verBtn.type = "button";
    verBtn.className = "btn btn-primary btn-small";
    verBtn.textContent = "Ver / imprimir boleta";
    verBtn.addEventListener("click", function () { mostrarBoletaJunta(junta); });
    actions.appendChild(verBtn);

    var editarBtn = document.createElement("button");
    editarBtn.type = "button";
    editarBtn.className = "btn btn-secondary btn-small";
    editarBtn.textContent = "Editar";
    editarBtn.addEventListener("click", function () { startEditJunta(junta.id); });
    actions.appendChild(editarBtn);

    var eliminarBtn = document.createElement("button");
    eliminarBtn.type = "button";
    eliminarBtn.className = "btn btn-danger btn-small";
    eliminarBtn.textContent = "Eliminar";
    eliminarBtn.addEventListener("click", function () { requestDelete("junta", junta.id); });
    actions.appendChild(eliminarBtn);

    body.appendChild(actions);

    var resumen = document.createElement("p");
    resumen.className = "lede-hint";
    resumen.textContent = junta.participantes.map(function (p) {
      return p.nombre + " (" + formatCurrency(p.aporte || 0) + ")";
    }).join(" · ");
    body.appendChild(resumen);

    card.appendChild(body);
    return card;
  }

  function renderJuntasLista() {
    if (!juntasListaEl) return;
    var juntas = loadJuntas().slice().sort(function (a, b) { return String(b.fecha).localeCompare(String(a.fecha)) || (b.createdAt || 0) - (a.createdAt || 0); });
    juntasListaEmpty.classList.toggle("hidden", juntas.length !== 0);
    juntasListaEl.innerHTML = "";
    juntas.forEach(function (j) { juntasListaEl.appendChild(buildJuntaHistorialRow(j)); });
  }

  resetJuntaForm();
