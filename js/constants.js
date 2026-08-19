"use strict";

  var TARJETAS_KEY = "finanzas_tarjetas_v1";
  var COMPRAS_KEY = "finanzas_compras_v1";
  var ABONOS_KEY = "finanzas_abonos_v1"; // abonos/devoluciones: deudas propias, me deben, o pagos a una tarjeta de crédito
  var PAPELERA_KEY = "finanzas_papelera_v1";
  var LAST_BACKUP_KEY = "finanzas_last_backup_at";
  var AUTO_BACKUP_KEY = "finanzas_autobackup_v1"; // { activo, cadaDias }
  var PERSONAS_KEY = "finanzas_personas_conocidas_v1"; // nombres sueltos usados en "me deben" (autocompletar)
  var MIEMBROS_KEY = "finanzas_miembros_v1"; // personas del hogar / acreedores configurables
  var SUELDO_KEY = "finanzas_sueldo_v1"; // ingresos personales, independiente del resto de las finanzas
  var SUELDO_DISTRIB_KEY = "finanzas_sueldo_distribucion_v1"; // [{ id, nombre, porcentaje, tipo }]
  var FIJOS_RECORDATORIOS_KEY = "finanzas_fijos_recordatorios_v1"; // { categoriaId: diaDelMes }
  var MIGRACION_KEY = "finanzas_migracion_v2"; // marca de migración al modelo comprador/acreedor
  var MIGRACION_HOGAR_KEY = "finanzas_migracion_hogar_v1"; // marca de migración al modelo hogar/personal

  var MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

  // Categorías de compra, agrupadas para las dos vistas pedidas: gastos fijos
  // (incluye suscripciones, porque también son recurrentes) y compras variables.
  var CATEGORIAS = [
    { id: "agua", label: "Agua", group: "fijo" },
    { id: "luz", label: "Luz", group: "fijo" },
    { id: "gas", label: "Gas", group: "fijo" },
    { id: "gnc", label: "GNC", group: "fijo" },
    { id: "bencina", label: "Bencina", group: "fijo" },
    { id: "internet", label: "Internet", group: "fijo" },
    { id: "tv_cable", label: "TV Cable", group: "fijo" },
    { id: "arriendo", label: "Arriendo / Gastos comunes", group: "fijo" },
    { id: "supermercado", label: "Supermercado", group: "fijo" },
    { id: "carne", label: "Carne", group: "fijo" },
    { id: "verduleria", label: "Verdulería", group: "fijo" },
    { id: "pescaderia", label: "Pescadería", group: "fijo" },
    { id: "pollo", label: "Pollo", group: "fijo" },
    { id: "saco_papas", label: "Saco de papas", group: "fijo" },
    { id: "farmacia", label: "Farmacia", group: "fijo" },
    { id: "otro_fijo", label: "Otro gasto fijo", group: "fijo" },
    { id: "netflix", label: "Netflix", group: "suscripcion" },
    { id: "youtube", label: "YouTube", group: "suscripcion" },
    { id: "otra_suscripcion", label: "Otra suscripción", group: "suscripcion" },
    { id: "ropa", label: "Ropa", group: "variable" },
    { id: "tecnologia", label: "Tecnología", group: "variable" },
    { id: "salud", label: "Salud", group: "variable" },
    { id: "ocio", label: "Ocio / Entretenimiento", group: "variable" },
    { id: "regalos", label: "Regalos", group: "variable" },
    { id: "autos", label: "Autos", group: "variable" },
    { id: "otro_variable", label: "Otra compra variable", group: "variable" }
  ];

  var CATEGORIA_GROUP_LABELS = {
    fijo: "Gastos fijos",
    suscripcion: "Suscripciones/Streaming",
    variable: "Compras variables"
  };

  // Sub-opción de la categoría "Autos": el gasto puede ser de mi auto o del
  // auto de papá, para poder separarlos después en estadísticas.
  var AUTOS = [
    { id: "mio", label: "Mi auto" },
    { id: "papa", label: "Auto de papá" }
  ];

  // "Yo" siempre existe y no se puede eliminar: es el dueño de la app.
  var YO = { id: "yo", nombre: "Yo", hogar: true };

  // Personas por defecto la primera vez que se abre la app. Se pueden agregar
  // o eliminar desde la pestaña Tarjetas → "Personas".
  var MIEMBROS_DEFAULT = [
    { id: "papa", nombre: "Papá", hogar: true },
    { id: "colun", nombre: "Colun", hogar: true },
    { id: "mama", nombre: "Mamá", hogar: false }
  ];

  // "Sobres" del sueldo. El sueldo no cubre gastos del hogar, así que la
  // distribución es solo personal. El sobre de tipo "ahorro" no se llena con
  // gastos: se llena con lo que sobra al final del periodo.
  var DISTRIBUCION_DEFAULT = [
    { id: "ahorro", nombre: "Ahorro", porcentaje: 40, tipo: "ahorro" },
    { id: "compras", nombre: "Compras", porcentaje: 25, tipo: "gasto" },
    { id: "gustos", nombre: "Gustos y regalos", porcentaje: 20, tipo: "gasto" },
    { id: "varios", nombre: "Varios", porcentaje: 15, tipo: "gasto" }
  ];

  // Correspondencia categoría → sobre, para no tener que elegirlo en cada
  // compra. Se puede corregir compra por compra desde el formulario.
  var SOBRE_MAP_DEFAULT = {
    ropa: "compras",
    tecnologia: "compras",
    ocio: "gustos",
    netflix: "gustos",
    youtube: "gustos",
    otra_suscripcion: "gustos",
    salud: "varios",
    autos: "varios",
    otro_variable: "varios"
  };

  var editingTarjetaId = null;
  var editingCompraId = null;
  var editingSueldoId = null;
  var pendingDelete = null; // { type: "tarjeta" | "compra" | "abono" | "sueldo", id }
  var currentEstadPeriod = "all";
  // Las estadísticas del sueldo arrancan en el mes en curso: cada mes parte
  // limpio y los anteriores quedan a un clic en el selector de periodo.
  var currentSueldoPeriod = (function () {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
  })();
