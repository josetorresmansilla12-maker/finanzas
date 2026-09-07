"use strict";

  // ---------- Init ----------

  // Traduce los datos guardados con el modelo anterior (un solo campo de
  // deuda) al modelo comprador/acreedor. Corre una sola vez.
  migrateData();
  migrateCategorias();

  resetTarjetaForm();
  resetCompraForm();
  resetSueldoForm();
  updateComprasFilterClearBtn();

  renderAll();
  renderRespaldoEstado();
  intentarRespaldoAutomatico();
