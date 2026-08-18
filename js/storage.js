"use strict";

  // ---------- Storage ----------

  function loadFromStorage(key) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error("No se pudieron leer los datos guardados:", e);
      return [];
    }
  }

  function saveToStorage(key, list) {
    try {
      // Antes de escribir, se guarda una foto de cómo estaban los datos (ver
      // js/undo.js). El guardián evita un error si por algún motivo ese
      // archivo no llegó a cargar.
      if (typeof registrarPasoDeshacer === "function") registrarPasoDeshacer(key);
      localStorage.setItem(key, JSON.stringify(list));
      return true;
    } catch (e) {
      console.error("Error al guardar:", e);
      if (e && e.name === "QuotaExceededError") {
        alert("El almacenamiento del navegador está lleno. Usa \"Guardar respaldo (.json)\" para respaldar tus datos.");
      } else {
        alert("Ocurrió un error al guardar los datos.");
      }
      return false;
    }
  }

  function loadTarjetas() {
    return loadFromStorage(TARJETAS_KEY);
  }
  function saveTarjetas(list) {
    return saveToStorage(TARJETAS_KEY, list);
  }
  function loadCompras() {
    return loadFromStorage(COMPRAS_KEY);
  }
  function saveCompras(list) {
    return saveToStorage(COMPRAS_KEY, list);
  }
  function loadAbonos() {
    return loadFromStorage(ABONOS_KEY);
  }
  function saveAbonos(list) {
    return saveToStorage(ABONOS_KEY, list);
  }
  function loadPapelera() {
    return loadFromStorage(PAPELERA_KEY);
  }
  function savePapelera(list) {
    return saveToStorage(PAPELERA_KEY, list);
  }
  function loadPersonasConocidas() {
    return loadFromStorage(PERSONAS_KEY);
  }
  function savePersonasConocidas(list) {
    return saveToStorage(PERSONAS_KEY, list);
  }
  function loadSueldo() {
    return loadFromStorage(SUELDO_KEY);
  }
  function saveSueldo(list) {
    return saveToStorage(SUELDO_KEY, list);
  }

  function loadObjectFromStorage(key) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return {};
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch (e) {
      console.error("No se pudieron leer los datos guardados:", e);
      return {};
    }
  }

  function saveObjectToStorage(key, obj) {
    try {
      if (typeof registrarPasoDeshacer === "function") registrarPasoDeshacer(key);
      localStorage.setItem(key, JSON.stringify(obj));
      return true;
    } catch (e) {
      console.error("Error al guardar:", e);
      return false;
    }
  }

  // =========================================================
  // Personas (miembros del hogar y acreedores)
  // =========================================================
  //
  // "Yo" es implícito y no se guarda en la lista. Cada persona tiene un flag
  // `hogar`: si vive en el hogar puede aparecer como compradora; todas,
  // vivan o no en el hogar, pueden aparecer como acreedoras (ej. mamá).

  function loadMiembros() {
    var raw = localStorage.getItem(MIEMBROS_KEY);
    if (raw === null) {
      saveToStorage(MIEMBROS_KEY, MIEMBROS_DEFAULT);
      return MIEMBROS_DEFAULT.slice();
    }
    return loadFromStorage(MIEMBROS_KEY);
  }

  function saveMiembros(list) {
    return saveToStorage(MIEMBROS_KEY, list);
  }

  function personaById(id) {
    if (id === YO.id) return YO;
    return loadMiembros().find(function (p) { return p.id === id; }) || null;
  }

  function personaNombre(id) {
    if (!id) return "—";
    var p = personaById(id);
    return p ? p.nombre : "Persona eliminada";
  }

  // Quién puede figurar como comprador: yo, los que viven en el hogar, y
  // "Otra persona" para casos sueltos (le presté la tarjeta a alguien, compré
  // algo para un tercero que me lo debe) sin tener que sumarlo al hogar.
  var COMPRADOR_OTRO = { id: "otro", nombre: "Otra persona…" };

  function compradoresDisponibles() {
    return [YO]
      .concat(loadMiembros().filter(function (p) { return p.hogar; }))
      .concat([COMPRADOR_OTRO]);
  }

  // A quién se le puede deber: nadie (gasto propio), a mí, o cualquier persona.
  function acreedoresDisponibles() {
    return [{ id: "nadie", nombre: "Nadie — gasto propio" }, { id: "mi", nombre: "A mí (me deben)" }]
      .concat(loadMiembros().map(function (p) { return { id: p.id, nombre: "A " + p.nombre }; }));
  }

  function acreedorLabel(acreedorId) {
    if (!acreedorId || acreedorId === "nadie") return "Gasto propio";
    if (acreedorId === "mi") return "Me deben";
    return "Debo a " + personaNombre(acreedorId);
  }

  // Una compra genera deuda mía cuando el acreedor es otra persona.
  function esDeudaMia(compra) {
    return !!compra.acreedor && compra.acreedor !== "nadie" && compra.acreedor !== "mi";
  }

  function esMeDeben(compra) {
    return compra.acreedor === "mi";
  }

  // Cuando el acreedor soy yo, el deudor es normalmente quien hizo la compra
  // (ej. papá compró y yo puse la plata). Si la compra la hice yo, el deudor
  // se escribe a mano en el campo de texto libre.
  // Si el nombre escrito a mano coincide con una persona registrada se usa su
  // id: de lo contrario la misma persona abriría dos cuadros de deuda
  // separados ("Colun" escrito a mano y "colun" el integrante del hogar).
  function normalizeDeudorKey(value) {
    if (!value) return "otros";
    if (personaById(value)) return value;
    var registrada = loadMiembros().find(function (p) {
      return p.nombre.toLowerCase() === String(value).toLowerCase();
    });
    return registrada ? registrada.id : value;
  }

  function deudorKey(compra) {
    if (!esMeDeben(compra)) return null;
    if (compra.comprador === COMPRADOR_OTRO.id) return normalizeDeudorKey(compra.compradorOtro);
    if (compra.comprador && compra.comprador !== YO.id) return compra.comprador;
    return normalizeDeudorKey(compra.persona);
  }

  // La clave del deudor puede ser el id de una persona registrada o un nombre
  // escrito a mano; se resuelve primero contra las personas registradas.
  function deudorNombre(key) {
    if (!key) return "—";
    if (key === "otros") return "Sin especificar";
    var p = personaById(key);
    return p ? p.nombre : key;
  }

  // Etiqueta corta para la tabla de compras (sin aclaraciones entre paréntesis).
  function deudaTagText(compra) {
    if (esMeDeben(compra)) return "Me debe " + deudorNombre(deudorKey(compra));
    if (esDeudaMia(compra)) return "Debo a " + personaNombre(compra.acreedor);
    return "Gasto propio";
  }

  function deudaTagClass(compra) {
    if (esMeDeben(compra)) return "me_deben";
    if (esDeudaMia(compra)) return "mama";
    return "personal";
  }

  function compradorNombre(compra) {
    if (compra.comprador === COMPRADOR_OTRO.id) {
      return compra.compradorOtro || "Otra persona";
    }
    return personaNombre(compra.comprador || YO.id);
  }

  // Clave estable para agrupar por comprador: los "otro" se agrupan por el
  // nombre escrito, para que dos compras de la misma persona queden juntas.
  function compradorKey(compra) {
    var id = compra.comprador || YO.id;
    if (id !== COMPRADOR_OTRO.id) return id;
    return "otro::" + String(compra.compradorOtro || "").trim().toLowerCase();
  }

  // ---------- Suscripciones recurrentes ----------
  //
  // Una suscripción de N meses se guarda como N cargos, uno por mes, pero los
  // meses que todavía no llegan son solo una agenda: no se muestran ni se
  // suman como gasto/deuda hasta que sea su mes. Así "van saliendo" solos mes
  // a mes y el total solo cuenta el mes en curso.
  function esCargoFuturo(compra) {
    if (!compra || !compra.recurrenceId) return false;
    return monthKey(compra.fecha) > monthKey(todayStamp());
  }

  // Para el cargo activo de una suscripción (el del mes en curso), la fecha
  // del próximo cobro, si es que quedan meses por venir. Sirve para mostrar
  // "próximo cargo" sin llenar la pantalla con los meses siguientes.
  function suscripcionProximoCargoIso(compra) {
    if (!compra.recurrenceId) return null;
    if (compra.recurrenceIndex >= compra.recurrenceTotal) return null;
    if (monthKey(compra.fecha) !== monthKey(todayStamp())) return null;
    return addMonthsToIso(compra.fecha, 1);
  }

  // ---------- Clasificación hogar / personal ----------
  //
  // Una compra es aporte al hogar o gasto personal, nunca las dos. El sueldo
  // solo cubre gastos personales míos: al hogar no aporta nunca.

  function esAporteHogar(compra) {
    return !!compra.esHogar;
  }

  // Los gastos de una "otra persona" solo aparecen en el panel "Dinero de X"
  // de estadísticas si se marcó explícitamente al registrarlos. Los miembros
  // del hogar (papá, Colun) siempre aparecen.
  function mostrarDineroEnEstad(compra) {
    if (compra.comprador !== COMPRADOR_OTRO.id) return true;
    return !!compra.mostrarEnEstad;
  }

  function esGastoPersonalMio(compra) {
    return !compra.esHogar && (compra.comprador || YO.id) === YO.id;
  }

  function pagaConSueldo(compra) {
    return esGastoPersonalMio(compra) && compra.origenDinero === "sueldo";
  }

  // De qué billetera sale la plata, según cómo se pagó.
  function walletDeCompra(compra) {
    if (compra.tarjetaId) return "tarjeta";
    return compra.metodoPago === "debito" ? "tarjeta" : "efectivo";
  }

  // Sub-etiqueta de la categoría "Autos" (mi auto / auto de papá).
  function autoLabel(autoId) {
    var a = AUTOS.find(function (x) { return x.id === autoId; });
    return a ? a.label : "";
  }

  // ---------- Distribución del sueldo (porcentajes) ----------

  function loadDistribucion() {
    var raw = localStorage.getItem(SUELDO_DISTRIB_KEY);
    if (raw === null) {
      saveToStorage(SUELDO_DISTRIB_KEY, DISTRIBUCION_DEFAULT);
      return DISTRIBUCION_DEFAULT.slice();
    }
    return loadFromStorage(SUELDO_DISTRIB_KEY);
  }

  function saveDistribucion(list) {
    return saveToStorage(SUELDO_DISTRIB_KEY, list);
  }

  function sobreById(id) {
    return loadDistribucion().find(function (s) { return s.id === id; }) || null;
  }

  function sobresDeGasto() {
    return loadDistribucion().filter(function (s) { return s.tipo !== "ahorro"; });
  }

  // ---------- Sobre al que se carga cada compra ----------

  // El sobre elegido a mano en la compra manda; si se dejó en automático se
  // usa la correspondencia por categoría, y si esa categoría no tiene una,
  // cae en el primer sobre de gasto disponible.
  function sobreParaCompra(compra) {
    if (compra.sobreId && sobreById(compra.sobreId)) return compra.sobreId;
    var mapped = SOBRE_MAP_DEFAULT[compra.categoria];
    if (mapped && sobreById(mapped)) return mapped;
    var gasto = sobresDeGasto();
    return gasto.length > 0 ? gasto[0].id : null;
  }

  function sobreNombre(id) {
    var s = sobreById(id);
    return s ? s.nombre : "Sin asignar";
  }

  // Recordatorio de pago recurrente por categoría de gasto fijo (ej. "agua
  // se paga el día 15 de cada mes"), para no tener que reingresar la fecha
  // cada vez que se registra ese gasto.
  function getFijoRecordatorio(categoriaId) {
    var map = loadObjectFromStorage(FIJOS_RECORDATORIOS_KEY);
    return map[categoriaId] || null;
  }

  function setFijoRecordatorio(categoriaId, diaDelMes) {
    var map = loadObjectFromStorage(FIJOS_RECORDATORIOS_KEY);
    map[categoriaId] = diaDelMes;
    saveObjectToStorage(FIJOS_RECORDATORIOS_KEY, map);
  }

  function allFijosRecordatorios() {
    return loadObjectFromStorage(FIJOS_RECORDATORIOS_KEY);
  }

  function rememberPersona(name) {
    if (!name) return;
    var list = loadPersonasConocidas();
    if (list.indexOf(name) === -1) {
      list.push(name);
      savePersonasConocidas(list);
    }
  }

  function categoriaById(id) {
    return CATEGORIAS.find(function (c) { return c.id === id; }) || null;
  }

  function categoriaLabel(compra) {
    if (compra.categoriaOtro) return compra.categoriaOtro;
    var cat = categoriaById(compra.categoria);
    if (!cat) return "Otro";
    if (cat.id === "autos" && compra.auto) {
      var auto = AUTOS.find(function (a) { return a.id === compra.auto; });
      if (auto) return "Autos · " + auto.label;
    }
    return cat.label;
  }

  function categoriaGroup(compra) {
    var cat = categoriaById(compra.categoria);
    return cat ? cat.group : "variable";
  }

  // La descripción es opcional: si no se ingresó, se muestra la categoría
  // en su lugar para que la fila nunca se vea vacía.
  function compraDisplayName(compra) {
    return compra.descripcion || categoriaLabel(compra);
  }

  // ---------- Compras compartidas entre varias personas ----------
  //
  // Cada participante vive como una compra normal aparte (ver compras.js),
  // pero todas guardan una copia de con quién y de los ítems, para poder
  // mostrar el contexto completo sin tener que buscar a sus "hermanas".

  function compartidaParticipantesTexto(compra) {
    if (!compra.compartidaParticipantes) return "";
    return compra.compartidaParticipantes.map(function (p) { return p.nombre; }).join(", ");
  }

  function itemsResumenTexto(compra) {
    if (!compra.items || !compra.items.length) return "";
    return compra.items.map(function (it) {
      return it.descripcion + (it.monto ? " (" + formatCurrency(it.monto) + ")" : "");
    }).join(" · ");
  }

  // Cómo se pagó una compra: tarjeta real, o efectivo/débito cuando no hay
  // tarjeta asociada.
  function metodoPagoLabel(compra) {
    if (compra.tarjetaId) return tarjetaLabel(compra.tarjetaId);
    return compra.metodoPago === "debito" ? "Débito" : "Efectivo";
  }

  function tarjetaById(id) {
    return loadTarjetas().find(function (t) { return t.id === id; }) || null;
  }

  function tarjetaLabel(id) {
    if (!id) return "Efectivo / Transferencia";
    var t = tarjetaById(id);
    if (!t) return "Tarjeta eliminada";
    return t.nombre + (t.owner && t.owner !== "mia" ? " (" + personaNombre(t.owner) + ")" : "");
  }

  // Tarjetas propias: son las únicas que generan deuda con el banco a mi
  // nombre. Las de otras personas solo sirven para llevar el registro de
  // cuánto se gasta con ellas.
  function misTarjetas() {
    return loadTarjetas().filter(function (t) { return !t.owner || t.owner === "mia"; });
  }

  function esTarjetaPersonal(tarjetaId) {
    if (!tarjetaId) return false;
    var t = tarjetaById(tarjetaId);
    return !!t && (!t.owner || t.owner === "mia");
  }

  // =========================================================
  // Migración al modelo comprador / acreedor
  // =========================================================
  //
  // El modelo anterior tenía un solo campo `debeTipo` (personal | mama |
  // me_deben). Ahora comprador y acreedor son independientes, así que se
  // traducen los registros viejos una sola vez.

  function migrateData() {
    migrateHogar();
    if (localStorage.getItem(MIGRACION_KEY)) return;

    var compras = loadCompras();
    var cambiosCompras = false;
    compras.forEach(function (c) {
      if (c.comprador && c.acreedor) return;
      c.comprador = c.comprador || YO.id;
      if (!c.acreedor) {
        if (c.debeTipo === "mama") c.acreedor = "mama";
        else if (c.debeTipo === "me_deben") c.acreedor = "mi";
        else c.acreedor = "nadie";
      }
      if (c.categoria === "transporte") c.categoria = "autos";
      cambiosCompras = true;
    });
    if (cambiosCompras) saveCompras(compras);

    var abonos = loadAbonos();
    var cambiosAbonos = false;
    abonos.forEach(function (a) {
      if (a.tipo === "mama") {
        a.tipo = "deuda_mia";
        a.acreedor = "mama";
        cambiosAbonos = true;
      }
    });
    if (cambiosAbonos) saveAbonos(abonos);

    var tarjetas = loadTarjetas();
    var cambiosTarjetas = false;
    tarjetas.forEach(function (t) {
      if (!t.owner) { t.owner = "mia"; cambiosTarjetas = true; }
    });
    if (cambiosTarjetas) saveTarjetas(tarjetas);

    localStorage.setItem(MIGRACION_KEY, String(Date.now()));
  }

  // Segunda migración: marca hogar/personal en los registros anteriores a
  // que existiera la pregunta, y saca del sueldo los gastos del hogar.
  function migrateHogar() {
    if (localStorage.getItem(MIGRACION_HOGAR_KEY)) return;

    var compras = loadCompras();
    compras.forEach(function (c) {
      if (c.esHogar === undefined) c.esHogar = categoriaGroup(c) === "fijo";
      if (c.esHogar) c.origenDinero = null;
    });
    saveCompras(compras);

    var sueldo = loadSueldo();
    sueldo.forEach(function (s) {
      if (!s.destino && s.origen !== "retiro") s.destino = "tarjeta";
    });
    saveSueldo(sueldo);

    // El sueldo ya no cubre gastos del hogar, así que ese sobre deja de tener
    // sentido: su porcentaje se traspasa al ahorro. Se agrega "Gustos y
    // regalos" si falta, porque el mapeo por defecto lo usa.
    var distribucion = loadDistribucion();
    var hogarIdx = distribucion.findIndex(function (s) { return s.id === "hogar"; });
    if (hogarIdx !== -1) {
      var liberado = Number(distribucion[hogarIdx].porcentaje) || 0;
      distribucion.splice(hogarIdx, 1);
      var ahorro = distribucion.find(function (s) { return s.id === "ahorro"; });
      if (ahorro) ahorro.porcentaje = (Number(ahorro.porcentaje) || 0) + liberado;
    }
    if (!distribucion.some(function (s) { return s.id === "gustos"; })) {
      distribucion.push({ id: "gustos", nombre: "Gustos y regalos", porcentaje: 0, tipo: "gasto" });
    }
    distribucion.forEach(function (s) {
      if (!s.tipo) s.tipo = s.id === "ahorro" ? "ahorro" : "gasto";
    });
    saveDistribucion(distribucion);

    localStorage.setItem(MIGRACION_HOGAR_KEY, String(Date.now()));
  }
