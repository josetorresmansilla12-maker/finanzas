"use strict";

  // =========================================================
  // DESHACER / REHACER
  //
  // Antes de cada guardado que toca datos reales (compras, deudas,
  // tarjetas, personas, sueldo...) se guarda una foto completa de cómo
  // estaban esas claves justo antes del cambio. "Deshacer" vuelve a la foto
  // anterior; "Rehacer" avanza otra vez. El historial vive solo en memoria:
  // al recargar la página se reinicia, igual que el deshacer de la mayoría
  // de las aplicaciones.
  //
  // No se toca nada de esto: la configuración de sincronización, el código
  // secreto, ni la fecha del último respaldo — esas cosas son de este
  // dispositivo, no "datos" que el usuario esté editando.
  // =========================================================

  var UNDO_KEYS = [
    TARJETAS_KEY, COMPRAS_KEY, ABONOS_KEY, PAPELERA_KEY, PERSONAS_KEY,
    MIEMBROS_KEY, SUELDO_KEY, SUELDO_DISTRIB_KEY, FIJOS_RECORDATORIOS_KEY
  ];
  var UNDO_MAX_PASOS = 25;
  // Varios guardados que ocurren juntos (ej. "marcar pagada" guarda un abono
  // y después la compra) cuentan como un solo paso de deshacer, no dos.
  var UNDO_COALESCE_MS = 500;

  var undoStack = [];
  var redoStack = [];
  var lastSnapshotAt = 0;

  function buildUndoSnapshot() {
    var snap = {};
    UNDO_KEYS.forEach(function (k) {
      var raw = localStorage.getItem(k);
      if (raw !== null) snap[k] = raw;
    });
    return snap;
  }

  // Escribe directo en localStorage (sin pasar por saveToStorage) para que
  // aplicar un deshacer/rehacer no cuente como un paso nuevo.
  function aplicarUndoSnapshot(snap) {
    UNDO_KEYS.forEach(function (k) {
      if (snap[k] !== undefined) localStorage.setItem(k, snap[k]);
      else localStorage.removeItem(k);
    });
  }

  // Se llama justo antes de escribir cualquier clave de datos (ver
  // storage.js). Si la clave no es una de las que se siguen, no hace nada.
  function registrarPasoDeshacer(key) {
    if (UNDO_KEYS.indexOf(key) === -1) return;
    var ahora = Date.now();
    if (ahora - lastSnapshotAt < UNDO_COALESCE_MS) return;
    undoStack.push(buildUndoSnapshot());
    if (undoStack.length > UNDO_MAX_PASOS) undoStack.shift();
    redoStack = [];
    lastSnapshotAt = ahora;
    actualizarBotonesUndo();
  }

  function refrescarFormulariosTrasUndo() {
    if (typeof resetCompraForm === "function") resetCompraForm();
    if (typeof resetTarjetaForm === "function") resetTarjetaForm();
    if (typeof resetSueldoForm === "function") resetSueldoForm();
    renderAll();
  }

  function deshacer() {
    if (undoStack.length === 0) {
      showToast("No hay nada que deshacer.");
      return;
    }
    redoStack.push(buildUndoSnapshot());
    aplicarUndoSnapshot(undoStack.pop());
    lastSnapshotAt = Date.now();
    refrescarFormulariosTrasUndo();
    actualizarBotonesUndo();
    showToast("Cambio deshecho.");
  }

  function rehacer() {
    if (redoStack.length === 0) {
      showToast("No hay nada que rehacer.");
      return;
    }
    undoStack.push(buildUndoSnapshot());
    aplicarUndoSnapshot(redoStack.pop());
    lastSnapshotAt = Date.now();
    refrescarFormulariosTrasUndo();
    actualizarBotonesUndo();
    showToast("Cambio rehecho.");
  }

  var undoBtn = document.getElementById("undo-btn");
  var redoBtn = document.getElementById("redo-btn");

  function actualizarBotonesUndo() {
    if (undoBtn) {
      undoBtn.disabled = undoStack.length === 0;
      undoBtn.title = undoStack.length ? ("Deshacer (" + undoStack.length + " paso(s) disponibles)") : "No hay nada que deshacer";
    }
    if (redoBtn) {
      redoBtn.disabled = redoStack.length === 0;
      redoBtn.title = redoStack.length ? ("Rehacer (" + redoStack.length + " paso(s) disponibles)") : "No hay nada que rehacer";
    }
  }

  if (undoBtn) undoBtn.addEventListener("click", deshacer);
  if (redoBtn) redoBtn.addEventListener("click", rehacer);

  // Ctrl/Cmd+Z y Ctrl/Cmd+Shift+Z, pero solo si el foco no está en un campo
  // de texto: ahí debe funcionar el deshacer normal del navegador (para
  // corregir lo que se está escribiendo), no el de la app.
  document.addEventListener("keydown", function (e) {
    var mod = e.metaKey || e.ctrlKey;
    if (!mod || e.key.toLowerCase() !== "z") return;
    var activo = document.activeElement;
    var enCampoDeTexto = activo && /^(INPUT|TEXTAREA|SELECT)$/.test(activo.tagName);
    if (enCampoDeTexto) return;
    e.preventDefault();
    if (e.shiftKey) rehacer(); else deshacer();
  });

  actualizarBotonesUndo();
