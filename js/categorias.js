"use strict";

  // =========================================================
  // EDITAR CATEGORÍAS (⚙️ Configuración → Categorías)
  //
  // Las compras guardan solo el id de su categoría; el nombre y el grupo
  // (fijo / suscripción / variable) se leen siempre de CATEGORIAS. Por eso
  // renombrar o cambiar de grupo una categoría se refleja al tiro en todas
  // las compras, también en las antiguas, sin tener que tocarlas una por una.
  //
  // - Ocultar: deja de aparecer al registrar compras nuevas, pero las que ya
  //   la usan la siguen mostrando con su nombre.
  // - Eliminar: si tiene compras, hay que elegir a qué categoría pasarlas
  //   (sirve también para juntar dos categorías en una).
  // =========================================================

  var categoriasConfigList = document.getElementById("categorias-config-list");
  var categoriaNuevaForm = document.getElementById("categoria-nueva-form");
  var categoriaNuevaNombre = document.getElementById("categoria-nueva-nombre");
  var categoriaNuevaGrupo = document.getElementById("categoria-nueva-grupo");
  var errorCategoriaNueva = document.getElementById("error-categoria-nueva");

  // Fila con el panel de "¿eliminar?" abierto, y grupos desplegados:
  // sobreviven al re-render que sigue a cada cambio.
  var categoriaEliminando = null;
  var gruposCategoriasAbiertos = new Set();

  var GRUPO_CORTO = { fijo: "Gasto fijo", suscripcion: "Suscripción", variable: "Compra variable" };

  function copiaCategorias() {
    return CATEGORIAS.map(function (c) { return { id: c.id, label: c.label, group: c.group, oculta: !!c.oculta }; });
  }

  function usoPorCategoria() {
    var uso = {};
    loadCompras().forEach(function (c) { uso[c.categoria] = (uso[c.categoria] || 0) + 1; });
    return uso;
  }

  function nombreRepetido(nombre, exceptoId) {
    var n = nombre.trim().toLowerCase();
    return CATEGORIAS.some(function (c) { return c.id !== exceptoId && c.label.trim().toLowerCase() === n; });
  }

  function guardarCategoriasYRefrescar(lista, mensaje) {
    if (!saveCategorias(lista)) return;
    renderAll();
    if (mensaje) showToast(mensaje);
  }

  // ---------- Acciones ----------

  function renombrarCategoria(id, nuevoNombre) {
    var nombre = corregirOrtografia(String(nuevoNombre || "").trim());
    var actual = categoriaById(id);
    if (!actual || nombre === actual.label) return;
    if (!nombre) {
      showToast("El nombre no puede quedar vacío.");
      renderCategoriasConfig();
      return;
    }
    if (nombreRepetido(nombre, id)) {
      showToast("Ya existe una categoría llamada \"" + nombre + "\".");
      renderCategoriasConfig();
      return;
    }
    var lista = copiaCategorias();
    lista.forEach(function (c) { if (c.id === id) c.label = nombre; });
    guardarCategoriasYRefrescar(lista, "\"" + actual.label + "\" ahora se llama \"" + nombre + "\".");
  }

  function cambiarGrupoCategoria(id, grupo) {
    var lista = copiaCategorias();
    var cat = lista.find(function (c) { return c.id === id; });
    if (!cat || cat.group === grupo) return;
    cat.group = grupo;
    gruposCategoriasAbiertos.add(grupo);
    // Se mueve al final de su nuevo grupo, para que la lista siga ordenada.
    lista = lista.filter(function (c) { return c.id !== id; }).concat([cat]);
    guardarCategoriasYRefrescar(lista, "\"" + cat.label + "\" ahora es " + GRUPO_CORTO[grupo].toLowerCase() + ".");
  }

  function alternarOcultaCategoria(id) {
    var lista = copiaCategorias();
    var cat = lista.find(function (c) { return c.id === id; });
    if (!cat) return;
    cat.oculta = !cat.oculta;
    guardarCategoriasYRefrescar(lista, cat.oculta
      ? "\"" + cat.label + "\" ya no aparece al registrar compras nuevas."
      : "\"" + cat.label + "\" vuelve a aparecer al registrar compras.");
  }

  function eliminarCategoria(id, destinoId) {
    var cat = categoriaById(id);
    if (!cat || CATEGORIAS_PROTEGIDAS.indexOf(id) !== -1) return;
    var compras = loadCompras();
    var afectadas = compras.filter(function (c) { return c.categoria === id; });
    if (afectadas.length > 0) {
      var destino = categoriaById(destinoId);
      if (!destino || destinoId === id) {
        showToast("Elige a qué categoría pasar sus compras.");
        return;
      }
      afectadas.forEach(function (c) {
        c.categoria = destinoId;
        // El sub-dato de "Autos" solo tiene sentido en esa categoría.
        if (destinoId !== "autos") c.auto = null;
      });
      if (!saveCompras(compras)) return;
    }
    categoriaEliminando = null;
    var lista = copiaCategorias().filter(function (c) { return c.id !== id; });
    guardarCategoriasYRefrescar(lista, afectadas.length > 0
      ? "Categoría eliminada. Sus " + afectadas.length + " compra(s) pasaron a \"" + categoriaById(destinoId).label + "\"."
      : "Categoría \"" + cat.label + "\" eliminada.");
  }

  categoriaNuevaForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var nombre = corregirOrtografia(categoriaNuevaNombre.value.trim());
    errorCategoriaNueva.textContent = "";
    if (!nombre) {
      errorCategoriaNueva.textContent = "Escribe el nombre de la categoría.";
      return;
    }
    if (nombreRepetido(nombre, null)) {
      errorCategoriaNueva.textContent = "Ya existe una categoría con ese nombre.";
      return;
    }
    var lista = copiaCategorias();
    lista.push({ id: "cat_" + uid().slice(3), label: nombre, group: categoriaNuevaGrupo.value, oculta: false });
    categoriaNuevaNombre.value = "";
    gruposCategoriasAbiertos.add(categoriaNuevaGrupo.value);
    guardarCategoriasYRefrescar(lista, "Categoría \"" + nombre + "\" agregada.");
  });

  // ---------- Render ----------

  function buildPanelEliminar(cat, usos) {
    var panel = document.createElement("div");
    panel.className = "categoria-eliminar-panel";

    var texto = document.createElement("span");
    var destinoSelect = null;
    if (usos > 0) {
      texto.textContent = "\"" + cat.label + "\" tiene " + usos + (usos === 1 ? " compra" : " compras") + ". ¿A qué categoría las paso?";
      panel.appendChild(texto);
      destinoSelect = document.createElement("select");
      ["fijo", "suscripcion", "variable"].forEach(function (grupo) {
        var og = document.createElement("optgroup");
        og.label = CATEGORIA_GROUP_LABELS[grupo];
        CATEGORIAS.filter(function (c) { return c.group === grupo && c.id !== cat.id; }).forEach(function (c) {
          var opt = document.createElement("option");
          opt.value = c.id;
          opt.textContent = c.label + (c.oculta ? " (oculta)" : "");
          og.appendChild(opt);
        });
        if (og.children.length) destinoSelect.appendChild(og);
      });
      // Por defecto, la "otra" de su mismo grupo.
      var otraDelGrupo = { fijo: "otro_fijo", suscripcion: "otra_suscripcion", variable: "otro_variable" }[cat.group];
      if (categoriaById(otraDelGrupo)) destinoSelect.value = otraDelGrupo;
      panel.appendChild(destinoSelect);
    } else {
      texto.textContent = "¿Eliminar \"" + cat.label + "\"? No tiene compras.";
      panel.appendChild(texto);
    }

    var confirmarBtn = document.createElement("button");
    confirmarBtn.type = "button";
    confirmarBtn.className = "btn btn-danger btn-small";
    confirmarBtn.textContent = usos > 0 ? "Mover y eliminar" : "Sí, eliminar";
    confirmarBtn.addEventListener("click", function () {
      eliminarCategoria(cat.id, destinoSelect ? destinoSelect.value : null);
    });
    panel.appendChild(confirmarBtn);

    var cancelarBtn = document.createElement("button");
    cancelarBtn.type = "button";
    cancelarBtn.className = "btn btn-secondary btn-small";
    cancelarBtn.textContent = "Cancelar";
    cancelarBtn.addEventListener("click", function () {
      categoriaEliminando = null;
      renderCategoriasConfig();
    });
    panel.appendChild(cancelarBtn);
    return panel;
  }

  function buildCategoriaRow(cat, usos) {
    var protegida = CATEGORIAS_PROTEGIDAS.indexOf(cat.id) !== -1;
    var wrap = document.createElement("div");
    wrap.className = "categoria-config-item" + (cat.oculta ? " categoria-oculta" : "");

    var row = document.createElement("div");
    row.className = "categoria-config-row";

    var nombreInput = document.createElement("input");
    nombreInput.type = "text";
    nombreInput.value = cat.label;
    nombreInput.maxLength = 40;
    nombreInput.className = "categoria-nombre-input";
    nombreInput.setAttribute("aria-label", "Nombre de la categoría " + cat.label);
    nombreInput.addEventListener("change", function () { renombrarCategoria(cat.id, nombreInput.value); });
    nombreInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); nombreInput.blur(); }
    });
    row.appendChild(nombreInput);

    var grupoSelect = document.createElement("select");
    grupoSelect.className = "categoria-grupo-select";
    grupoSelect.setAttribute("aria-label", "Grupo de " + cat.label);
    ["fijo", "suscripcion", "variable"].forEach(function (g) {
      var opt = document.createElement("option");
      opt.value = g;
      opt.textContent = GRUPO_CORTO[g];
      grupoSelect.appendChild(opt);
    });
    grupoSelect.value = cat.group;
    grupoSelect.disabled = protegida;
    if (protegida) grupoSelect.title = "Las categorías \"otra/otro\" se quedan en su grupo.";
    grupoSelect.addEventListener("change", function () { cambiarGrupoCategoria(cat.id, grupoSelect.value); });
    row.appendChild(grupoSelect);

    var usoEl = document.createElement("span");
    usoEl.className = "categoria-uso";
    usoEl.textContent = usos === 0 ? "sin compras" : usos + (usos === 1 ? " compra" : " compras");
    row.appendChild(usoEl);

    var ocultarBtn = document.createElement("button");
    ocultarBtn.type = "button";
    ocultarBtn.className = "btn btn-outline btn-small";
    ocultarBtn.textContent = cat.oculta ? "👁️ Mostrar" : "🙈 Ocultar";
    ocultarBtn.title = cat.oculta ? "Volver a ofrecerla al registrar compras" : "Que no aparezca al registrar compras nuevas";
    ocultarBtn.addEventListener("click", function () { alternarOcultaCategoria(cat.id); });
    row.appendChild(ocultarBtn);

    var eliminarBtn = document.createElement("button");
    eliminarBtn.type = "button";
    eliminarBtn.className = "btn btn-danger btn-small";
    eliminarBtn.textContent = "Eliminar";
    eliminarBtn.disabled = protegida;
    if (protegida) eliminarBtn.title = "Esta categoría es para anotar a mano otras cosas: se puede renombrar u ocultar, pero no eliminar.";
    eliminarBtn.addEventListener("click", function () {
      categoriaEliminando = cat.id;
      renderCategoriasConfig();
    });
    row.appendChild(eliminarBtn);

    wrap.appendChild(row);
    if (categoriaEliminando === cat.id) wrap.appendChild(buildPanelEliminar(cat, usos));
    return wrap;
  }

  function renderCategoriasConfig() {
    if (!categoriasConfigList) return;
    var uso = usoPorCategoria();
    categoriasConfigList.innerHTML = "";
    ["fijo", "suscripcion", "variable"].forEach(function (grupo) {
      var cats = CATEGORIAS.filter(function (c) { return c.group === grupo; });
      var bloque = document.createElement("details");
      bloque.className = "categoria-grupo-bloque";
      bloque.open = gruposCategoriasAbiertos.has(grupo);
      bloque.addEventListener("toggle", function () {
        if (bloque.open) gruposCategoriasAbiertos.add(grupo); else gruposCategoriasAbiertos.delete(grupo);
      });
      var titulo = document.createElement("summary");
      var ocultas = cats.filter(function (c) { return c.oculta; }).length;
      titulo.textContent = CATEGORIA_GROUP_LABELS[grupo] + " (" + cats.length + (ocultas ? ", " + ocultas + " oculta" + (ocultas === 1 ? "" : "s") : "") + ")";
      bloque.appendChild(titulo);
      if (cats.length === 0) {
        var vacio = document.createElement("p");
        vacio.className = "label-hint";
        vacio.textContent = "No hay categorías en este grupo.";
        bloque.appendChild(vacio);
      }
      cats.forEach(function (c) { bloque.appendChild(buildCategoriaRow(c, uso[c.id] || 0)); });
      categoriasConfigList.appendChild(bloque);
    });
  }
