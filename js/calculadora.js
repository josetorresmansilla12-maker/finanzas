"use strict";

  // =========================================================
  // CALCULADORA — armar un cobro a mano, sin sumar con la calculadora del
  // celular.
  //
  // A diferencia de Informes (que agrupa automáticamente según cómo quedó
  // registrada cada compra), acá la selección es 100% manual: se elige una
  // persona solo para el título del comprobante, y se marcan las compras
  // que se quieran cobrar sin importar su comprador/acreedor original — útil
  // para juntar en una sola cuenta cosas que nunca se etiquetaron como
  // deuda de esa persona.
  // =========================================================

  var calcPersonaSelect = document.getElementById("calc-persona");
  var calcFilterTexto = document.getElementById("calc-filter-texto");
  var calcFechaDesdeInput = document.getElementById("calc-fecha-desde");
  var calcFechaHastaInput = document.getElementById("calc-fecha-hasta");
  var calcSoloMarcadasInput = document.getElementById("calc-solo-marcadas");
  var calcSeleccionResumenEl = document.getElementById("calc-seleccion-resumen");
  var calcMarcarTodoBtn = document.getElementById("calc-marcar-todo-btn");
  var calcDesmarcarTodoBtn = document.getElementById("calc-desmarcar-todo-btn");
  var calcListaEl = document.getElementById("calc-lista");
  var calcListaEmpty = document.getElementById("calc-lista-empty");
  var calcGenerarBtn = document.getElementById("calc-generar-btn");
  var calcLimpiarBtn = document.getElementById("calc-limpiar-btn");
  var calcResultadoEl = document.getElementById("calc-resultado");
  var calcEmptyState = document.getElementById("calc-empty-state");
  var calcImprimirBtn = document.getElementById("calc-imprimir-btn");

  // IDs de las compras marcadas. Vive aparte del DOM para no perderse al
  // cambiar los filtros de búsqueda (marcar algo, buscar otra cosa, marcar
  // más, sin que lo anterior se borre).
  var calcSeleccionadas = new Set();

  (function initFechasPorDefecto() {
    var rango = primerYUltimoDiaMes();
    calcFechaDesdeInput.value = rango.desde;
    calcFechaHastaInput.value = rango.hasta;
  })();

  function renderCalculadoraFiltros() {
    if (!calcPersonaSelect) return;
    var previousValue = calcPersonaSelect.value;
    calcPersonaSelect.innerHTML = "";
    loadMiembros().forEach(function (p) {
      var opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.nombre;
      calcPersonaSelect.appendChild(opt);
    });
    if (Array.from(calcPersonaSelect.options).some(function (o) { return o.value === previousValue; })) {
      calcPersonaSelect.value = previousValue;
    }
  }

  function comprasFiltradasCalc() {
    var termino = sinTildes(calcFilterTexto.value.trim());
    var desde = calcFechaDesdeInput.value;
    var hasta = calcFechaHastaInput.value;
    var soloMarcadas = calcSoloMarcadasInput.checked;
    return loadCompras().filter(function (c) {
      if (esCargoFuturo(c)) return false;
      if (soloMarcadas && !calcSeleccionadas.has(c.id)) return false;
      if (!coincideBusqueda(c, termino)) return false;
      if (desde && c.fecha < desde) return false;
      if (hasta && c.fecha > hasta) return false;
      return true;
    }).sort(function (a, b) { return String(b.fecha).localeCompare(String(a.fecha)); });
  }

  function actualizarSeleccionResumen() {
    var compras = loadCompras();
    var seleccionadas = compras.filter(function (c) { return calcSeleccionadas.has(c.id); });
    var total = seleccionadas.reduce(function (sum, c) { return sum + (Number(c.monto) || 0); }, 0);
    calcSeleccionResumenEl.textContent = seleccionadas.length +
      (seleccionadas.length === 1 ? " compra marcada · " : " compras marcadas · ") + formatCurrency(total);
  }

  function buildCalcItemRow(compra) {
    var row = document.createElement("label");
    row.className = "compra-mini-row calc-item-row";

    var checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = calcSeleccionadas.has(compra.id);
    checkbox.addEventListener("change", function () {
      if (checkbox.checked) calcSeleccionadas.add(compra.id);
      else calcSeleccionadas.delete(compra.id);
      actualizarSeleccionResumen();
      if (calcSoloMarcadasInput.checked) renderCalcLista();
    });
    row.appendChild(checkbox);

    var info = document.createElement("div");
    info.className = "compra-mini-info";
    var descEl = document.createElement("span");
    descEl.className = "compra-mini-desc";
    descEl.textContent = compraDisplayName(compra);
    var metaEl = document.createElement("span");
    metaEl.className = "compra-mini-meta";
    metaEl.textContent = formatDateDisplay(compra.fecha) + " · " + categoriaLabel(compra) +
      (compra.pagada ? " · Ya pagada" : "");
    info.appendChild(descEl);
    info.appendChild(metaEl);
    row.appendChild(info);

    var valueEl = document.createElement("span");
    valueEl.className = "compra-mini-value";
    valueEl.textContent = formatCurrency(compra.monto);
    row.appendChild(valueEl);

    return row;
  }

  function renderCalcLista() {
    var visibles = comprasFiltradasCalc();
    calcListaEl.innerHTML = "";
    calcListaEmpty.classList.toggle("hidden", visibles.length !== 0);
    visibles.forEach(function (c) { calcListaEl.appendChild(buildCalcItemRow(c)); });
    actualizarSeleccionResumen();
  }

  [calcFilterTexto].forEach(function (el) { el.addEventListener("input", renderCalcLista); });
  [calcFechaDesdeInput, calcFechaHastaInput, calcSoloMarcadasInput].forEach(function (el) {
    el.addEventListener("change", renderCalcLista);
  });

  calcMarcarTodoBtn.addEventListener("click", function () {
    comprasFiltradasCalc().forEach(function (c) { calcSeleccionadas.add(c.id); });
    renderCalcLista();
  });

  calcDesmarcarTodoBtn.addEventListener("click", function () {
    comprasFiltradasCalc().forEach(function (c) { calcSeleccionadas.delete(c.id); });
    renderCalcLista();
  });

  function renderCalcResultado(persona, compras) {
    calcResultadoEl.innerHTML = "";

    if (compras.length === 0) {
      calcEmptyState.textContent = "Marca al menos una compra antes de generar el comprobante.";
      calcEmptyState.classList.remove("hidden");
      calcImprimirBtn.classList.add("hidden");
      return;
    }
    calcEmptyState.classList.add("hidden");

    var header = document.createElement("div");
    header.className = "informe-report-header";
    var h2 = document.createElement("h2");
    h2.textContent = "Comprobante de cobro";
    header.appendChild(h2);
    var meta = document.createElement("p");
    meta.className = "informe-report-meta";
    meta.textContent = "Para: " + persona.nombre + " · " + compras.length +
      (compras.length === 1 ? " compra seleccionada" : " compras seleccionadas");
    header.appendChild(meta);
    var fechaGen = document.createElement("p");
    fechaGen.className = "informe-report-fecha";
    fechaGen.textContent = "Generado el " + nowDisplayDateTime();
    header.appendChild(fechaGen);
    calcResultadoEl.appendChild(header);

    // Reusa el mismo armado de tabla que Informes (fecha/detalle/estado/
    // monto, con el detalle de cuotas si aplica) para que ambos documentos
    // se vean iguales y consistentes.
    calcResultadoEl.appendChild(buildInformeTabla(compras));

    // El total a cobrar es lo que realmente falta por pagar de cada compra
    // (no el monto en bruto): si alguna ya está pagada o trae cuotas ya
    // abonadas, no se vuelve a cobrar esa parte.
    var total = compras.reduce(function (sum, c) { return sum + pendienteTotalDeCompra(c); }, 0);
    var resumen = document.createElement("div");
    resumen.className = "informe-total-general";
    var fila = document.createElement("div");
    fila.className = "informe-total-fila";
    var label = document.createElement("span");
    label.className = "informe-total-fila-label";
    label.textContent = "Total a cobrarle a " + persona.nombre;
    var valor = document.createElement("span");
    valor.className = "informe-total-fila-valores";
    valor.innerHTML = "<strong>" + formatCurrency(total) + "</strong>";
    fila.appendChild(label);
    fila.appendChild(valor);
    resumen.appendChild(fila);
    calcResultadoEl.appendChild(resumen);

    calcImprimirBtn.classList.remove("hidden");
  }

  calcGenerarBtn.addEventListener("click", function () {
    var personaId = calcPersonaSelect.value;
    var persona = personaById(personaId);
    if (!persona) {
      showToast("Agrega primero una persona en Tarjetas → Personas.");
      return;
    }
    var compras = loadCompras().filter(function (c) { return calcSeleccionadas.has(c.id); })
      .sort(function (a, b) { return String(a.fecha).localeCompare(String(b.fecha)); });
    renderCalcResultado(persona, compras);
  });

  calcLimpiarBtn.addEventListener("click", function () {
    calcSeleccionadas.clear();
    calcFilterTexto.value = "";
    var rango = primerYUltimoDiaMes();
    calcFechaDesdeInput.value = rango.desde;
    calcFechaHastaInput.value = rango.hasta;
    calcSoloMarcadasInput.checked = false;
    renderCalcLista();
    calcResultadoEl.innerHTML = "";
    calcEmptyState.textContent = "Marca las compras que quieres cobrar y toca \"Generar comprobante\".";
    calcEmptyState.classList.remove("hidden");
    calcImprimirBtn.classList.add("hidden");
  });

  calcImprimirBtn.addEventListener("click", function () { window.print(); });

  renderCalcLista();
