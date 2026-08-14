"use strict";

  // =========================================================
  // PERSONAS — integrantes del hogar y acreedores configurables.
  // "Yo" es fijo: siempre existe y no se puede editar ni eliminar.
  // =========================================================

  var personasListEl = document.getElementById("personas-list");
  var personaForm = document.getElementById("persona-form");
  var personaNuevoNombreInput = document.getElementById("persona-nuevo-nombre");
  var personaNuevoHogarInput = document.getElementById("persona-nuevo-hogar");
  var personaNuevoNombreError = document.getElementById("error-persona-nuevo-nombre");

  // Genera un id estable a partir del nombre ("Tía Marta" → "tia_marta"),
  // agregando sufijo numérico si ya existe uno igual.
  function personaIdFromNombre(nombre) {
    var base = String(nombre).toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    if (!base) base = "persona";
    var taken = loadMiembros().map(function (p) { return p.id; }).concat([YO.id]);
    var id = base;
    var n = 2;
    while (taken.indexOf(id) !== -1) {
      id = base + "_" + n;
      n++;
    }
    return id;
  }

  // Cuántos registros quedarían huérfanos si se elimina esta persona.
  function personaUsageCount(id) {
    var compras = loadCompras().filter(function (c) {
      return c.comprador === id || c.acreedor === id || c.persona === id;
    }).length;
    var tarjetas = loadTarjetas().filter(function (t) { return t.owner === id; }).length;
    var abonos = loadAbonos().filter(function (a) { return a.persona === id || a.acreedor === id; }).length;
    return compras + tarjetas + abonos;
  }

  // ---------- Selects que dependen de la lista de personas ----------

  function fillSelectOptions(selectEl, options) {
    if (!selectEl) return;
    var previousValue = selectEl.value;
    selectEl.innerHTML = "";
    options.forEach(function (opt) {
      var o = document.createElement("option");
      o.value = opt.value;
      o.textContent = opt.label;
      selectEl.appendChild(o);
    });
    if (Array.from(selectEl.options).some(function (o) { return o.value === previousValue; })) {
      selectEl.value = previousValue;
    }
  }

  function populatePersonaSelects() {
    var compradores = compradoresDisponibles().map(function (p) {
      return { value: p.id, label: p.nombre };
    });
    var acreedores = acreedoresDisponibles().map(function (p) {
      return { value: p.id, label: p.nombre };
    });

    fillSelectOptions(document.getElementById("compra-comprador"), compradores);
    fillSelectOptions(document.getElementById("compra-acreedor"), acreedores);

    fillSelectOptions(document.getElementById("tarjeta-owner"),
      [{ value: "mia", label: "Mía" }].concat(loadMiembros().map(function (p) {
        return { value: p.id, label: "De " + p.nombre };
      })));

    fillSelectOptions(document.getElementById("compras-filter-comprador"),
      [{ value: "", label: "Todos los compradores" }].concat(compradores));

    fillSelectOptions(document.getElementById("compras-filter-acreedor"),
      [{ value: "", label: "Todas las deudas" }].concat(acreedores));
  }

  // ---------- Alta / baja ----------

  personaForm.addEventListener("submit", function (e) {
    e.preventDefault();
    personaNuevoNombreError.textContent = "";

    var nombre = personaNuevoNombreInput.value.trim();
    if (!nombre) {
      personaNuevoNombreError.textContent = "Escribe el nombre de la persona.";
      return;
    }
    var miembros = loadMiembros();
    var yaExiste = miembros.some(function (p) { return p.nombre.toLowerCase() === nombre.toLowerCase(); });
    if (yaExiste || nombre.toLowerCase() === YO.nombre.toLowerCase()) {
      personaNuevoNombreError.textContent = "Ya existe una persona con ese nombre.";
      return;
    }

    miembros.push({ id: personaIdFromNombre(nombre), nombre: nombre, hogar: personaNuevoHogarInput.checked });
    if (saveMiembros(miembros)) {
      personaNuevoNombreInput.value = "";
      personaNuevoHogarInput.checked = true;
      renderAll();
      showToast(nombre + " agregada a la lista de personas.");
    }
  });

  function togglePersonaHogar(id) {
    var miembros = loadMiembros();
    var persona = miembros.find(function (p) { return p.id === id; });
    if (!persona) return;
    persona.hogar = !persona.hogar;
    if (saveMiembros(miembros)) {
      renderAll();
      showToast(persona.nombre + (persona.hogar ? " ahora aparece como compradora." : " ya no aparece como compradora."));
    }
  }

  function deletePersona(id) {
    var persona = personaById(id);
    if (!persona) return;
    var usos = personaUsageCount(id);
    var mensaje = usos > 0
      ? "¿Eliminar a " + persona.nombre + "? Hay " + usos + " registro(s) asociados: seguirán guardados, pero aparecerán como \"Persona eliminada\"."
      : "¿Eliminar a " + persona.nombre + " de la lista de personas?";
    if (!confirm(mensaje)) return;

    var miembros = loadMiembros().filter(function (p) { return p.id !== id; });
    if (saveMiembros(miembros)) {
      renderAll();
      showToast(persona.nombre + " eliminada.");
    }
  }

  // ---------- Render ----------

  function buildPersonaRow(persona, esYo) {
    var row = document.createElement("div");
    row.className = "persona-row";

    var info = document.createElement("div");
    info.className = "persona-row-info";

    var nameEl = document.createElement("span");
    nameEl.className = "persona-nombre";
    nameEl.textContent = persona.nombre;
    info.appendChild(nameEl);

    var metaEl = document.createElement("span");
    metaEl.className = "persona-meta";
    if (esYo) {
      metaEl.textContent = "Vive en el hogar · no se puede eliminar";
    } else {
      var usos = personaUsageCount(persona.id);
      metaEl.textContent = (persona.hogar ? "Vive en el hogar" : "Solo acreedor/a") +
        (usos > 0 ? " · " + usos + " registro(s)" : "");
    }
    info.appendChild(metaEl);
    row.appendChild(info);

    var actions = document.createElement("div");
    actions.className = "persona-row-actions";

    if (!esYo) {
      var hogarBtn = document.createElement("button");
      hogarBtn.type = "button";
      hogarBtn.className = "btn btn-secondary btn-small";
      hogarBtn.textContent = persona.hogar ? "Quitar del hogar" : "Marcar del hogar";
      hogarBtn.addEventListener("click", function () { togglePersonaHogar(persona.id); });
      actions.appendChild(hogarBtn);

      var deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "btn btn-danger btn-small";
      deleteBtn.textContent = "Eliminar";
      deleteBtn.addEventListener("click", function () { deletePersona(persona.id); });
      actions.appendChild(deleteBtn);
    }

    row.appendChild(actions);
    return row;
  }

  function renderPersonas() {
    personasListEl.innerHTML = "";
    personasListEl.appendChild(buildPersonaRow(YO, true));
    loadMiembros().forEach(function (p) {
      personasListEl.appendChild(buildPersonaRow(p, false));
    });
    populatePersonaSelects();
  }
