"use strict";

  // =========================================================
  // CALCULADORA — armar un cobro a mano, sin sumar con la calculadora del
  // celular.
  //
  // Se elige primero una persona, y la lista muestra solo SUS compras: las
  // que ella hizo (comprador) más las que ya están marcadas como que te
  // debe (aunque las hayas comprado tú, ej. "compré esto para Colun, ella
  // me debe"). Desde esa lista se marcan a mano las que se le van a cobrar
  // ahora — a diferencia de Informes (que agrupa todo automáticamente),
  // acá el criterio de "cuáles cobrar" lo decide la persona que usa la app.
  //
  // Las compras en cuotas no se cobran completas por defecto: se ofrece
  // cobrar UNA cuota (la próxima que falta), con la opción de subir la
  // cantidad si se le quiere cobrar más de una cuota atrasada de una vez.
  // =========================================================

  var calcPersonaSelect = document.getElementById("calc-persona");
  var calcFilterTexto = document.getElementById("calc-filter-texto");
  var calcFechaDesdeInput = document.getElementById("calc-fecha-desde");
  var calcFechaHastaInput = document.getElementById("calc-fecha-hasta");
  var calcSoloMarcadasInput = document.getElementById("calc-solo-marcadas");
  var calcMostrarPagadasInput = document.getElementById("calc-mostrar-pagadas");
  var calcMostrarTodasBtn = document.getElementById("calc-mostrar-todas-btn");
  var calcVerDesgloseInput = document.getElementById("calc-ver-desglose");
  var calcDesgloseEl = document.getElementById("calc-desglose");
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

  // Cuántas cuotas cobrar de cada compra en cuotas (compraId -> cantidad).
  // Por defecto es 1 aunque no tenga entrada acá (ver montoACobrar).
  var calcCuotasCantidad = new Map();

  // Si está activo, la lista ignora el filtro de persona y muestra TODAS
  // las compras — por si algo quedó registrado a nombre de otra persona
  // (o de "Yo") pero en realidad corresponde cobrárselo/aportárselo a la
  // persona elegida arriba.
  var calcMostrarTodas = false;

  // Atajos de la lista: solo divididas recientes, o todas las compras del
  // último mes (de todas las personas).
  var calcFiltroDivididas = false;
  var calcModoUltimoMes = false;

  var calcPersonaOtroInput = document.getElementById("calc-persona-otro");
  var calcMarcarMesBtn = document.getElementById("calc-marcar-mes-btn");
  var calcDivididasBtn = document.getElementById("calc-divididas-btn");
  var calcUltimoMesBtn = document.getElementById("calc-ultimo-mes-btn");
  var calcAtajoHint = document.getElementById("calc-atajo-hint");
  var CALC_PERSONA_NUEVA = "__nueva__";

  // Personas que no están en tu lista pero ya aparecen en alguna compra
  // (como "otra persona" que compró, o a quien le prestaste plata), más los
  // nombres que la app ya conoce. Clave: "otro::<nombre en minúsculas>".
  function otrasPersonasConocidas() {
    var vistas = {};
    function agregar(nombre) {
      nombre = String(nombre || "").trim();
      if (!nombre) return;
      var key = normalizeDeudorKey(nombre);
      if (personaById(key)) return; // ya está en la lista de personas
      var clave = "otro::" + nombre.toLowerCase();
      if (!vistas[clave]) vistas[clave] = nombre;
    }
    loadCompras().forEach(function (c) {
      if (c.comprador === COMPRADOR_OTRO.id) agregar(c.compradorOtro);
      if (esMeDeben(c) && (c.comprador || YO.id) === YO.id) agregar(c.persona);
    });
    loadPersonasConocidas().forEach(agregar);
    return Object.keys(vistas).sort(function (a, b) { return vistas[a].localeCompare(vistas[b]); })
      .map(function (clave) { return { value: clave, label: vistas[clave] }; });
  }

  function renderCalculadoraFiltros() {
    if (!calcPersonaSelect) return;
    var previousValue = calcPersonaSelect.value;
    calcPersonaSelect.innerHTML = "";
    function opcion(parent, value, label) {
      var opt = document.createElement("option");
      opt.value = value;
      opt.textContent = label;
      parent.appendChild(opt);
    }
    // "Yo" va al final: el uso más común es cobrarle a otra persona, así que
    // el default (primera opción) sigue siendo un integrante del hogar. Se
    // agrega para poder revisar tus propias compras acá también — ej. las
    // que le debes a un tercero que puso la plata por una compra compartida.
    var grupoLista = document.createElement("optgroup");
    grupoLista.label = "Tu lista de personas";
    loadMiembros().concat([YO]).forEach(function (p) { opcion(grupoLista, p.id, p.nombre); });
    calcPersonaSelect.appendChild(grupoLista);
    var otras = otrasPersonasConocidas();
    if (otras.length) {
      var grupoOtras = document.createElement("optgroup");
      grupoOtras.label = "Otras personas que ya anotaste";
      otras.forEach(function (o) { opcion(grupoOtras, o.value, o.label); });
      calcPersonaSelect.appendChild(grupoOtras);
    }
    opcion(calcPersonaSelect, CALC_PERSONA_NUEVA, "✏️ Otra persona (escribir nombre)…");
    if (Array.from(calcPersonaSelect.options).some(function (o) { return o.value === previousValue; })) {
      calcPersonaSelect.value = previousValue;
    }
    calcPersonaOtroInput.classList.toggle("hidden", calcPersonaSelect.value !== CALC_PERSONA_NUEVA);
  }

  // A quién se le cobra: { id, nombre } (el id de "otras personas" es su
  // clave "otro::nombre"). Null si se eligió escribir un nombre y está vacío.
  function personaSeleccionadaCalc() {
    var v = calcPersonaSelect.value;
    if (v === CALC_PERSONA_NUEVA) {
      var nombre = calcPersonaOtroInput.value.trim();
      if (!nombre) return null;
      var registrada = personaById(normalizeDeudorKey(nombre));
      if (registrada) return { id: registrada.id, nombre: registrada.nombre };
      return { id: "otro::" + nombre.toLowerCase(), nombre: nombre };
    }
    if (v.indexOf("otro::") === 0) {
      var op = calcPersonaSelect.options[calcPersonaSelect.selectedIndex];
      return { id: v, nombre: op ? op.textContent : v.slice(6) };
    }
    var p = personaById(v);
    return p ? { id: p.id, nombre: p.nombre } : null;
  }

  // Todo lo que se puede considerar "de" esta persona: lo que ella compró,
  // más lo que ya está marcado como que te debe aunque lo hayas comprado tú.
  function comprasDePersona(personaId) {
    if (!personaId) return [];
    var esOtra = personaId.indexOf("otro::") === 0;
    var nombreOtra = esOtra ? personaId.slice(6) : null;
    return loadCompras().filter(function (c) {
      if (esCargoFuturo(c)) return false;
      if (esOtra) {
        if (compradorKey(c) === personaId) return true;
        return esMeDeben(c) && String(deudorKey(c) || "").trim().toLowerCase() === nombreOtra;
      }
      var esComprador = (c.comprador || YO.id) === personaId;
      var esDeudora = esMeDeben(c) && deudorKey(c) === personaId;
      return esComprador || esDeudora;
    });
  }

  // ¿La compra cae en los últimos períodos de facturación? Con tarjeta propia
  // se usa su ciclo real: el estado de cuenta que acaba de cerrar (el que se
  // está pagando) y el que está en curso. Sin tarjeta propia (efectivo,
  // débito, tarjeta de otra persona), desde el inicio del mes pasado.
  function enUltimosPeriodos(c) {
    var t = c.tarjetaId && esTarjetaPersonal(c.tarjetaId) ? tarjetaById(c.tarjetaId) : null;
    if (t) return primerPeriodoKeyDeCompra(c, t) >= periodoCerradoMasReciente(t).key;
    return c.fecha >= sumarMesesKey(monthKey(todayStamp()), -1) + "-01";
  }

  function textoUltimosPeriodos() {
    var tarjetas = misTarjetas();
    if (!tarjetas.length) return "desde el inicio del mes pasado";
    var keys = {};
    tarjetas.forEach(function (t) {
      keys[periodoCerradoMasReciente(t).key] = true;
      keys[periodoEnCurso(t).key] = true;
    });
    var lista = Object.keys(keys).sort().map(mesLargo);
    return "deudas de tarjeta de " + (lista.length > 1 ? lista.slice(0, -1).join(", ") + " y " + lista[lista.length - 1] : lista[0]);
  }

  function actualizarAtajosUI() {
    calcDivididasBtn.classList.toggle("btn-primary", calcFiltroDivididas);
    calcDivididasBtn.classList.toggle("btn-outline", !calcFiltroDivididas);
    calcUltimoMesBtn.classList.toggle("btn-primary", calcModoUltimoMes);
    calcUltimoMesBtn.classList.toggle("btn-outline", !calcModoUltimoMes);
    var partes = [];
    if (calcFiltroDivididas) partes.push("🤝 Solo compras divididas de las " + textoUltimosPeriodos() + ".");
    if (calcModoUltimoMes) partes.push("👥 Compras de todas las personas desde el " + formatDateDisplay(calcFechaDesdeInput.value) + " hasta hoy.");
    calcAtajoHint.textContent = partes.join(" ") + (partes.length ? " Toca el botón otra vez para quitarlo." : "");
    calcAtajoHint.classList.toggle("hidden", !partes.length);
  }

  function setMostrarTodas(valor) {
    calcMostrarTodas = valor;
    calcMostrarTodasBtn.classList.toggle("btn-primary", calcMostrarTodas);
    calcMostrarTodasBtn.classList.toggle("btn-outline", !calcMostrarTodas);
    calcMostrarTodasBtn.textContent = calcMostrarTodas
      ? "Mostrando todas las compras — volver a solo esta persona"
      : "Mostrar todas las compras";
  }

  function comprasFiltradasCalc() {
    var termino = sinTildes(calcFilterTexto.value.trim());
    var desde = calcFechaDesdeInput.value;
    var hasta = calcFechaHastaInput.value;
    var soloMarcadas = calcSoloMarcadasInput.checked;
    var mostrarPagadas = calcMostrarPagadasInput.checked;
    var persona = personaSeleccionadaCalc();
    var base = calcMostrarTodas
      ? loadCompras().filter(function (c) { return !esCargoFuturo(c); })
      : comprasDePersona(persona ? persona.id : null);
    return base.filter(function (c) {
      if (calcFiltroDivididas && (!c.compartidaId || !enUltimosPeriodos(c))) return false;
      if (soloMarcadas && !calcSeleccionadas.has(c.id)) return false;
      if (!mostrarPagadas && compraEstaPagada(c)) return false;
      if (!coincideBusqueda(c, termino)) return false;
      if (desde && c.fecha < desde) return false;
      if (hasta && c.fecha > hasta) return false;
      return true;
    }).sort(function (a, b) { return String(b.fecha).localeCompare(String(a.fecha)); });
  }

  // Las cuotas que todavía faltan por pagar, en orden (la primera es "la
  // próxima"). Vacío si no es en cuotas o si ya está completa/pagada.
  function cuotasPendientesDe(compra) {
    if (compra.tipo !== "cuotas" || compra.pagada) return [];
    return buildCuotaSchedule(compra).filter(function (c) { return !c.paid; });
  }

  // Sin nada pendiente por cobrar: en cuotas, todas sus cuotas ya están
  // pagadas (por el flag general o una por una); en pago único, el flag
  // general. Estas se ocultan por defecto para no llenar la lista de ceros.
  function compraEstaPagada(compra) {
    if (compra.tipo === "cuotas") return cuotasPendientesDe(compra).length === 0;
    return !!compra.pagada;
  }

  // Cuánto se le va a cobrar realmente a esta compra: si es en cuotas, la
  // suma de las N próximas cuotas sin pagar (N = lo elegido, 1 por
  // defecto); si no, lo que falte por pagar en total.
  function montoACobrar(compra) {
    var pendientes = cuotasPendientesDe(compra);
    if (pendientes.length > 0) {
      var cantidad = Math.max(1, Math.min(calcCuotasCantidad.get(compra.id) || 1, pendientes.length));
      return pendientes.slice(0, cantidad).reduce(function (sum, c) { return sum + c.amount; }, 0);
    }
    return pendienteTotalDeCompra(compra);
  }

  function actualizarSeleccionResumen() {
    var compras = loadCompras().filter(function (c) { return calcSeleccionadas.has(c.id); });
    var total = compras.reduce(function (sum, c) { return sum + montoACobrar(c); }, 0);
    calcSeleccionResumenEl.textContent = compras.length +
      (compras.length === 1 ? " compra marcada · " : " compras marcadas · ") + formatCurrency(total);
    renderCalcDesglose();
  }

  function buildCalcItemRow(compra) {
    var pagada = compraEstaPagada(compra);

    var row = document.createElement("div");
    row.className = "compra-mini-row calc-item-row" + (pagada ? " compra-mini-pagada" : "");

    var checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = calcSeleccionadas.has(compra.id);
    // Ya pagada = nada pendiente que cobrar: se muestra solo de referencia,
    // no se puede marcar (evita sumar $0 a la selección sin darse cuenta).
    checkbox.disabled = pagada;
    checkbox.addEventListener("change", function () {
      if (checkbox.checked) calcSeleccionadas.add(compra.id);
      else calcSeleccionadas.delete(compra.id);
      actualizarSeleccionResumen();
      if (calcSoloMarcadasInput.checked) renderCalcLista();
    });
    row.appendChild(checkbox);

    // Tocar el nombre (o cualquier parte de la fila) también marca/desmarca,
    // para no tener que apuntarle justo al cuadradito. El selector de
    // cuotas corta la propagación de su propio click (más abajo) para no
    // pelearse con esto.
    row.addEventListener("click", function (e) {
      if (pagada || e.target === checkbox) return;
      checkbox.checked = !checkbox.checked;
      checkbox.dispatchEvent(new Event("change", { bubbles: true }));
    });

    var info = document.createElement("div");
    info.className = "compra-mini-info";
    var descEl = document.createElement("span");
    descEl.className = "compra-mini-desc";
    descEl.textContent = compraDisplayName(compra);
    info.appendChild(descEl);

    var metaEl = document.createElement("span");
    metaEl.className = "compra-mini-meta";
    var metaTexto = formatDateDisplay(compra.fecha) + " · " + categoriaLabel(compra);
    if (calcMostrarTodas) metaTexto += " · Compró: " + compradorNombre(compra);
    if (pagada) metaTexto += " · Ya pagada";
    metaEl.textContent = metaTexto;
    info.appendChild(metaEl);

    var valueEl = document.createElement("span");
    valueEl.className = "compra-mini-value";

    var pendientes = cuotasPendientesDe(compra);
    if (pendientes.length > 0) {
      var totalPagadas = compra.cuotas - pendientes.length;
      var stepperRow = document.createElement("span");
      stepperRow.className = "calc-cuotas-stepper";
      var stepperTexto = document.createElement("span");
      stepperTexto.textContent = "Cuota " + (totalPagadas + 1) + " de " + compra.cuotas +
        " pendiente" + (pendientes.length > 1 ? " (quedan " + pendientes.length + " sin pagar) · Cobrar:" : " ·");
      stepperRow.appendChild(stepperTexto);

      if (pendientes.length > 1) {
        var stepperInput = document.createElement("input");
        stepperInput.type = "number";
        stepperInput.className = "calc-cuotas-input";
        stepperInput.min = "1";
        stepperInput.max = String(pendientes.length);
        stepperInput.value = String(Math.max(1, Math.min(calcCuotasCantidad.get(compra.id) || 1, pendientes.length)));
        stepperInput.addEventListener("click", function (e) { e.stopPropagation(); });
        stepperInput.addEventListener("change", function () {
          var val = Math.max(1, Math.min(pendientes.length, Number(stepperInput.value) || 1));
          stepperInput.value = String(val);
          calcCuotasCantidad.set(compra.id, val);
          valueEl.textContent = formatCurrency(montoACobrar(compra));
          actualizarSeleccionResumen();
        });
        stepperRow.appendChild(stepperInput);
        var stepperSufijo = document.createElement("span");
        stepperSufijo.textContent = "de " + pendientes.length + " cuota" + (pendientes.length === 1 ? "" : "s");
        stepperRow.appendChild(stepperSufijo);
      } else {
        var soloUna = document.createElement("span");
        soloUna.textContent = " 1 cuota";
        stepperRow.appendChild(soloUna);
      }
      info.appendChild(stepperRow);
    }

    row.appendChild(info);

    // Ya pagada: no tiene sentido mostrar "$0" pendiente — se muestra el
    // monto real de la compra, para que se entienda cuánto fue en total.
    valueEl.textContent = formatCurrency(pagada ? (Number(compra.monto) || 0) : montoACobrar(compra));
    row.appendChild(valueEl);

    return row;
  }

  // Desglose SOLO en pantalla (nunca en el comprobante impreso): cuánto de
  // lo marcado corresponde a cada tarjeta/método de pago. metodoPagoLabel
  // ya incluye el dueño de la tarjeta cuando no es propia (ej. "Santander
  // (Mamá)"), así que esto también responde "cuánto es con la tarjeta de
  // otra persona" sin tener que calcularlo aparte.
  function renderCalcDesglose() {
    if (!calcDesgloseEl) return;
    calcDesgloseEl.classList.toggle("hidden", !calcVerDesgloseInput.checked);
    if (!calcVerDesgloseInput.checked) return;

    var compras = loadCompras().filter(function (c) { return calcSeleccionadas.has(c.id); });
    calcDesgloseEl.innerHTML = "";
    if (compras.length === 0) {
      var vacio = document.createElement("p");
      vacio.className = "empty-state";
      vacio.textContent = "Marca alguna compra para ver el desglose.";
      calcDesgloseEl.appendChild(vacio);
      return;
    }

    var grupos = {};
    var orden = [];
    compras.forEach(function (c) {
      var label = metodoPagoLabel(c);
      if (!grupos[label]) { grupos[label] = 0; orden.push(label); }
      grupos[label] += montoACobrar(c);
    });

    orden.sort(function (a, b) { return grupos[b] - grupos[a]; }).forEach(function (label) {
      var fila = document.createElement("div");
      fila.className = "calc-desglose-fila";
      var nombre = document.createElement("span");
      nombre.textContent = label;
      var valor = document.createElement("span");
      valor.textContent = formatCurrency(grupos[label]);
      fila.appendChild(nombre);
      fila.appendChild(valor);
      calcDesgloseEl.appendChild(fila);
    });

    var totalFila = document.createElement("div");
    totalFila.className = "calc-desglose-fila calc-desglose-total";
    var totalLabel = document.createElement("span");
    totalLabel.textContent = "Total";
    var totalValor = document.createElement("span");
    totalValor.textContent = formatCurrency(compras.reduce(function (sum, c) { return sum + montoACobrar(c); }, 0));
    totalFila.appendChild(totalLabel);
    totalFila.appendChild(totalValor);
    calcDesgloseEl.appendChild(totalFila);
  }

  function renderCalcLista() {
    var visibles = comprasFiltradasCalc();
    calcListaEl.innerHTML = "";
    calcListaEmpty.classList.toggle("hidden", visibles.length !== 0);
    var persona = personaSeleccionadaCalc();
    calcListaEmpty.textContent = !persona && calcPersonaSelect.value === CALC_PERSONA_NUEVA
      ? "Escribe el nombre de la persona arriba."
      : !calcMostrarTodas && persona && comprasDePersona(persona.id).length === 0
        ? persona.nombre + " no tiene compras a su nombre. Toca \"Mostrar todas las compras\" para elegir qué cobrarle."
        : "No hay compras que calcen con este filtro.";
    visibles.forEach(function (c) { calcListaEl.appendChild(buildCalcItemRow(c)); });
    actualizarSeleccionResumen();
  }

  calcPersonaSelect.addEventListener("change", function () {
    // Cambiar de persona limpia la selección: mezclar compras de dos
    // personas distintas en un mismo comprobante no tendría sentido.
    calcSeleccionadas.clear();
    var escribir = calcPersonaSelect.value === CALC_PERSONA_NUEVA;
    calcPersonaOtroInput.classList.toggle("hidden", !escribir);
    if (escribir) calcPersonaOtroInput.focus();
    renderCalcLista();
  });

  calcMostrarTodasBtn.addEventListener("click", function () {
    setMostrarTodas(!calcMostrarTodas);
    if (!calcMostrarTodas && calcModoUltimoMes) {
      calcModoUltimoMes = false;
      calcFechaDesdeInput.value = "";
      calcFechaHastaInput.value = "";
    }
    actualizarAtajosUI();
    renderCalcLista();
  });

  calcPersonaOtroInput.addEventListener("input", function () {
    calcSeleccionadas.clear();
    renderCalcLista();
  });

  // 📅 Marca todo lo de este mes calendario que se ve en la lista y que
  // todavía no está pagado.
  calcMarcarMesBtn.addEventListener("click", function () {
    var mes = monthKey(todayStamp());
    var delMes = comprasFiltradasCalc().filter(function (c) { return monthKey(c.fecha) === mes && !compraEstaPagada(c); });
    if (!delMes.length) {
      showToast("No hay compras de " + mesLargo(mes) + " por cobrar en la lista.");
      return;
    }
    delMes.forEach(function (c) { calcSeleccionadas.add(c.id); });
    renderCalcLista();
    showToast("Marcadas " + delMes.length + (delMes.length === 1 ? " compra" : " compras") + " de " + mesLargo(mes) + ".");
  });

  // 🤝 Solo las compras divididas de los últimos períodos de facturación.
  calcDivididasBtn.addEventListener("click", function () {
    calcFiltroDivididas = !calcFiltroDivididas;
    actualizarAtajosUI();
    renderCalcLista();
  });

  // 👥 Todas las compras del último mes, de todas las personas (por
  // ejemplo, para que alguien elija con qué quiere ayudar).
  calcUltimoMesBtn.addEventListener("click", function () {
    calcModoUltimoMes = !calcModoUltimoMes;
    if (calcModoUltimoMes) {
      setMostrarTodas(true);
      calcFechaDesdeInput.value = addMonthsToIso(todayStamp(), -1);
      calcFechaHastaInput.value = todayStamp();
    } else {
      setMostrarTodas(false);
      calcFechaDesdeInput.value = "";
      calcFechaHastaInput.value = "";
    }
    actualizarAtajosUI();
    renderCalcLista();
  });

  calcVerDesgloseInput.addEventListener("change", renderCalcDesglose);

  [calcFilterTexto].forEach(function (el) { el.addEventListener("input", renderCalcLista); });
  [calcFechaDesdeInput, calcFechaHastaInput, calcSoloMarcadasInput, calcMostrarPagadasInput].forEach(function (el) {
    el.addEventListener("change", renderCalcLista);
  });

  calcMarcarTodoBtn.addEventListener("click", function () {
    comprasFiltradasCalc().forEach(function (c) { if (!compraEstaPagada(c)) calcSeleccionadas.add(c.id); });
    renderCalcLista();
  });

  calcDesmarcarTodoBtn.addEventListener("click", function () {
    comprasFiltradasCalc().forEach(function (c) { calcSeleccionadas.delete(c.id); });
    renderCalcLista();
  });

  // Tabla propia del comprobante (no la de Informes): acá el monto de cada
  // fila es lo que realmente se va a cobrar (una o más cuotas, elegido a
  // mano), no el total de la compra ni la próxima cuota a secas.
  function buildComprobanteTabla(compras) {
    var wrap = document.createElement("div");
    wrap.className = "table-wrapper";
    var table = document.createElement("table");
    table.className = "informe-tabla";
    var thead = document.createElement("thead");
    thead.innerHTML = "<tr><th>Fecha</th><th>Detalle</th><th class=\"col-value\">Monto a cobrar</th></tr>";
    table.appendChild(thead);

    var tbody = document.createElement("tbody");
    compras.forEach(function (c) {
      var tr = document.createElement("tr");

      var tdFecha = document.createElement("td");
      tdFecha.textContent = formatDateDisplay(c.fecha);
      tr.appendChild(tdFecha);

      var tdDetalle = document.createElement("td");
      var titulo = document.createElement("div");
      titulo.className = "informe-detalle-titulo calc-titulo-editable";
      titulo.textContent = compraDisplayName(c);
      titulo.contentEditable = "true";
      titulo.spellcheck = false;
      titulo.title = "Puedes editar este nombre — solo cambia lo que se ve/imprime acá, no toca la compra guardada.";
      tdDetalle.appendChild(titulo);

      var subPartes = [categoriaLabel(c)];
      var pendientes = cuotasPendientesDe(c);
      if (pendientes.length > 0) {
        var cantidad = Math.max(1, Math.min(calcCuotasCantidad.get(c.id) || 1, pendientes.length));
        subPartes.push("Cobrando " + cantidad + " de " + pendientes.length + " cuota" + (pendientes.length === 1 ? "" : "s") + " pendiente" + (pendientes.length === 1 ? "" : "s"));
      } else if (c.pagada) {
        subPartes.push("Ya estaba pagada — no se cobra de nuevo");
      }
      var sub = document.createElement("div");
      sub.className = "informe-detalle-sub";
      sub.textContent = subPartes.join(" · ");
      tdDetalle.appendChild(sub);

      // Compra dividida: qué le tocó a esta persona. Si no se anotaron
      // ítems suyos, se dice explícitamente (y se puede escribir a mano
      // antes de descargar el comprobante, igual que el nombre).
      if (c.compartidaId) {
        var nPersonas = (c.compartidaParticipantes || []).length || 1;
        var propios = itemsDeCompra(c);
        var itemsEl = document.createElement("div");
        itemsEl.className = "informe-detalle-sub calc-titulo-editable";
        itemsEl.contentEditable = "true";
        itemsEl.spellcheck = false;
        itemsEl.textContent = propios.length
          ? "🧾 " + propios.map(function (it) {
            if (!it.monto) return it.descripcion;
            return it.descripcion + " (" + (it.paraTodos ? "su parte: " + formatCurrency(Math.round(it.monto / nPersonas)) : formatCurrency(it.monto)) + ")";
          }).join(", ")
          : "🧾 No se agregó ítem";
        tdDetalle.appendChild(itemsEl);
      }
      tr.appendChild(tdDetalle);

      var tdMonto = document.createElement("td");
      tdMonto.className = "col-value";
      tdMonto.textContent = formatCurrency(montoACobrar(c));
      tr.appendChild(tdMonto);

      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    return wrap;
  }

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

    var hintEdicion = document.createElement("p");
    hintEdicion.className = "lede-hint calc-edicion-hint";
    hintEdicion.textContent = "💡 Puedes tocar y editar el nombre de cada compra abajo antes de imprimir — es solo para este comprobante, no cambia nada guardado en la app.";
    calcResultadoEl.appendChild(hintEdicion);

    calcResultadoEl.appendChild(buildComprobanteTabla(compras));

    var total = compras.reduce(function (sum, c) { return sum + montoACobrar(c); }, 0);
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
    var persona = personaSeleccionadaCalc();
    if (!persona) {
      showToast("Escribe el nombre de la persona a la que le vas a cobrar.");
      calcPersonaOtroInput.focus();
      return;
    }
    var compras = loadCompras().filter(function (c) { return calcSeleccionadas.has(c.id); })
      .sort(function (a, b) { return String(a.fecha).localeCompare(String(b.fecha)); });
    renderCalcResultado(persona, compras);
  });

  calcLimpiarBtn.addEventListener("click", function () {
    calcSeleccionadas.clear();
    calcCuotasCantidad.clear();
    calcFilterTexto.value = "";
    calcFechaDesdeInput.value = "";
    calcFechaHastaInput.value = "";
    calcSoloMarcadasInput.checked = false;
    calcMostrarPagadasInput.checked = false;
    setMostrarTodas(false);
    calcFiltroDivididas = false;
    calcModoUltimoMes = false;
    actualizarAtajosUI();
    calcVerDesgloseInput.checked = false;
    renderCalcLista();
    calcResultadoEl.innerHTML = "";
    calcEmptyState.textContent = "Marca las compras que quieres cobrar y toca \"Generar comprobante\".";
    calcEmptyState.classList.remove("hidden");
    calcImprimirBtn.classList.add("hidden");
  });

  calcImprimirBtn.addEventListener("click", function () {
    var persona = personaById(calcPersonaSelect.value);
    descargarPdfDe(calcResultadoEl, "Cobro_" + (persona ? persona.nombre : "persona"), calcImprimirBtn);
  });

  renderCalcLista();
