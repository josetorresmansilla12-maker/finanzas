"use strict";

  // =========================================================
  // REGISTRAR COMPRAS — por día, varias de una vez
  //
  // Pensado para quien anota las compras después (ej. las de los últimos
  // tres días): se elige el día y con qué se pagó UNA vez, y debajo se van
  // agregando todas las compras de ese día, una fila por compra, para
  // guardarlas juntas al final.
  //
  // Cada fila pregunta lo justo, con lenguaje de todos los días:
  // - ¿De quién es esta compra? (mía, de la casa, de papá…)
  // - ¿Quién la pagó? (sale sola según la tarjeta, se puede cambiar)
  // y la app dice en una línea qué significa ("Papá te debe $45.000"). Por
  // dentro eso se traduce al mismo modelo de siempre (comprador, acreedor,
  // hogar), así que deudas, tarjetas y estadísticas no cambian.
  //
  // El mismo formulario sirve para editar: se abre con una sola fila.
  // =========================================================

  var registroSection = document.getElementById("compra-form-section");
  var registroToggleBtn = document.getElementById("compra-form-toggle-btn");
  var registroCerrarBtn = document.getElementById("compra-form-cerrar-btn");
  var registroTitulo = document.getElementById("registro-titulo");
  var registroSubtitulo = document.getElementById("registro-subtitulo");
  var registroFecha = document.getElementById("registro-fecha");
  var registroFechaChips = document.getElementById("registro-fecha-chips");
  var registroDiaTexto = document.getElementById("registro-dia-texto");
  var registroMetodo = document.getElementById("registro-metodo");
  var registroCicloHint = document.getElementById("registro-ciclo-hint");
  var registroLista = document.getElementById("registro-lista");
  var registroAgregar = document.getElementById("registro-agregar");
  var registroAgregarBtn = document.getElementById("registro-agregar-btn");
  var registroAgregarDivididaBtn = document.getElementById("registro-agregar-dividida-btn");
  var registroTotal = document.getElementById("registro-total");
  var registroGuardarBtn = document.getElementById("registro-guardar-btn");
  var registroCancelarBtn = document.getElementById("registro-cancelar-btn");
  var registroRepetirInput = document.getElementById("compra-repetir-ultima");
  var registroRepetirResumen = document.getElementById("compra-repetir-resumen");
  var REGISTRO_REPETIR_AYUDA = registroRepetirResumen.textContent;

  var filasRegistro = []; // objetos de fila (ver buildFilaSimple / buildFilaDividida)
  var registroEdicion = null; // null | { tipo: "compra", compra } | { tipo: "grupo", miembros }
  var DIAS_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

  // =========================================================
  // Helpers de DOM
  // =========================================================

  function el(tag, clase, texto) {
    var e = document.createElement(tag);
    if (clase) e.className = clase;
    if (texto != null) e.textContent = texto;
    return e;
  }

  function llenarSelect(selectEl, opciones, valor) {
    var previo = valor != null ? valor : selectEl.value;
    selectEl.innerHTML = "";
    opciones.forEach(function (o) {
      if (o.grupo) {
        var og = el("optgroup");
        og.label = o.grupo;
        o.opciones.forEach(function (oo) {
          var opt = el("option", null, oo.label);
          opt.value = oo.value;
          og.appendChild(opt);
        });
        selectEl.appendChild(og);
        return;
      }
      var opt = el("option", null, o.label);
      opt.value = o.value;
      selectEl.appendChild(opt);
    });
    if (Array.from(selectEl.options).some(function (op) { return op.value === previo; })) selectEl.value = previo;
  }

  function seleccionar(selectEl, valor) {
    if (Array.from(selectEl.options).some(function (o) { return o.value === valor; })) {
      selectEl.value = valor;
      return true;
    }
    return false;
  }

  function inputNumero(clase, placeholder) {
    var i = el("input", clase);
    i.type = "number";
    i.min = "0";
    i.step = "1";
    i.inputMode = "numeric";
    i.placeholder = placeholder;
    return i;
  }

  // =========================================================
  // Personas: "¿de quién es?" + "¿quién pagó?" ↔ comprador/acreedor/hogar
  // =========================================================

  function opcionesDuenio() {
    return [{ value: "yo", label: "🙋 Mía" }, { value: "casa", label: "🏠 De la casa" }]
      .concat(loadMiembros().map(function (m) { return { value: m.id, label: m.nombre }; }))
      .concat([{ value: "otro", label: "👤 Otra persona…" }]);
  }

  // Quién pagó: yo, alguien de la lista o, si la compra es de una persona
  // que no está en la lista, esa misma persona.
  function opcionesPagador(duenio) {
    var ops = [{ value: "yo", label: "Yo" }].concat(loadMiembros().map(function (m) { return { value: m.id, label: m.nombre }; }));
    if (duenio.tipo === "otro") ops.push({ value: "mismo", label: duenio.nombre ? duenio.nombre + " (la misma persona)" : "Esa misma persona" });
    return ops;
  }

  // La tarjeta dice quién puso la plata: si es de otra persona (ej. la de
  // mamá), pagó ella; si es mía, efectivo o débito, pagué yo.
  function pagadorPorMetodo(metodo) {
    var t = esMetodoPagoTarjeta(metodo) ? tarjetaById(metodo) : null;
    if (t && t.owner && t.owner !== "mia" && personaById(t.owner)) return t.owner;
    return "yo";
  }

  function nombreDe(id) {
    return id === "yo" ? "ti" : personaNombre(id);
  }

  // dueño: { tipo: "yo"|"casa"|"persona"|"otro", id, nombre }
  // pagador: "yo" | id de persona | "mismo"
  // debe: si quien no pagó tiene que devolver la plata (solo se pregunta
  // cuando la compra es mía o de la casa y la pagó otra persona).
  function personasACampos(duenio, pagador, debe) {
    var c = { comprador: YO.id, compradorOtro: null, acreedor: "nadie", esHogar: false, persona: null };
    if (duenio.tipo === "yo") {
      if (pagador !== "yo" && debe) c.acreedor = pagador;
    } else if (duenio.tipo === "casa") {
      c.esHogar = true;
      if (pagador !== "yo") {
        if (debe) c.acreedor = pagador;
        else c.comprador = pagador; // aporte de esa persona a la casa
      }
    } else {
      if (duenio.tipo === "otro") {
        c.comprador = COMPRADOR_OTRO.id;
        c.compradorOtro = duenio.nombre || null;
      } else {
        c.comprador = duenio.id;
      }
      if (pagador === "yo") c.acreedor = "mi";
      else if (pagador === "mismo" || pagador === duenio.id) c.acreedor = "nadie";
      else c.acreedor = pagador;
    }
    return c;
  }

  // Lo inverso, para editar o repetir una compra ya guardada.
  function camposAPersonas(compra) {
    var comprador = compra.comprador || YO.id;
    var acreedor = compra.acreedor || "nadie";
    var r = { duenio: { tipo: "yo" }, pagador: "yo", debe: true };
    function duenioPersona(idONombre, esOtro) {
      if (esOtro) {
        var key = normalizeDeudorKey(idONombre);
        if (personaById(key) && key !== YO.id) return { tipo: "persona", id: key };
        return { tipo: "otro", nombre: idONombre || "" };
      }
      return { tipo: "persona", id: idONombre };
    }
    if (comprador === YO.id) {
      if (acreedor === "mi") {
        r.duenio = duenioPersona(compra.persona, true);
        r.pagador = "yo";
      } else {
        r.duenio = { tipo: compra.esHogar ? "casa" : "yo" };
        r.pagador = acreedor === "nadie" ? "yo" : acreedor;
        r.debe = acreedor !== "nadie";
      }
    } else {
      var esOtro = comprador === COMPRADOR_OTRO.id;
      var duenio = esOtro ? duenioPersona(compra.compradorOtro, true) : { tipo: "persona", id: comprador };
      if (acreedor === "mi") {
        r.duenio = duenio;
        r.pagador = "yo";
      } else if (acreedor === "nadie") {
        if (compra.esHogar && !esOtro) {
          r.duenio = { tipo: "casa" };
          r.pagador = comprador;
          r.debe = false;
        } else {
          r.duenio = duenio;
          r.pagador = duenio.tipo === "otro" ? "mismo" : duenio.id;
        }
      } else {
        r.duenio = duenio;
        r.pagador = acreedor;
      }
    }
    return r;
  }

  function nombreDuenio(duenio) {
    if (duenio.tipo === "persona") return personaNombre(duenio.id);
    if (duenio.tipo === "otro") return duenio.nombre || "esa persona";
    return duenio.tipo === "casa" ? "la casa" : "ti";
  }

  function nombrePagador(pagador, duenio) {
    if (pagador === "mismo") return nombreDuenio(duenio);
    return nombreDe(pagador);
  }

  // Una línea que dice, en palabras, qué significa lo elegido.
  function textoResultado(duenio, pagador, debe, monto) {
    var m = monto > 0 ? formatCurrency(monto) : "esta compra";
    var quienPago = nombrePagador(pagador, duenio);
    if (duenio.tipo === "yo") {
      if (pagador === "yo") return { texto: "🙋 Gasto tuyo", clase: "neutral" };
      return debe ? { texto: "💸 Le debes " + m + " a " + quienPago, clase: "debo" }
        : { texto: "🎁 Te la pagó " + quienPago + " (sin deuda)", clase: "neutral" };
    }
    if (duenio.tipo === "casa") {
      if (pagador === "yo") return { texto: "🏠 Aporte tuyo a la casa", clase: "neutral" };
      return debe ? { texto: "💸 Le debes " + m + " a " + quienPago + " (gasto de la casa)", clase: "debo" }
        : { texto: "🏠 Aporte de " + quienPago + " a la casa", clase: "neutral" };
    }
    var quien = nombreDuenio(duenio);
    if (pagador === "yo") return { texto: "💰 " + quien + " te debe " + m, clase: "me-deben" };
    if (pagador === "mismo" || pagador === duenio.id) return { texto: "📝 Gasto de " + quien + " (solo registro, sin deuda)", clase: "neutral" };
    return { texto: "💸 " + quien + " le debe " + m + " a " + quienPago, clase: "debo" };
  }

  // Widget de personas de una fila simple.
  function buildPersonasWidget(onCambio) {
    var estado = { duenio: { tipo: "yo" }, pagador: "yo", debe: true, pagadorTocado: false, debeTocado: false, duenioTocado: false, mostrarEnEstad: false };
    var monto = 0;

    var wrap = el("div", "persona-widget");
    var filaDuenio = el("div", "pw-fila");
    filaDuenio.appendChild(el("span", "pw-label", "¿De quién es esta compra?"));
    var chips = el("div", "pw-chips");
    filaDuenio.appendChild(chips);
    var otroInput = el("input", "pw-otro hidden");
    otroInput.type = "text";
    otroInput.placeholder = "Nombre de la persona";
    otroInput.setAttribute("list", "personas-conocidas-list");
    filaDuenio.appendChild(otroInput);
    var statsLabel = el("label", "pw-check hidden");
    var statsInput = el("input");
    statsInput.type = "checkbox";
    statsLabel.appendChild(statsInput);
    statsLabel.appendChild(el("span", null, "Llevar registro de su dinero en Estadísticas"));
    filaDuenio.appendChild(statsLabel);
    wrap.appendChild(filaDuenio);

    var filaPago = el("div", "pw-fila pw-fila-pago");
    var pagoLabel = el("label", "pw-pago");
    pagoLabel.appendChild(el("span", "pw-label", "¿Quién la pagó?"));
    var pagadorSelect = el("select", "pw-pagador");
    pagoLabel.appendChild(pagadorSelect);
    filaPago.appendChild(pagoLabel);
    var debeLabel = el("label", "pw-check hidden");
    var debeInput = el("input");
    debeInput.type = "checkbox";
    var debeTexto = el("span");
    debeLabel.appendChild(debeInput);
    debeLabel.appendChild(debeTexto);
    filaPago.appendChild(debeLabel);
    wrap.appendChild(filaPago);

    var resultado = el("div", "pw-resultado");
    wrap.appendChild(resultado);

    function renderChips() {
      chips.innerHTML = "";
      opcionesDuenio().forEach(function (o) {
        var b = el("button", "pw-chip", o.label);
        b.type = "button";
        var activo = o.value === "yo" || o.value === "casa" || o.value === "otro"
          ? estado.duenio.tipo === o.value
          : estado.duenio.tipo === "persona" && estado.duenio.id === o.value;
        b.classList.toggle("active", activo);
        b.setAttribute("aria-pressed", String(activo));
        b.addEventListener("click", function () {
          estado.duenioTocado = true;
          if (o.value === "yo" || o.value === "casa") estado.duenio = { tipo: o.value };
          else if (o.value === "otro") estado.duenio = { tipo: "otro", nombre: otroInput.value.trim() };
          else estado.duenio = { tipo: "persona", id: o.value };
          actualizar();
          if (o.value === "otro") otroInput.focus();
        });
        chips.appendChild(b);
      });
    }

    function actualizar() {
      renderChips();
      var esOtro = estado.duenio.tipo === "otro";
      otroInput.classList.toggle("hidden", !esOtro);
      statsLabel.classList.toggle("hidden", !esOtro);
      if (esOtro) estado.duenio.nombre = otroInput.value.trim();

      llenarSelect(pagadorSelect, opcionesPagador(estado.duenio), estado.pagador);
      if (pagadorSelect.value !== estado.pagador) estado.pagador = pagadorSelect.value;

      var preguntaDebe = (estado.duenio.tipo === "yo" || estado.duenio.tipo === "casa") && estado.pagador !== "yo";
      debeLabel.classList.toggle("hidden", !preguntaDebe);
      if (preguntaDebe) {
        if (!estado.debeTocado) estado.debe = estado.duenio.tipo === "yo";
        debeInput.checked = estado.debe;
        debeTexto.textContent = "Se la tengo que devolver a " + nombreDe(estado.pagador);
      }
      var r = textoResultado(estado.duenio, estado.pagador, preguntaDebe ? estado.debe : true, monto);
      resultado.textContent = r.texto;
      resultado.className = "pw-resultado pw-" + r.clase;
      if (onCambio) onCambio();
    }

    otroInput.addEventListener("input", function () { estado.duenio.nombre = otroInput.value.trim(); actualizar(); });
    otroInput.addEventListener("blur", function () { otroInput.value = corregirOrtografia(otroInput.value.trim()); estado.duenio.nombre = otroInput.value; actualizar(); });
    statsInput.addEventListener("change", function () { estado.mostrarEnEstad = statsInput.checked; });
    pagadorSelect.addEventListener("change", function () { estado.pagador = pagadorSelect.value; estado.pagadorTocado = true; actualizar(); });
    debeInput.addEventListener("change", function () { estado.debe = debeInput.checked; estado.debeTocado = true; actualizar(); });

    actualizar();

    return {
      el: wrap,
      estado: estado,
      setMonto: function (m) { monto = m; actualizar(); },
      // El pagador sigue a la tarjeta elegida mientras no lo cambies a mano.
      setPagadorPorDefecto: function (p) { if (!estado.pagadorTocado) { estado.pagador = p; actualizar(); } },
      // Lo que se sugiere por la categoría (ej. supermercado → de la casa),
      // solo si todavía no elegiste a mano de quién es.
      sugerirDuenio: function (tipo) {
        if (estado.duenioTocado || estado.duenio.tipo === tipo) return;
        if (estado.duenio.tipo !== "yo" && estado.duenio.tipo !== "casa") return;
        estado.duenio = { tipo: tipo };
        actualizar();
      },
      cargar: function (p, opciones) {
        estado.duenio = Object.assign({}, p.duenio);
        estado.pagador = p.pagador;
        estado.debe = p.debe !== false;
        estado.debeTocado = true;
        estado.duenioTocado = true;
        estado.pagadorTocado = !!(opciones && opciones.pagadorTocado);
        estado.mostrarEnEstad = !!(opciones && opciones.mostrarEnEstad);
        statsInput.checked = estado.mostrarEnEstad;
        otroInput.value = p.duenio.tipo === "otro" ? (p.duenio.nombre || "") : "";
        actualizar();
      },
      leer: function () {
        var preguntaDebe = (estado.duenio.tipo === "yo" || estado.duenio.tipo === "casa") && estado.pagador !== "yo";
        return {
          duenio: Object.assign({}, estado.duenio),
          pagador: estado.pagador,
          debe: preguntaDebe ? estado.debe : true,
          mostrarEnEstad: estado.duenio.tipo === "otro" && estado.mostrarEnEstad
        };
      },
      refrescar: actualizar
    };
  }

  // =========================================================
  // Categoría con sugerencias automáticas
  // =========================================================

  function opcionesCategoria(idIncluir) {
    return ["fijo", "suscripcion", "variable"].map(function (g) {
      return {
        grupo: CATEGORIA_GROUP_LABELS[g],
        opciones: CATEGORIAS.filter(function (c) { return c.group === g && (!c.oculta || c.id === idIncluir); })
          .map(function (c) { return { value: c.id, label: c.label }; })
      };
    }).filter(function (g) { return g.opciones.length; });
  }

  function buildCategoriaWidget(onCambio) {
    var tocada = false;
    var wrap = el("div", "cat-widget");
    var fila = el("div", "cat-fila");
    var label = el("span", "pw-label", "Categoría");
    fila.appendChild(label);
    var select = el("select", "cat-select");
    llenarSelect(select, opcionesCategoria(), "otro_variable");
    fila.appendChild(select);
    wrap.appendChild(fila);

    var sugerencias = el("div", "cat-sugerencias hidden");
    wrap.appendChild(sugerencias);

    var otroInput = el("input", "cat-otro hidden");
    otroInput.type = "text";
    otroInput.placeholder = "¿Cuál? (opcional, ej: Ferretería)";
    wrap.appendChild(otroInput);

    var autoSelect = el("select", "cat-auto hidden");
    AUTOS.forEach(function (a) {
      var o = el("option", null, a.label);
      o.value = a.id;
      autoSelect.appendChild(o);
    });
    wrap.appendChild(autoSelect);

    function actualizarExtras() {
      otroInput.classList.toggle("hidden", CATEGORIAS_PROTEGIDAS.indexOf(select.value) === -1);
      autoSelect.classList.toggle("hidden", select.value !== "autos");
      if (onCambio) onCambio();
    }

    select.addEventListener("change", function () { tocada = true; renderSugerencias(ultimasSugerencias); actualizarExtras(); });

    var ultimasSugerencias = [];
    function renderSugerencias(lista) {
      ultimasSugerencias = lista;
      sugerencias.innerHTML = "";
      sugerencias.classList.toggle("hidden", lista.length === 0);
      if (!lista.length) return;
      if (lista.length === 1 && select.value === lista[0].id) {
        sugerencias.appendChild(el("span", "cat-sug-label", "✨ Elegida sola según lo que escribiste (puedes cambiarla)"));
        return;
      }
      sugerencias.appendChild(el("span", "cat-sug-label", "✨ Sugerencias:"));
      lista.forEach(function (c) {
        var b = el("button", "cat-chip" + (select.value === c.id ? " active" : ""), c.label);
        b.type = "button";
        b.addEventListener("click", function () {
          tocada = true;
          select.value = c.id;
          renderSugerencias(ultimasSugerencias);
          actualizarExtras();
        });
        sugerencias.appendChild(b);
      });
    }

    return {
      el: wrap,
      // Al escribir qué se compró: propone categorías y, si no la elegiste
      // a mano, deja puesta la más probable.
      sugerirPara: function (texto) {
        var lista = sugerirCategorias(texto, 3);
        if (!tocada && lista.length) {
          select.value = lista[0].id;
          actualizarExtras();
        } else if (!tocada && !lista.length && select.value !== "otro_variable") {
          if (seleccionar(select, "otro_variable")) actualizarExtras();
        }
        renderSugerencias(lista);
      },
      valor: function () { return select.value; },
      grupo: function () { var c = categoriaById(select.value); return c ? c.group : "variable"; },
      cargar: function (id, otro, auto) {
        llenarSelect(select, opcionesCategoria(id), id);
        if (select.value !== id) seleccionar(select, "otro_variable");
        otroInput.value = otro || "";
        if (auto) autoSelect.value = auto;
        tocada = true;
        actualizarExtras();
      },
      leer: function () {
        return {
          categoria: select.value,
          categoriaOtro: CATEGORIAS_PROTEGIDAS.indexOf(select.value) !== -1 ? (otroInput.value.trim() || null) : null,
          auto: select.value === "autos" ? autoSelect.value : null
        };
      },
      refrescar: function () { llenarSelect(select, opcionesCategoria(select.value), select.value); }
    };
  }

  // =========================================================
  // Método de pago
  // =========================================================

  function opcionesMetodo() {
    var ops = [{ value: "efectivo", label: "💵 Efectivo" }, { value: "debito", label: "🏦 Débito / transferencia" }];
    loadTarjetas().forEach(function (t) { ops.push({ value: t.id, label: "💳 " + tarjetaLabel(t.id) }); });
    return ops;
  }

  function metodoACampos(metodo) {
    var esTarjeta = esMetodoPagoTarjeta(metodo);
    return { tarjetaId: esTarjeta ? metodo : null, metodoPago: esTarjeta ? null : metodo };
  }

  function textoCiclo(metodo, fecha) {
    var t = esMetodoPagoTarjeta(metodo) ? tarjetaById(metodo) : null;
    if (!t || !esTarjetaPersonal(t.id)) return null;
    var p = periodoDeFecha(t, fecha || todayStamp());
    return p.aproximado
      ? { texto: "⚠️ Esta tarjeta no tiene día de cierre y pago: se asume que se paga en " + mesLargo(p.key) + ".", aviso: true }
      : { texto: "💳 Entra en la deuda de " + mesLargo(p.key) + " (cierra el " + formatDateDisplay(p.cierreIso) + ", se paga el " + formatDateDisplay(p.pagoIso) + ").", aviso: false };
  }

  function metodoDelDia() {
    return registroMetodo.value || "efectivo";
  }

  function fechaDelDia() {
    return registroFecha.value || todayStamp();
  }

  // =========================================================
  // Fila de compra simple
  // =========================================================

  function numeroDeFila(fila) {
    return filasRegistro.indexOf(fila) + 1;
  }

  function buildFilaSimple() {
    var fila = { tipo: "simple" };
    var listo = false; // los avisos internos esperan a que la fila esté armada
    var card = el("div", "reg-fila");
    fila.el = card;

    var head = el("div", "reg-fila-head");
    var titulo = el("span", "reg-fila-titulo");
    head.appendChild(titulo);
    var quitar = el("button", "reg-quitar", "✕");
    quitar.type = "button";
    quitar.title = "Quitar esta compra";
    quitar.setAttribute("aria-label", "Quitar esta compra");
    quitar.addEventListener("click", function () { quitarFila(fila); });
    head.appendChild(quitar);
    card.appendChild(head);

    var principal = el("div", "reg-principal");
    var desc = el("input", "reg-desc");
    desc.type = "text";
    desc.placeholder = "¿Qué compraste? Ej: pan, bencina, polerón…";
    desc.setAttribute("aria-label", "Qué compraste");
    principal.appendChild(desc);
    var montoWrap = el("div", "reg-monto-wrap");
    var monto = inputNumero("reg-monto", "Monto $");
    monto.setAttribute("aria-label", "Monto");
    montoWrap.appendChild(monto);
    var montoPreview = el("span", "monto-preview");
    montoWrap.appendChild(montoPreview);
    principal.appendChild(montoWrap);
    card.appendChild(principal);

    var categoria = buildCategoriaWidget(function () {
      if (!listo) return;
      // Cuentas y comida suelen ser de la casa; lo demás, de quien compra.
      personas.sugerirDuenio(categoria.grupo() === "fijo" ? "casa" : "yo");
      actualizarOpciones();
    });
    card.appendChild(categoria.el);

    var personas = buildPersonasWidget(function () { if (listo) actualizarOpciones(); });
    card.appendChild(personas.el);

    // ---- Más opciones (plegado) ----
    var mas = el("details", "reg-mas");
    var masSummary = el("summary", null, "⚙️ Más opciones (cuotas, otra tarjeta, otra fecha, nota…)");
    mas.appendChild(masSummary);
    var masBody = el("div", "reg-mas-body");
    mas.appendChild(masBody);

    function campo(etiqueta, control, clase) {
      var c = el("label", "reg-campo" + (clase ? " " + clase : ""));
      c.appendChild(el("span", "reg-campo-label", etiqueta));
      c.appendChild(control);
      masBody.appendChild(c);
      return c;
    }

    var metodoOverride = el("select", "reg-metodo-override");
    var campoMetodo = campo("💳 Pagado con", metodoOverride);
    var fechaOverride = el("input", "reg-fecha-override");
    fechaOverride.type = "date";
    var campoFecha = campo("📅 Otra fecha (si no fue el mismo día)", fechaOverride);
    var cuotas = inputNumero("reg-cuotas", "1 = pago único");
    cuotas.min = "1";
    var campoCuotas = campo("🔢 Cuotas", cuotas);
    var interesLabel = el("label", "pw-check reg-campo hidden");
    var interes = el("input");
    interes.type = "checkbox";
    interesLabel.appendChild(interes);
    interesLabel.appendChild(el("span", null, "Con interés"));
    masBody.appendChild(interesLabel);
    var primerVenc = el("input", "reg-primer-venc");
    primerVenc.type = "date";
    var campoPrimerVenc = campo("Primer vencimiento (solo si el banco te dio meses sin pagar)", primerVenc, "hidden");
    var repetirMeses = inputNumero("reg-repetir-meses", "Ej: 12");
    repetirMeses.min = "2";
    var campoRepetir = campo("🔁 Suscripción: se repite cada mes durante (meses)", repetirMeses, "hidden");
    var fechaAcordada = el("input", "reg-fecha-acordada");
    fechaAcordada.type = "date";
    var campoAcordada = campo("📅 Fecha acordada para que te/le paguen (opcional)", fechaAcordada, "hidden");
    var sueldoSelect = el("select", "reg-sueldo");
    var campoSueldo = campo("💰 ¿Sale de tu sueldo?", sueldoSelect, "hidden");
    var recordatorio = inputNumero("reg-recordatorio", "Día del mes (ej: 15)");
    recordatorio.max = "31";
    var campoRecordatorio = campo("🔔 Recordarme pagar esta cuenta cada mes el día", recordatorio, "hidden");
    var nota = el("input", "reg-nota");
    nota.type = "text";
    nota.placeholder = "Opcional";
    campo("📝 Nota", nota);
    card.appendChild(mas);

    var cicloHint = el("span", "ciclo-hint hidden");
    card.appendChild(cicloHint);
    var error = el("span", "error-msg");
    card.appendChild(error);

    function metodo() { return metodoOverride.value || metodoDelDia(); }
    function fecha() { return fechaOverride.value || fechaDelDia(); }

    function refrescarMetodoOverride() {
      llenarSelect(metodoOverride, [{ value: "", label: "Igual que arriba" }].concat(opcionesMetodo()), metodoOverride.value);
    }

    function refrescarSueldo() {
      var ops = [{ value: "sueldo:", label: "Sí, del sueldo (sobre automático)" }]
        .concat(sobresDeGasto().map(function (s) { return { value: "sueldo:" + s.id, label: "Sí, del sobre \"" + s.nombre + "\"" }; }))
        .concat([{ value: "otro", label: "No, con otro dinero" }]);
      llenarSelect(sueldoSelect, ops, sueldoSelect.value || "sueldo:");
    }

    function actualizarOpciones() {
      var nCuotas = Number(cuotas.value) || 1;
      interesLabel.classList.toggle("hidden", nCuotas < 2);
      campoPrimerVenc.classList.toggle("hidden", nCuotas < 2);
      campoRepetir.classList.toggle("hidden", categoria.grupo() !== "suscripcion" || !!registroEdicion);
      campoRecordatorio.classList.toggle("hidden", categoria.grupo() !== "fijo");
      var p = personas.leer();
      var campos = personasACampos(p.duenio, p.pagador, p.debe);
      campoAcordada.classList.toggle("hidden", campos.acreedor === "nadie");
      var esMio = campos.comprador === YO.id && !campos.esHogar && campos.acreedor === "nadie";
      campoSueldo.classList.toggle("hidden", !(esMio && loadSueldo().length > 0));

      var otros = [metodoOverride.value ? "otra tarjeta" : null, fechaOverride.value ? "otra fecha" : null,
        nCuotas >= 2 ? nCuotas + " cuotas" : null, nota.value.trim() ? "nota" : null].filter(Boolean);
      masSummary.textContent = otros.length
        ? "⚙️ Más opciones · " + otros.join(", ")
        : "⚙️ Más opciones (cuotas, otra tarjeta, otra fecha, nota…)";

      var ciclo = (metodoOverride.value || fechaOverride.value) ? textoCiclo(metodo(), fecha()) : null;
      cicloHint.classList.toggle("hidden", !ciclo);
      if (ciclo) {
        cicloHint.textContent = ciclo.texto;
        cicloHint.classList.toggle("ciclo-hint-aviso", ciclo.aviso);
      }
      actualizarTotales();
    }

    desc.addEventListener("input", function () { categoria.sugerirPara(desc.value); });
    desc.addEventListener("blur", function () { desc.value = corregirOrtografia(desc.value); });
    monto.addEventListener("input", function () {
      var n = Number(monto.value);
      montoPreview.textContent = n > 0 ? "= " + formatCurrency(n) : "";
      personas.setMonto(n);
      actualizarTotales();
    });
    // Enter en el monto de la última compra = agregar otra y seguir.
    monto.addEventListener("keydown", function (e) {
      if (e.key !== "Enter") return;
      e.preventDefault();
      if (registroEdicion) return;
      if (filasRegistro[filasRegistro.length - 1] === fila) agregarFila("simple", true);
      else {
        var siguiente = filasRegistro[filasRegistro.indexOf(fila) + 1];
        if (siguiente && siguiente.enfocar) siguiente.enfocar();
      }
    });
    metodoOverride.addEventListener("change", function () {
      personas.setPagadorPorDefecto(pagadorPorMetodo(metodo()));
      actualizarOpciones();
    });
    [fechaOverride, cuotas, nota].forEach(function (i) { i.addEventListener("input", actualizarOpciones); });

    refrescarMetodoOverride();
    refrescarSueldo();
    listo = true;
    personas.setPagadorPorDefecto(pagadorPorMetodo(metodo()));
    actualizarOpciones();

    fila.actualizarTitulo = function () {
      titulo.textContent = registroEdicion ? "✏️ Compra" : "Compra " + numeroDeFila(fila);
      quitar.classList.toggle("hidden", !!registroEdicion);
    };
    fila.enfocar = function () { desc.focus(); };
    fila.monto = function () { return Number(monto.value) || 0; };
    fila.cuenta = function () { return (desc.value.trim() || monto.value) ? 1 : 0; };
    fila.alCambiarDia = function () {
      personas.setPagadorPorDefecto(pagadorPorMetodo(metodo()));
      actualizarOpciones();
    };
    fila.refrescar = function () {
      refrescarMetodoOverride();
      refrescarSueldo();
      categoria.refrescar();
      personas.refrescar();
    };
    // Datos "repetibles" de esta fila, para copiarlos en la siguiente.
    fila.plantilla = function () {
      var c = categoria.leer();
      return {
        categoria: c.categoria, categoriaOtro: c.categoriaOtro, auto: c.auto,
        personas: personas.leer(), metodoOverride: metodoOverride.value,
        pagadorTocado: personas.estado.pagadorTocado
      };
    };
    fila.aplicarPlantilla = function (pl) {
      if (!pl) return;
      categoria.cargar(pl.categoria, pl.categoriaOtro, pl.auto);
      if (pl.metodoOverride) seleccionar(metodoOverride, pl.metodoOverride);
      personas.cargar(pl.personas, { pagadorTocado: pl.pagadorTocado, mostrarEnEstad: pl.personas.mostrarEnEstad });
      actualizarOpciones();
    };
    fila.cargarCompra = function (c) {
      desc.value = c.descripcion || "";
      monto.value = c.monto != null ? String(c.monto) : "";
      monto.dispatchEvent(new Event("input"));
      categoria.cargar(c.categoria, c.categoriaOtro, c.auto);
      seleccionar(metodoOverride, "");
      cuotas.value = c.tipo === "cuotas" && c.cuotas > 1 ? String(c.cuotas) : "";
      interes.checked = !!c.tieneInteres;
      primerVenc.value = c.tipo === "cuotas" ? (c.fechaPago || "") : "";
      fechaAcordada.value = c.fechaPagoAcordada || "";
      nota.value = c.notas || "";
      if (c.origenDinero === "otro") sueldoSelect.value = "otro";
      else if (c.sobreId) sueldoSelect.value = "sueldo:" + c.sobreId;
      var rec = getFijoRecordatorio(c.categoria);
      recordatorio.value = rec ? String(rec) : "";
      personas.cargar(camposAPersonas(c), { pagadorTocado: true, mostrarEnEstad: c.mostrarEnEstad });
      actualizarOpciones();
    };

    // Lee la fila y la convierte en compras listas para guardar.
    fila.leer = function () {
      error.textContent = "";
      card.classList.remove("reg-fila-error");
      var descripcion = corregirOrtografia(desc.value.trim());
      var valor = Number(monto.value);
      if (!descripcion && !monto.value) return { vacia: true };
      function fallo(msg) {
        error.textContent = msg;
        card.classList.add("reg-fila-error");
        return { error: msg };
      }
      if (!valor || valor <= 0) return fallo("Falta el monto de esta compra.");
      var p = personas.leer();
      // (Al editar compras antiguas sin nombre se permite dejarlo así.)
      if (p.duenio.tipo === "otro" && !p.duenio.nombre && !registroEdicion) return fallo("Escribe el nombre de la persona.");
      var nCuotas = Number(cuotas.value) || 1;
      if (nCuotas < 1 || Math.floor(nCuotas) !== nCuotas) return fallo("Las cuotas deben ser un número entero.");

      var cat = categoria.leer();
      var campos = personasACampos(p.duenio, p.pagador, p.debe);
      var esMio = campos.comprador === YO.id && !campos.esHogar && campos.acreedor === "nadie";
      var origen = null, sobreId = null;
      if (esMio && loadSueldo().length > 0) {
        if (sueldoSelect.value === "otro") origen = "otro";
        else { origen = "sueldo"; sobreId = sueldoSelect.value.split(":")[1] || null; }
      }
      var base = Object.assign({
        tipo: nCuotas >= 2 ? "cuotas" : "unico",
        categoria: cat.categoria, categoriaOtro: cat.categoriaOtro, auto: cat.auto,
        descripcion: descripcion || null,
        monto: valor,
        fecha: fecha(),
        cuotas: nCuotas >= 2 ? nCuotas : 1,
        tieneInteres: nCuotas >= 2 && interes.checked,
        fechaPago: nCuotas >= 2 ? (primerVenc.value || null) : null,
        mostrarEnEstad: campos.comprador === COMPRADOR_OTRO.id ? p.mostrarEnEstad : null,
        fechaPagoAcordada: campos.acreedor !== "nadie" ? (fechaAcordada.value || null) : null,
        origenDinero: origen, sobreId: sobreId,
        notas: nota.value.trim() || null
      }, metodoACampos(metodo()), campos);

      var meses = Number(repetirMeses.value) || 0;
      var repetir = !registroEdicion && categoria.grupo() === "suscripcion" && meses >= 2;
      var recordatorioDia = categoria.grupo() === "fijo" ? Number(recordatorio.value) || null : null;
      return { compras: [base], repetirMeses: repetir ? Math.min(meses, 60) : 0, recordatorio: recordatorioDia };
    };

    return fila;
  }

  // =========================================================
  // Fila de compra dividida entre varias personas
  // =========================================================

  function opcionesParticipante() {
    return [{ value: "yo", label: "Yo" }]
      .concat(loadMiembros().map(function (m) { return { value: m.id, label: m.nombre }; }))
      .concat([{ value: "otro", label: "Otra persona…" }]);
  }

  function buildFilaDividida() {
    var fila = { tipo: "dividida", modo: null };
    var card = el("div", "reg-fila reg-fila-dividida");
    fila.el = card;

    var head = el("div", "reg-fila-head");
    var titulo = el("span", "reg-fila-titulo");
    head.appendChild(titulo);
    var quitar = el("button", "reg-quitar", "✕");
    quitar.type = "button";
    quitar.title = "Quitar esta compra";
    quitar.addEventListener("click", function () { quitarFila(fila); });
    head.appendChild(quitar);
    card.appendChild(head);

    var principal = el("div", "reg-principal");
    var desc = el("input", "reg-desc");
    desc.type = "text";
    desc.placeholder = "¿Qué compraron? Ej: pizzas, asado…";
    principal.appendChild(desc);
    var totalWrap = el("div", "reg-monto-wrap");
    var totalInput = inputNumero("reg-monto", "Total de la boleta $");
    totalWrap.appendChild(totalInput);
    var totalPreview = el("span", "monto-preview");
    totalWrap.appendChild(totalPreview);
    principal.appendChild(totalWrap);
    card.appendChild(principal);

    var categoria = buildCategoriaWidget(null);
    card.appendChild(categoria.el);

    var pagoFila = el("div", "pw-fila pw-fila-pago reg-dividida-pago");
    var pagoLabel = el("label", "pw-pago");
    pagoLabel.appendChild(el("span", "pw-label", "¿Quién puso la plata?"));
    var pagadorSelect = el("select", "pw-pagador");
    pagoLabel.appendChild(pagadorSelect);
    pagoFila.appendChild(pagoLabel);
    var pagoHint = el("span", "label-hint");
    pagoFila.appendChild(pagoHint);
    card.appendChild(pagoFila);
    var pagadorTocado = false;

    // ---- Elegir cómo dividir ----
    var elegir = el("div", "reg-modo-elegir");
    elegir.appendChild(el("span", "pw-label", "¿Cómo la quieres dividir?"));
    var modoBtns = el("div", "reg-modo-btns");
    var btnItems = el("button", "reg-modo-btn");
    btnItems.type = "button";
    btnItems.innerHTML = "<strong>🧾 Con ítems</strong><small>Anotas qué compró cada uno y la app suma</small>";
    var btnPersonas = el("button", "reg-modo-btn");
    btnPersonas.type = "button";
    btnPersonas.innerHTML = "<strong>👥 Solo personas y montos</strong><small>Solo cuánto le toca a cada uno</small>";
    modoBtns.appendChild(btnItems);
    modoBtns.appendChild(btnPersonas);
    elegir.appendChild(modoBtns);
    card.appendChild(elegir);

    var cuerpo = el("div", "reg-dividida-cuerpo hidden");
    card.appendChild(cuerpo);

    // Ítems
    var itemsBox = el("div", "reg-items-box hidden");
    itemsBox.appendChild(el("span", "pw-label", "🧾 Ítems — qué se compró y para quién"));
    var itemsLista = el("div", "reg-items-lista");
    itemsBox.appendChild(itemsLista);
    var addItemBtn = el("button", "btn btn-outline btn-small", "➕ Agregar ítem");
    addItemBtn.type = "button";
    itemsBox.appendChild(addItemBtn);
    cuerpo.appendChild(itemsBox);

    // Personas
    var personasBox = el("div", "reg-personas-box");
    var personasLabel = el("span", "pw-label", "👥 Cuánto le toca a cada uno");
    personasBox.appendChild(personasLabel);
    var personasLista = el("div", "reg-personas-lista");
    personasBox.appendChild(personasLista);
    var personasAcciones = el("div", "reg-personas-acciones");
    var addPersonaBtn = el("button", "btn btn-outline btn-small", "➕ Agregar persona");
    addPersonaBtn.type = "button";
    personasAcciones.appendChild(addPersonaBtn);
    var restoBtn = el("button", "btn btn-secondary btn-small", "🧮 Calcular lo que falta");
    restoBtn.type = "button";
    restoBtn.title = "Pone lo que falta para llegar al total en la primera persona sin monto";
    personasAcciones.appendChild(restoBtn);
    personasBox.appendChild(personasAcciones);
    var estadoReparto = el("div", "reg-reparto");
    personasBox.appendChild(estadoReparto);
    cuerpo.appendChild(personasBox);

    var cambiarModo = el("button", "btn-link reg-cambiar-modo");
    cambiarModo.type = "button";
    cuerpo.appendChild(cambiarModo);

    // Más opciones
    var mas = el("details", "reg-mas");
    mas.appendChild(el("summary", null, "⚙️ Más opciones (otra tarjeta, otra fecha, nota…)"));
    var masBody = el("div", "reg-mas-body");
    mas.appendChild(masBody);
    function campo(etiqueta, control) {
      var c = el("label", "reg-campo");
      c.appendChild(el("span", "reg-campo-label", etiqueta));
      c.appendChild(control);
      masBody.appendChild(c);
      return c;
    }
    var metodoOverride = el("select", "reg-metodo-override");
    campo("💳 Pagado con", metodoOverride);
    var fechaOverride = el("input");
    fechaOverride.type = "date";
    campo("📅 Otra fecha (si no fue el mismo día)", fechaOverride);
    var fechaAcordada = el("input");
    fechaAcordada.type = "date";
    campo("📅 Fecha acordada para que te/le paguen (opcional)", fechaAcordada);
    var nota = el("input");
    nota.type = "text";
    nota.placeholder = "Opcional";
    campo("📝 Nota", nota);
    card.appendChild(mas);

    var error = el("span", "error-msg");
    card.appendChild(error);

    var personasFilas = [];
    var itemsFilas = [];
    var personaSeq = 0;

    function metodo() { return metodoOverride.value || metodoDelDia(); }
    function fecha() { return fechaOverride.value || fechaDelDia(); }
    function total() { return Number(totalInput.value) || 0; }

    function refrescarPagador() {
      var ops = [{ value: "yo", label: "Yo" }]
        .concat(loadMiembros().map(function (m) { return { value: m.id, label: m.nombre }; }))
        .concat([{ value: "nadie", label: "Cada uno pagó lo suyo" }]);
      llenarSelect(pagadorSelect, ops, pagadorSelect.value || "yo");
      var v = pagadorSelect.value;
      pagoHint.textContent = v === "yo" ? "Cada uno (menos tú) queda debiéndote su parte."
        : v === "nadie" ? "Solo se registra el gasto de cada uno, sin deudas."
          : "Cada uno (incluido tú, si participas) queda debiéndole su parte a " + personaNombre(v) + ".";
    }

    function etiquetaPersona(pf) {
      if (pf.select.value === "otro") return pf.otro.value.trim() || "Otra persona";
      var op = pf.select.options[pf.select.selectedIndex];
      return op ? op.textContent : "";
    }

    function claveDePersona(pf) {
      return pf.select.value === "otro" ? "otro::" + pf.otro.value.trim().toLowerCase() : pf.select.value;
    }

    // Lo que suma cada persona a partir de los ítems (los de "Todos" se
    // reparten en partes iguales).
    function sumasPorItems() {
      var sumas = {};
      var compartido = 0;
      var conItem = {};
      itemsFilas.forEach(function (it) {
        var m = Number(it.monto.value) || 0;
        if (!it.desc.value.trim() && !m) return;
        if (it.para.value === "todos") { compartido += m; return; }
        conItem[it.para.value] = true;
        sumas[it.para.value] = (sumas[it.para.value] || 0) + m;
      });
      var n = personasFilas.length || 1;
      personasFilas.forEach(function (pf) {
        if (compartido > 0) conItem[pf.id] = true;
        sumas[pf.id] = (sumas[pf.id] || 0) + compartido / n;
      });
      return { sumas: sumas, conItem: conItem };
    }

    function montoDePersona(pf, calc) {
      if (fila.modo === "items" && calc.conItem[pf.id]) return Math.round(calc.sumas[pf.id] || 0);
      return Number(pf.monto.value) || 0;
    }

    function refrescarOpcionesItems() {
      var ops = personasFilas.map(function (pf) { return { value: pf.id, label: etiquetaPersona(pf) }; })
        .concat([{ value: "todos", label: "👥 Todos (se divide en partes iguales)" }]);
      itemsFilas.forEach(function (it) { llenarSelect(it.para, ops, it.para.value || (ops[0] && ops[0].value)); });
    }

    function recalcular() {
      var calc = sumasPorItems();
      var repartido = 0;
      personasFilas.forEach(function (pf) {
        var auto = fila.modo === "items" && calc.conItem[pf.id];
        pf.monto.readOnly = !!auto;
        pf.monto.classList.toggle("reg-monto-auto", !!auto);
        if (auto) pf.monto.value = String(Math.round(calc.sumas[pf.id] || 0));
        pf.nota.textContent = fila.modo === "items" ? (auto ? "según sus ítems" : "sin ítem: monto a mano") : "";
        repartido += montoDePersona(pf, calc);
      });
      var t = total();
      if (!t) {
        estadoReparto.textContent = repartido > 0 ? "Total de la compra: " + formatCurrency(repartido) + " (escribe el total de la boleta arriba para calcular lo que falta)" : "";
        estadoReparto.className = "reg-reparto";
      } else if (Math.round(repartido) === Math.round(t)) {
        estadoReparto.textContent = "✅ Repartido " + formatCurrency(repartido) + " de " + formatCurrency(t) + ": cuadra con el total.";
        estadoReparto.className = "reg-reparto ok";
      } else if (repartido < t) {
        estadoReparto.textContent = "Faltan " + formatCurrency(t - repartido) + " por repartir (de " + formatCurrency(t) + ").";
        estadoReparto.className = "reg-reparto falta";
      } else {
        estadoReparto.textContent = "Sobran " + formatCurrency(repartido - t) + ": lo repartido (" + formatCurrency(repartido) + ") es más que el total.";
        estadoReparto.className = "reg-reparto falta";
      }
      restoBtn.disabled = !t;
      totalPreview.textContent = t > 0 ? "= " + formatCurrency(t) : "";
      actualizarTotales();
    }

    // "Yo pongo lo que falta": le asigna a `pf` la diferencia para llegar al
    // total de la boleta. Si esa persona ya tiene ítems, la diferencia se
    // agrega como un ítem más suyo (así queda a la vista en el comprobante).
    function ponerResto(pf) {
      var t = total();
      if (!t) { showToast("Primero escribe el total de la boleta."); totalInput.focus(); return; }
      var calc = sumasPorItems();
      var todos = personasFilas.reduce(function (s, x) { return s + montoDePersona(x, calc); }, 0);
      var resto = Math.round(t - todos);
      if (resto <= 0) { showToast("No falta nada: lo repartido ya suma el total."); return; }
      if (fila.modo === "items" && calc.conItem[pf.id]) {
        agregarItem({ descripcion: "Diferencia para completar la boleta", monto: resto, paraValor: pf.id });
      } else {
        pf.monto.value = String((Number(pf.monto.value) || 0) + resto);
        recalcular();
      }
      showToast(formatCurrency(resto) + " asignados a " + etiquetaPersona(pf) + ".");
    }

    function agregarPersona(valor, nombreOtro, montoInicial) {
      personaSeq++;
      var pf = { id: "pp" + personaSeq };
      var row = el("div", "reg-persona-fila");
      pf.row = row;
      pf.select = el("select", "reg-persona-select");
      llenarSelect(pf.select, opcionesParticipante(), valor || "");
      if (valor) pf.select.value = valor;
      row.appendChild(pf.select);
      pf.otro = el("input", "reg-persona-otro hidden");
      pf.otro.type = "text";
      pf.otro.placeholder = "Nombre";
      pf.otro.setAttribute("list", "personas-conocidas-list");
      pf.otro.value = nombreOtro || "";
      row.appendChild(pf.otro);
      pf.monto = inputNumero("reg-persona-monto", "Le toca $");
      if (montoInicial) pf.monto.value = String(montoInicial);
      row.appendChild(pf.monto);
      pf.resto = el("button", "btn btn-outline btn-small reg-resto", "= lo que falta");
      pf.resto.type = "button";
      pf.resto.title = "Ponerle a esta persona lo que falta para llegar al total";
      row.appendChild(pf.resto);
      var quitarP = el("button", "reg-quitar", "✕");
      quitarP.type = "button";
      quitarP.setAttribute("aria-label", "Quitar persona");
      row.appendChild(quitarP);
      pf.nota = el("span", "reg-persona-nota");
      row.appendChild(pf.nota);

      function onPersona() {
        pf.otro.classList.toggle("hidden", pf.select.value !== "otro");
        refrescarOpcionesItems();
        recalcular();
      }
      pf.select.addEventListener("change", function () { onPersona(); if (pf.select.value === "otro") pf.otro.focus(); });
      pf.otro.addEventListener("input", onPersona);
      pf.monto.addEventListener("input", recalcular);
      pf.resto.addEventListener("click", function () { ponerResto(pf); });
      quitarP.addEventListener("click", function () {
        personasFilas = personasFilas.filter(function (x) { return x !== pf; });
        row.remove();
        refrescarOpcionesItems();
        recalcular();
      });

      personasFilas.push(pf);
      personasLista.appendChild(row);
      pf.otro.classList.toggle("hidden", pf.select.value !== "otro");
      refrescarOpcionesItems();
      recalcular();
      return pf;
    }

    function agregarItem(datos) {
      var it = {};
      var row = el("div", "reg-item-fila");
      it.desc = el("input", "reg-item-desc");
      it.desc.type = "text";
      it.desc.placeholder = "Ítem (ej: pizza napolitana)";
      it.desc.value = datos && datos.descripcion || "";
      row.appendChild(it.desc);
      it.monto = inputNumero("reg-item-monto", "$");
      if (datos && datos.monto) it.monto.value = String(datos.monto);
      row.appendChild(it.monto);
      it.para = el("select", "reg-item-para");
      it.para.setAttribute("aria-label", "Para quién es el ítem");
      row.appendChild(it.para);
      var quitarI = el("button", "reg-quitar", "✕");
      quitarI.type = "button";
      quitarI.setAttribute("aria-label", "Quitar ítem");
      row.appendChild(quitarI);
      it.row = row;
      it.desc.addEventListener("blur", function () { it.desc.value = corregirOrtografia(it.desc.value); });
      [it.desc, it.monto].forEach(function (i) { i.addEventListener("input", recalcular); });
      it.para.addEventListener("change", recalcular);
      // Enter en el monto del último ítem = otro ítem.
      it.monto.addEventListener("keydown", function (e) {
        if (e.key !== "Enter") return;
        e.preventDefault();
        if (itemsFilas[itemsFilas.length - 1] === it) agregarItem().desc.focus();
      });
      quitarI.addEventListener("click", function () {
        itemsFilas = itemsFilas.filter(function (x) { return x !== it; });
        row.remove();
        recalcular();
      });
      itemsFilas.push(it);
      itemsLista.appendChild(row);
      refrescarOpcionesItems();
      if (datos && datos.paraValor) it.para.value = datos.paraValor;
      recalcular();
      return it;
    }

    function elegirModo(modo) {
      fila.modo = modo;
      elegir.classList.add("hidden");
      cuerpo.classList.remove("hidden");
      itemsBox.classList.toggle("hidden", modo !== "items");
      personasLabel.textContent = modo === "items" ? "👥 Quiénes participan (el monto sale de sus ítems)" : "👥 Cuánto le toca a cada uno";
      cambiarModo.textContent = modo === "items" ? "Cambiar a: solo personas y montos" : "Cambiar a: con detalle de ítems";
      if (personasFilas.length === 0) {
        agregarPersona("yo");
        agregarPersona(loadMiembros()[0] ? loadMiembros()[0].id : "otro");
      }
      if (modo === "items" && itemsFilas.length === 0) agregarItem();
      recalcular();
    }

    btnItems.addEventListener("click", function () { elegirModo("items"); });
    btnPersonas.addEventListener("click", function () { elegirModo("personas"); });
    cambiarModo.addEventListener("click", function () { elegirModo(fila.modo === "items" ? "personas" : "items"); });
    addPersonaBtn.addEventListener("click", function () { agregarPersona("").select.focus(); });
    addItemBtn.addEventListener("click", function () { agregarItem().desc.focus(); });
    restoBtn.addEventListener("click", function () {
      var calc = sumasPorItems();
      var destino = personasFilas.find(function (pf) { return !(fila.modo === "items" && calc.conItem[pf.id]) && !Number(pf.monto.value); });
      if (!destino) { showToast("Todos ya tienen monto: toca \"= lo que falta\" en la persona que pone la diferencia."); return; }
      ponerResto(destino);
    });
    totalInput.addEventListener("input", recalcular);
    desc.addEventListener("input", function () { categoria.sugerirPara(desc.value); });
    desc.addEventListener("blur", function () { desc.value = corregirOrtografia(desc.value); });
    pagadorSelect.addEventListener("change", function () { pagadorTocado = true; refrescarPagador(); });
    metodoOverride.addEventListener("change", function () { fila.alCambiarDia(); });

    function refrescarMetodoOverride() {
      llenarSelect(metodoOverride, [{ value: "", label: "Igual que arriba" }].concat(opcionesMetodo()), metodoOverride.value);
    }

    refrescarMetodoOverride();
    refrescarPagador();

    fila.actualizarTitulo = function () {
      titulo.textContent = (registroEdicion ? "✏️ " : "") + "🤝 Compra dividida" + (registroEdicion ? "" : " (compra " + numeroDeFila(fila) + ")");
      quitar.classList.toggle("hidden", !!registroEdicion);
    };
    fila.enfocar = function () { desc.focus(); };
    fila.monto = function () {
      var calc = sumasPorItems();
      var rep = personasFilas.reduce(function (s, pf) { return s + montoDePersona(pf, calc); }, 0);
      return rep || total();
    };
    fila.cuenta = function () { return (desc.value.trim() || total() || personasFilas.length) ? 1 : 0; };
    fila.alCambiarDia = function () {
      if (!pagadorTocado) {
        var p = pagadorPorMetodo(metodo());
        pagadorSelect.value = p;
        refrescarPagador();
      }
    };
    fila.refrescar = function () {
      refrescarMetodoOverride();
      refrescarPagador();
      categoria.refrescar();
      personasFilas.forEach(function (pf) { llenarSelect(pf.select, opcionesParticipante(), pf.select.value); });
      refrescarOpcionesItems();
    };
    fila.alCambiarDia();

    // Carga un grupo ya guardado para editarlo.
    fila.cargarGrupo = function (miembros) {
      var muestra = miembros[0];
      desc.value = muestra.descripcion || "";
      categoria.cargar(muestra.categoria, muestra.categoriaOtro, muestra.auto);
      totalInput.value = String(muestra.compartidaTotal || miembros.reduce(function (s, m) { return s + (Number(m.monto) || 0); }, 0));
      nota.value = muestra.notas || "";
      fechaAcordada.value = (miembros.map(function (m) { return m.fechaPagoAcordada; }).filter(Boolean)[0]) || "";
      // Quién puso la plata, según cómo quedaron las deudas.
      var conDeuda = miembros.filter(function (m) { return m.acreedor && m.acreedor !== "nadie"; });
      var pagador = "nadie";
      if (conDeuda.some(function (m) { return m.acreedor === "mi"; })) pagador = "yo";
      else if (conDeuda.length) pagador = conDeuda[0].acreedor;
      pagadorSelect.value = pagador;
      pagadorTocado = true;
      refrescarPagador();

      var items = (muestra.items || []).filter(function (it) { return it && it.descripcion; });
      elegirModoSinDefaults(items.length ? "items" : "personas");
      var porNombre = {};
      miembros.forEach(function (m) {
        var esOtro = m.comprador === COMPRADOR_OTRO.id;
        var pf = agregarPersona(esOtro ? "otro" : (m.comprador || YO.id), esOtro ? m.compradorOtro : "", Number(m.monto) || 0);
        porNombre[String(compradorNombre(m)).trim().toLowerCase()] = pf.id;
      });
      items.forEach(function (it) {
        agregarItem({
          descripcion: it.descripcion, monto: it.monto,
          paraValor: it.paraTodos ? "todos" : (porNombre[String(it.paraNombre || "").trim().toLowerCase()] || "todos")
        });
      });
      recalcular();
    };

    function elegirModoSinDefaults(modo) {
      fila.modo = modo;
      elegir.classList.add("hidden");
      cuerpo.classList.remove("hidden");
      itemsBox.classList.toggle("hidden", modo !== "items");
      personasLabel.textContent = modo === "items" ? "👥 Quiénes participan (el monto sale de sus ítems)" : "👥 Cuánto le toca a cada uno";
      cambiarModo.textContent = modo === "items" ? "Cambiar a: solo personas y montos" : "Cambiar a: con detalle de ítems";
    }

    fila.leer = function () {
      error.textContent = "";
      card.classList.remove("reg-fila-error");
      function fallo(msg) {
        error.textContent = msg;
        card.classList.add("reg-fila-error");
        return { error: msg };
      }
      if (!fila.modo) {
        if (!desc.value.trim() && !total()) return { vacia: true };
        return fallo("Elige cómo dividir la compra: con ítems o solo personas y montos.");
      }
      var calc = sumasPorItems();
      var participantes = [];
      var vistos = {};
      var mensaje = null;
      personasFilas.forEach(function (pf) {
        if (mensaje) return;
        var monto = montoDePersona(pf, calc);
        var esOtro = pf.select.value === "otro";
        var nombre = etiquetaPersona(pf);
        if (!pf.select.value) { if (monto) mensaje = "Elige quién es cada persona."; return; }
        if (esOtro && !pf.otro.value.trim()) { mensaje = "Escribe el nombre de cada persona que no está en tu lista."; return; }
        if (!monto || monto <= 0) { mensaje = "A " + nombre + " le falta su monto."; return; }
        var clave = claveDePersona(pf);
        if (vistos[clave]) { mensaje = "Agregaste a " + nombre + " dos veces."; return; }
        vistos[clave] = true;
        participantes.push({ pf: pf, clave: clave, personaId: pf.select.value, esOtro: esOtro, nombre: nombre, monto: Math.round(monto) });
      });
      if (mensaje) return fallo(mensaje);
      if (participantes.length < 2) return fallo("Agrega al menos 2 personas (puedes incluirte a ti).");
      var suma = participantes.reduce(function (s, p) { return s + p.monto; }, 0);
      var t = total();
      if (t && Math.round(t) !== Math.round(suma)) {
        return fallo("Lo repartido (" + formatCurrency(suma) + ") no cuadra con el total (" + formatCurrency(t) +
          "). Usa \"🧮 Calcular lo que falta\" o corrige los montos.");
      }

      var nombrePorId = {};
      participantes.forEach(function (p) { nombrePorId[p.pf.id] = p.nombre; });
      var items = itemsFilas.filter(function (it) { return it.desc.value.trim(); }).map(function (it) {
        var todos = it.para.value === "todos";
        return {
          descripcion: it.desc.value.trim(),
          monto: Number(it.monto.value) || null,
          paraNombre: todos ? null : (nombrePorId[it.para.value] || null),
          paraTodos: todos
        };
      });
      if (fila.modo !== "items") items = [];

      var pagador = pagadorSelect.value;
      var cat = categoria.leer();
      var comun = Object.assign({
        tipo: "unico", cuotas: 1, tieneInteres: false, fechaPago: null,
        categoria: cat.categoria, categoriaOtro: cat.categoriaOtro, auto: cat.auto,
        descripcion: corregirOrtografia(desc.value.trim()) || null,
        fecha: fecha(),
        persona: null, esHogar: false, origenDinero: null, sobreId: null,
        notas: nota.value.trim() || null,
        compartidaTotal: suma,
        compartidaParticipantes: participantes.map(function (p) { return { nombre: p.nombre, monto: p.monto }; }),
        items: items
      }, metodoACampos(metodo()));

      var compras = participantes.map(function (p) {
        var esPagador = (pagador === "yo" && p.personaId === "yo") || (!p.esOtro && p.personaId === pagador);
        var acreedor = pagador === "nadie" || esPagador ? "nadie" : (pagador === "yo" ? "mi" : pagador);
        return Object.assign({}, comun, {
          monto: p.monto,
          comprador: p.esOtro ? COMPRADOR_OTRO.id : p.personaId,
          compradorOtro: p.esOtro ? p.nombre : null,
          mostrarEnEstad: p.esOtro ? false : null,
          acreedor: acreedor,
          fechaPagoAcordada: acreedor !== "nadie" ? (fechaAcordada.value || null) : null,
          _clave: p.clave
        });
      });
      return { compras: compras, dividida: true };
    };

    return fila;
  }

  // =========================================================
  // Lista de filas
  // =========================================================

  function plantillaParaNuevaFila() {
    if (!registroRepetirInput.checked) return null;
    for (var i = filasRegistro.length - 1; i >= 0; i--) {
      if (filasRegistro[i].tipo === "simple") return filasRegistro[i].plantilla();
    }
    var ultima = loadCompras().slice().sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); })[0];
    if (!ultima) return null;
    // De una compra dividida solo sirven la tarjeta y la categoría: cada
    // parte es de una persona distinta.
    var personasUltima = ultima.compartidaId
      ? { duenio: { tipo: "yo" }, pagador: pagadorPorMetodo(metodoDelDia()), debe: true }
      : camposAPersonas(ultima);
    return {
      categoria: ultima.categoria, categoriaOtro: ultima.categoriaOtro, auto: ultima.auto,
      personas: Object.assign(personasUltima, { mostrarEnEstad: !!ultima.mostrarEnEstad }),
      // Si la última fue con otra tarjeta que la del día, se respeta.
      metodoOverride: (ultima.tarjetaId || ultima.metodoPago) !== metodoDelDia() ? (ultima.tarjetaId || ultima.metodoPago || "") : "",
      pagadorTocado: true
    };
  }

  function agregarFila(tipo, enfocar) {
    var plantilla = tipo === "simple" ? plantillaParaNuevaFila() : null;
    var fila = tipo === "dividida" ? buildFilaDividida() : buildFilaSimple();
    filasRegistro.push(fila);
    registroLista.appendChild(fila.el);
    if (plantilla) fila.aplicarPlantilla(plantilla);
    filasRegistro.forEach(function (f) { f.actualizarTitulo(); });
    actualizarTotales();
    actualizarResumenRepetir();
    if (enfocar) {
      fila.enfocar();
      fila.el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    return fila;
  }

  function quitarFila(fila) {
    filasRegistro = filasRegistro.filter(function (f) { return f !== fila; });
    fila.el.remove();
    if (filasRegistro.length === 0) agregarFila("simple");
    filasRegistro.forEach(function (f) { f.actualizarTitulo(); });
    actualizarTotales();
  }

  function actualizarTotales() {
    var cantidad = filasRegistro.reduce(function (s, f) { return s + f.cuenta(); }, 0);
    var total = filasRegistro.reduce(function (s, f) { return s + f.monto(); }, 0);
    if (registroEdicion) {
      registroTotal.textContent = total > 0 ? "Total: " + formatCurrency(total) : "";
      registroGuardarBtn.textContent = "💾 Guardar cambios";
      return;
    }
    registroTotal.textContent = cantidad === 0 ? "Aún no agregas compras" :
      cantidad + (cantidad === 1 ? " compra" : " compras") + " · " + formatCurrency(total);
    registroGuardarBtn.textContent = cantidad > 1 ? "💾 Guardar las " + cantidad + " compras" : "💾 Guardar compra";
  }

  function actualizarResumenRepetir() {
    if (!registroRepetirInput.checked) {
      registroRepetirResumen.textContent = REGISTRO_REPETIR_AYUDA;
      return;
    }
    registroRepetirResumen.textContent = "Activado: cada compra nueva parte igual que la anterior (de quién es, quién pagó y la categoría). Solo escribe qué fue y cuánto.";
  }

  // =========================================================
  // Día y método de pago
  // =========================================================

  function actualizarDia() {
    var f = fechaDelDia();
    var d = new Date(f + "T00:00:00");
    var dias = daysBetweenDates(f, todayStamp());
    var cuando = dias === 0 ? "hoy" : dias === 1 ? "ayer" : dias === 2 ? "anteayer" : dias > 0 ? "hace " + dias + " días" : "en " + (-dias) + " días";
    var diaSemana = DIAS_SEMANA[d.getDay()];
    registroDiaTexto.textContent = diaSemana.charAt(0).toUpperCase() + diaSemana.slice(1) + " " + d.getDate() + " de " + MESES[d.getMonth()] + " (" + cuando + ")";
    registroFechaChips.querySelectorAll(".vista-chip").forEach(function (c) {
      c.classList.toggle("active", addDaysToIso(todayStamp(), -Number(c.dataset.dias)) === f);
    });
    var ciclo = textoCiclo(metodoDelDia(), f);
    registroCicloHint.classList.toggle("hidden", !ciclo);
    if (ciclo) {
      registroCicloHint.textContent = ciclo.texto;
      registroCicloHint.classList.toggle("ciclo-hint-aviso", ciclo.aviso);
    }
    filasRegistro.forEach(function (fila) { fila.alCambiarDia(); });
  }

  registroFecha.addEventListener("change", actualizarDia);
  registroFechaChips.querySelectorAll(".vista-chip").forEach(function (c) {
    c.addEventListener("click", function () {
      registroFecha.value = addDaysToIso(todayStamp(), -Number(c.dataset.dias));
      actualizarDia();
    });
  });
  registroMetodo.addEventListener("change", function () {
    guardarPreferenciaUI("registro_metodo", registroMetodo.value);
    actualizarDia();
  });

  function refrescarOpcionesRegistro() {
    llenarSelect(registroMetodo, opcionesMetodo(), registroMetodo.value || leerPreferenciaUI("registro_metodo", "efectivo"));
    filasRegistro.forEach(function (f) { f.refrescar(); });
  }

  // =========================================================
  // Guardar
  // =========================================================

  function fechasDeSuscripcion(fechaInicial, meses) {
    var fechas = [fechaInicial];
    for (var i = 1; i < meses; i++) fechas.push(addMonthsToIso(fechaInicial, i));
    return fechas;
  }

  function guardarRegistro() {
    var lecturas = filasRegistro.map(function (f) { return { fila: f, r: f.leer() }; });
    var conError = lecturas.filter(function (x) { return x.r.error; });
    if (conError.length) {
      conError[0].fila.el.scrollIntoView({ behavior: "smooth", block: "center" });
      showToast(conError.length === 1 ? "Revisa la compra marcada en rojo." : "Revisa las " + conError.length + " compras marcadas en rojo.");
      return;
    }
    var validas = lecturas.filter(function (x) { return !x.r.vacia; });
    if (!validas.length) {
      showToast("Agrega al menos una compra con su monto.");
      filasRegistro[0].enfocar();
      return;
    }

    if (registroEdicion) return guardarEdicion(validas[0].r);

    var compras = loadCompras();
    var ahora = Date.now();
    var cantidad = 0;
    var total = 0;
    validas.forEach(function (x, i) {
      var r = x.r;
      var marca = ahora + i; // conserva el orden en que se anotaron
      if (r.dividida) {
        var grupoId = uid();
        r.compras.forEach(function (c) {
          var limpia = Object.assign({}, c);
          delete limpia._clave;
          compras.push(Object.assign({ id: uid(), createdAt: marca, compartidaId: grupoId }, limpia));
          if (limpia.compradorOtro) rememberPersona(limpia.compradorOtro);
          total += Number(c.monto) || 0;
        });
        cantidad++;
        return;
      }
      var base = r.compras[0];
      if (base.compradorOtro) rememberPersona(base.compradorOtro);
      if (r.recordatorio) setFijoRecordatorio(base.categoria, r.recordatorio);
      if (r.repetirMeses >= 2) {
        var recurrenceId = uid();
        var fechas = fechasDeSuscripcion(base.fecha, r.repetirMeses);
        fechas.forEach(function (f, j) {
          compras.push(Object.assign({ id: uid(), createdAt: marca }, base, {
            fecha: f, recurrenceId: recurrenceId, recurrenceIndex: j + 1, recurrenceTotal: fechas.length
          }));
        });
      } else {
        compras.push(Object.assign({ id: uid(), createdAt: marca }, base));
      }
      cantidad++;
      total += Number(base.monto) || 0;
    });

    if (!saveCompras(compras)) return;
    resetCompraForm();
    renderAll();
    showToast(cantidad === 1 ? "Compra guardada (" + formatCurrency(total) + ")." :
      "Se guardaron " + cantidad + " compras (" + formatCurrency(total) + ").");
  }

  function guardarEdicion(r) {
    var compras = loadCompras();
    if (registroEdicion.tipo === "compra") {
      var idx = compras.findIndex(function (c) { return c.id === registroEdicion.compra.id; });
      if (idx === -1) { resetCompraForm(); return; }
      var nueva = r.compras[0];
      if (r.recordatorio) setFijoRecordatorio(nueva.categoria, r.recordatorio);
      compras[idx] = Object.assign({}, compras[idx], nueva, { lastEditedAt: Date.now() });
      if (nueva.compradorOtro) rememberPersona(nueva.compradorOtro);
      if (!saveCompras(compras)) return;
      resetCompraForm();
      renderAll();
      showToast("Compra actualizada.");
      return;
    }

    // Grupo dividido: se actualiza cada parte que sigue (conservando si ya
    // te la pagaron), se crean las de personas nuevas y las de quienes se
    // quitaron van a la papelera.
    var grupoId = registroEdicion.miembros[0].compartidaId;
    var existentes = {};
    compras.forEach(function (c) {
      if (c.compartidaId !== grupoId) return;
      var esOtro = c.comprador === COMPRADOR_OTRO.id;
      existentes[esOtro ? "otro::" + String(c.compradorOtro || "").trim().toLowerCase() : (c.comprador || YO.id)] = c;
    });
    var usadas = {};
    var ahora = Date.now();
    r.compras.forEach(function (nueva) {
      var clave = nueva._clave;
      var limpia = Object.assign({}, nueva);
      delete limpia._clave;
      var previa = existentes[clave];
      if (previa) {
        usadas[previa.id] = true;
        Object.assign(previa, limpia, { lastEditedAt: ahora });
      } else {
        compras.push(Object.assign({ id: uid(), createdAt: ahora, compartidaId: grupoId }, limpia));
      }
      if (limpia.compradorOtro) rememberPersona(limpia.compradorOtro);
    });
    var quitadas = compras.filter(function (c) { return c.compartidaId === grupoId && !usadas[c.id] && Object.keys(existentes).some(function (k) { return existentes[k] === c; }); });
    quitadas.forEach(function (c) { addToTrash("compra", c); });
    compras = compras.filter(function (c) { return quitadas.indexOf(c) === -1; });
    if (!saveCompras(compras)) return;
    resetCompraForm();
    renderAll();
    showToast("Compra dividida actualizada" + (quitadas.length ? " (" + quitadas.length + " parte(s) a la papelera)." : "."));
  }

  registroGuardarBtn.addEventListener("click", guardarRegistro);
  registroAgregarBtn.addEventListener("click", function () { agregarFila("simple", true); });
  registroAgregarDivididaBtn.addEventListener("click", function () { agregarFila("dividida", true); });

  registroRepetirInput.checked = leerPreferenciaUI("compra_repetir_ultima", "0") === "1";
  registroRepetirInput.addEventListener("change", function () {
    guardarPreferenciaUI("compra_repetir_ultima", registroRepetirInput.checked ? "1" : "0");
    actualizarResumenRepetir();
    // Si recién se activa y la única fila está en blanco, se rellena ya.
    if (registroRepetirInput.checked && !registroEdicion && filasRegistro.length === 1 &&
        filasRegistro[0].tipo === "simple" && !filasRegistro[0].cuenta()) {
      var pl = plantillaParaNuevaFila();
      if (pl) filasRegistro[0].aplicarPlantilla(pl);
    }
  });

  // =========================================================
  // Abrir / cerrar / editar
  // =========================================================

  function abrirFormularioCompra(conScroll) {
    registroSection.classList.remove("hidden");
    registroToggleBtn.classList.add("hidden");
    guardarPreferenciaUI("compra_form_abierto", "1");
    if (conScroll) registroSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function cerrarFormularioCompra() {
    registroSection.classList.add("hidden");
    registroToggleBtn.classList.remove("hidden");
    guardarPreferenciaUI("compra_form_abierto", "0");
  }

  registroToggleBtn.addEventListener("click", function () {
    abrirFormularioCompra(false);
    if (filasRegistro[0]) filasRegistro[0].enfocar();
  });
  registroCerrarBtn.addEventListener("click", function () {
    if (registroEdicion) resetCompraForm();
    cerrarFormularioCompra();
  });
  registroCancelarBtn.addEventListener("click", function () {
    resetCompraForm();
    showToast("Edición cancelada.");
  });

  function modoEdicionUI(activo) {
    registroAgregar.classList.toggle("hidden", activo);
    registroCancelarBtn.classList.toggle("hidden", !activo);
    registroRepetirInput.closest("label").classList.toggle("hidden", activo);
    registroTitulo.textContent = activo ? "✏️ Editar compra" : "Registrar compras";
    registroSubtitulo.textContent = activo
      ? "Cambia lo que necesites y toca \"Guardar cambios\"."
      : "Elige el día y con qué pagaste, agrega todas las compras de ese día y guárdalas juntas al final.";
  }

  // Deja el formulario listo para registrar compras nuevas (mantiene el día
  // y la tarjeta elegidos: lo normal es seguir con el mismo día).
  function resetCompraForm() {
    registroEdicion = null;
    editingCompraId = null;
    editingCompartidaGrupoId = null;
    modoEdicionUI(false);
    if (!registroFecha.value) registroFecha.value = todayStamp();
    refrescarOpcionesRegistro();
    filasRegistro = [];
    registroLista.innerHTML = "";
    agregarFila("simple");
    actualizarDia();
  }

  function startEditCompra(id) {
    var compra = loadCompras().find(function (c) { return c.id === id; });
    if (!compra) return;
    if (compra.compartidaId) { startEditCompraGrupo(compra.compartidaId); return; }
    registroEdicion = { tipo: "compra", compra: compra };
    editingCompraId = id;
    editingCompartidaGrupoId = null;
    modoEdicionUI(true);
    registroFecha.value = compra.fecha || todayStamp();
    refrescarOpcionesRegistro();
    registroMetodo.value = compra.tarjetaId || compra.metodoPago || "efectivo";
    filasRegistro = [];
    registroLista.innerHTML = "";
    var fila = buildFilaSimple();
    filasRegistro.push(fila);
    registroLista.appendChild(fila.el);
    fila.cargarCompra(compra);
    fila.actualizarTitulo();
    actualizarDia();
    actualizarTotales();
    activateTab("compras");
    abrirFormularioCompra(true);
  }

  function startEditCompraGrupo(grupoId) {
    var miembros = loadCompras().filter(function (c) { return c.compartidaId === grupoId; });
    if (!miembros.length) return;
    registroEdicion = { tipo: "grupo", miembros: miembros };
    editingCompraId = null;
    editingCompartidaGrupoId = grupoId;
    modoEdicionUI(true);
    registroTitulo.textContent = "✏️ Editar compra dividida";
    registroFecha.value = miembros[0].fecha || todayStamp();
    refrescarOpcionesRegistro();
    registroMetodo.value = miembros[0].tarjetaId || miembros[0].metodoPago || "efectivo";
    filasRegistro = [];
    registroLista.innerHTML = "";
    var fila = buildFilaDividida();
    filasRegistro.push(fila);
    registroLista.appendChild(fila.el);
    fila.cargarGrupo(miembros);
    fila.actualizarTitulo();
    actualizarDia();
    actualizarTotales();
    activateTab("compras");
    abrirFormularioCompra(true);
  }

  registroFecha.value = todayStamp();
  if (leerPreferenciaUI("compra_form_abierto", "0") === "1") abrirFormularioCompra(false);
