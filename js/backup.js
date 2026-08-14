"use strict";

  // =========================================================
  // Respaldo combinado (Guardar / Importar)
  // =========================================================

  function buildBackupPayload() {
    return JSON.stringify({
      tarjetas: loadTarjetas(),
      compras: loadCompras(),
      abonos: loadAbonos(),
      personasConocidas: loadPersonasConocidas(),
      miembros: loadMiembros(),
      sueldo: loadSueldo(),
      distribucionSueldo: loadDistribucion(),
      fijosRecordatorios: allFijosRecordatorios(),
      exportedAt: new Date().toISOString()
    }, null, 2);
  }

  document.getElementById("save-backup-btn").addEventListener("click", function () {
    var filename = "finanzas_respaldo_" + todayStamp() + "_" + nowTimeStamp() + ".json";
    downloadFile(filename, buildBackupPayload(), "application/json");
    markBackupDone();
    renderAppAlerts();
    renderRespaldoEstado();
    showToast("Respaldo guardado el " + nowDisplayDateTime() + ".");
  });

  var pendingImportData = null;

  document.getElementById("import-file-input").addEventListener("change", function (e) {
    var file = e.target.files[0];
    if (!file) return;

    var reader = new FileReader();
    reader.onload = function (evt) {
      try {
        var imported = JSON.parse(evt.target.result);
        var importedTarjetas = [];
        var importedCompras = [];
        var importedAbonos = [];
        var importedPersonas = [];
        var importedMiembros = [];
        var importedSueldo = [];
        var importedFijosRecordatorios = {};

        if (imported && typeof imported === "object") {
          if (Array.isArray(imported.tarjetas)) importedTarjetas = imported.tarjetas;
          if (Array.isArray(imported.compras)) importedCompras = imported.compras;
          if (Array.isArray(imported.abonos)) importedAbonos = imported.abonos;
          if (Array.isArray(imported.personasConocidas)) importedPersonas = imported.personasConocidas;
          if (Array.isArray(imported.miembros)) importedMiembros = imported.miembros;
          if (Array.isArray(imported.sueldo)) importedSueldo = imported.sueldo;
          if (imported.fijosRecordatorios && typeof imported.fijosRecordatorios === "object") importedFijosRecordatorios = imported.fijosRecordatorios;
        } else {
          throw new Error("Formato inválido");
        }

        var validTarjetas = importedTarjetas.every(function (item) { return item && typeof item.nombre === "string"; });
        var validCompras = importedCompras.every(function (item) { return item && typeof item.fecha === "string"; });
        var validAbonos = importedAbonos.every(function (item) { return item && item.amount !== undefined; });
        var validSueldo = importedSueldo.every(function (item) { return item && item.monto !== undefined; });
        if (!validTarjetas || !validCompras || !validAbonos || !validSueldo) throw new Error("Formato inválido");

        var existingTarjetas = loadTarjetas();
        var existingTarjetaIds = new Set(existingTarjetas.map(function (t) { return t.id; }));
        var tarjetaIdRemap = {};
        importedTarjetas.forEach(function (item) {
          var originalId = item.id;
          if (!item.id || existingTarjetaIds.has(item.id)) {
            item.id = uid();
            if (originalId) tarjetaIdRemap[originalId] = item.id;
          }
          if (!item.createdAt) item.createdAt = Date.now();
          existingTarjetaIds.add(item.id);
        });

        var existingCompras = loadCompras();
        var existingCompraIds = new Set(existingCompras.map(function (c) { return c.id; }));
        importedCompras.forEach(function (item) {
          if (!item.id || existingCompraIds.has(item.id)) item.id = uid();
          if (!item.createdAt) item.createdAt = Date.now();
          if (item.tarjetaId && tarjetaIdRemap[item.tarjetaId]) item.tarjetaId = tarjetaIdRemap[item.tarjetaId];
          existingCompraIds.add(item.id);
        });

        var existingAbonos = loadAbonos();
        var existingAbonoIds = new Set(existingAbonos.map(function (a) { return a.id; }));
        importedAbonos.forEach(function (item) {
          if (!item.id || existingAbonoIds.has(item.id)) item.id = uid();
          if (!item.createdAt) item.createdAt = Date.now();
          if (item.tarjetaId && tarjetaIdRemap[item.tarjetaId]) item.tarjetaId = tarjetaIdRemap[item.tarjetaId];
          if (item.aplicarATarjetaId && tarjetaIdRemap[item.aplicarATarjetaId]) item.aplicarATarjetaId = tarjetaIdRemap[item.aplicarATarjetaId];
          existingAbonoIds.add(item.id);
        });

        var existingSueldo = loadSueldo();
        var existingSueldoIds = new Set(existingSueldo.map(function (s) { return s.id; }));
        importedSueldo.forEach(function (item) {
          if (!item.id || existingSueldoIds.has(item.id)) item.id = uid();
          if (!item.createdAt) item.createdAt = Date.now();
          existingSueldoIds.add(item.id);
        });

        var existingPersonas = loadPersonasConocidas();
        var mergedPersonas = existingPersonas.slice();
        importedPersonas.forEach(function (p) { if (mergedPersonas.indexOf(p) === -1) mergedPersonas.push(p); });

        // Los miembros del hogar se mezclan por id: los existentes mandan,
        // para no pisar cambios locales de nombre o de "vive en el hogar".
        var mergedMiembros = loadMiembros().slice();
        var miembroIds = new Set(mergedMiembros.map(function (m) { return m.id; }));
        importedMiembros.forEach(function (m) {
          if (m && m.id && !miembroIds.has(m.id)) {
            mergedMiembros.push(m);
            miembroIds.add(m.id);
          }
        });

        var mergedFijosRecordatorios = Object.assign({}, allFijosRecordatorios(), importedFijosRecordatorios);

        pendingImportData = {
          mergedTarjetas: existingTarjetas.concat(importedTarjetas),
          mergedCompras: existingCompras.concat(importedCompras),
          mergedAbonos: existingAbonos.concat(importedAbonos),
          mergedPersonas: mergedPersonas,
          mergedMiembros: mergedMiembros,
          mergedSueldo: existingSueldo.concat(importedSueldo),
          mergedFijosRecordatorios: mergedFijosRecordatorios,
          counts: { tarjetas: importedTarjetas.length, compras: importedCompras.length, abonos: importedAbonos.length, sueldo: importedSueldo.length }
        };

        document.getElementById("import-confirm-message").textContent =
          "El archivo contiene " + importedTarjetas.length + " tarjeta(s), " +
          importedCompras.length + " compra(s), " + importedAbonos.length +
          " devolución/abono(s) y " + importedSueldo.length + " ingreso(s) de sueldo. " +
          "Se mezclarán con los datos actuales sin borrar nada existente. ¿Confirmar importación?";
        document.getElementById("import-confirm-modal").classList.remove("hidden");
      } catch (err) {
        alert("No se pudo importar el archivo. Asegúrate de que sea un respaldo válido (.json) exportado desde esta misma app.");
        console.error(err);
      } finally {
        e.target.value = "";
      }
    };
    reader.readAsText(file);
  });

  document.getElementById("import-confirm-ok-btn").addEventListener("click", function () {
    if (!pendingImportData) return;
    var d = pendingImportData;
    pendingImportData = null;
    document.getElementById("import-confirm-modal").classList.add("hidden");
    var okTarjetas = saveTarjetas(d.mergedTarjetas);
    var okCompras = saveCompras(d.mergedCompras);
    var okAbonos = saveAbonos(d.mergedAbonos);
    var okSueldo = saveSueldo(d.mergedSueldo);
    savePersonasConocidas(d.mergedPersonas);
    saveMiembros(d.mergedMiembros);
    saveObjectToStorage(FIJOS_RECORDATORIOS_KEY, d.mergedFijosRecordatorios);
    if (okTarjetas && okCompras && okAbonos && okSueldo) {
      renderAll();
      showToast("Se importaron " + d.counts.tarjetas + " tarjeta(s), " + d.counts.compras + " compra(s), " + d.counts.abonos + " devolución/abono(s) y " + d.counts.sueldo + " ingreso(s).");
    }
  });

  document.getElementById("import-confirm-cancel-btn").addEventListener("click", function () {
    pendingImportData = null;
    document.getElementById("import-confirm-modal").classList.add("hidden");
  });

  // =========================================================
  // Respaldo automático
  //
  // El navegador no puede escribir archivos a escondidas: hay que elegir el
  // archivo UNA vez y él guarda el permiso. Desde ahí sí se sobrescribe solo,
  // sin preguntar nada. Eso solo existe en computador con Chrome o Edge; en
  // el teléfono no hay forma, así que ahí queda el aviso con la fecha del
  // último respaldo.
  // =========================================================

  var respaldoEstadoEl = document.getElementById("respaldo-estado");
  var respaldoFrecuenciaSelect = document.getElementById("respaldo-frecuencia");
  var respaldoAutoBtn = document.getElementById("respaldo-auto-btn");
  var respaldoAutoOffBtn = document.getElementById("respaldo-auto-off-btn");
  var respaldoAutoHint = document.getElementById("respaldo-auto-hint");

  var IDB_NAME = "finanzas_respaldo";
  var IDB_STORE = "handles";

  function idbOpen() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = function () { req.result.createObjectStore(IDB_STORE); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function idbSet(key, value) {
    return idbOpen().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(IDB_STORE, "readwrite");
        tx.objectStore(IDB_STORE).put(value, key);
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function idbGet(key) {
    return idbOpen().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(IDB_STORE, "readonly");
        var req = tx.objectStore(IDB_STORE).get(key);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function soportaRespaldoAutomatico() {
    return typeof window.showSaveFilePicker === "function";
  }

  function loadAutoBackupConfig() {
    var cfg = loadObjectFromStorage(AUTO_BACKUP_KEY);
    return { activo: !!cfg.activo, cadaDias: Number(cfg.cadaDias) || 3 };
  }

  function saveAutoBackupConfig(cfg) {
    saveObjectToStorage(AUTO_BACKUP_KEY, cfg);
  }

  function lastBackupDisplay() {
    var raw = localStorage.getItem(LAST_BACKUP_KEY);
    if (!raw) return null;
    var d = new Date(Number(raw));
    var fecha = String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0") + "/" + d.getFullYear();
    var hora = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
    return fecha + " a las " + hora;
  }

  function escribirRespaldoEnArchivo(handle) {
    return handle.createWritable().then(function (writable) {
      return writable.write(buildBackupPayload()).then(function () {
        return writable.close();
      });
    }).then(function () {
      markBackupDone();
    });
  }

  function activarRespaldoAutomatico() {
    if (!soportaRespaldoAutomatico()) {
      alert("Este navegador no permite escribir el archivo solo. Funciona en el computador con Chrome o Edge. " +
            "En el teléfono usa el botón \"Guardar respaldo\" cuando aparezca el aviso.");
      return;
    }
    window.showSaveFilePicker({
      suggestedName: "finanzas_respaldo.json",
      types: [{ description: "Respaldo de Mis Finanzas", accept: { "application/json": [".json"] } }]
    }).then(function (handle) {
      return idbSet("archivo", handle).then(function () {
        var cfg = loadAutoBackupConfig();
        cfg.activo = true;
        saveAutoBackupConfig(cfg);
        return escribirRespaldoEnArchivo(handle);
      });
    }).then(function () {
      renderRespaldoEstado();
      renderAppAlerts();
      showToast("Respaldo automático activado. Se guardará solo cada " + loadAutoBackupConfig().cadaDias + " día(s).");
    }).catch(function () {
      // El usuario canceló el selector de archivo: no hay nada que hacer.
    });
  }

  function desactivarRespaldoAutomatico() {
    var cfg = loadAutoBackupConfig();
    cfg.activo = false;
    saveAutoBackupConfig(cfg);
    renderRespaldoEstado();
    showToast("Respaldo automático desactivado.");
  }

  // Se llama al abrir la app: si toca respaldar y el permiso sigue vigente,
  // escribe sin molestar. Si el navegador pide reconfirmar, no insiste: lo
  // deja anotado en la pantalla de Respaldos.
  function intentarRespaldoAutomatico() {
    var cfg = loadAutoBackupConfig();
    if (!cfg.activo || !soportaRespaldoAutomatico()) return;

    var dias = daysSinceLastBackup();
    if (dias !== null && dias < cfg.cadaDias) return;

    idbGet("archivo").then(function (handle) {
      if (!handle) return;
      return handle.queryPermission({ mode: "readwrite" }).then(function (permiso) {
        if (permiso !== "granted") {
          renderRespaldoEstado(true);
          return;
        }
        return escribirRespaldoEnArchivo(handle).then(function () {
          renderRespaldoEstado();
          renderAppAlerts();
          showToast("Respaldo automático guardado.");
        });
      });
    }).catch(function (e) {
      console.error("No se pudo hacer el respaldo automático:", e);
    });
  }

  function renderRespaldoEstado(necesitaPermiso) {
    if (!respaldoEstadoEl) return;
    var cfg = loadAutoBackupConfig();
    respaldoFrecuenciaSelect.value = String(cfg.cadaDias);

    var dias = daysSinceLastBackup();
    var cuando = lastBackupDisplay();
    var texto;
    if (cuando === null) {
      texto = "⚠️ Todavía no has hecho ningún respaldo.";
      respaldoEstadoEl.className = "respaldo-estado aviso";
    } else {
      var hace = dias === 0 ? "hoy" : (dias === 1 ? "hace 1 día" : "hace " + dias + " días");
      texto = "Último respaldo: " + hace + " (" + cuando + ").";
      respaldoEstadoEl.className = "respaldo-estado" + (dias >= cfg.cadaDias ? " aviso" : " ok");
    }
    respaldoEstadoEl.textContent = texto;

    respaldoAutoBtn.classList.toggle("hidden", cfg.activo);
    respaldoAutoOffBtn.classList.toggle("hidden", !cfg.activo);

    if (!soportaRespaldoAutomatico()) {
      respaldoAutoHint.textContent = "En este navegador el respaldo automático no está disponible (funciona en computador con Chrome o Edge). " +
        "Acá te avisamos cuándo toca y lo guardas con el botón de arriba.";
    } else if (necesitaPermiso) {
      respaldoAutoHint.textContent = "⚠️ El navegador pide volver a autorizar el archivo. Presiona \"Activar respaldo automático\" y elige el mismo archivo.";
    } else if (cfg.activo) {
      respaldoAutoHint.textContent = "Activado: cada " + cfg.cadaDias + " día(s) la app sobrescribe sola el archivo que elegiste, sin preguntarte nada.";
    } else {
      respaldoAutoHint.textContent = "Eliges un archivo una sola vez y desde ahí la app lo actualiza sola, sin volver a preguntarte.";
    }
  }

  respaldoAutoBtn.addEventListener("click", activarRespaldoAutomatico);
  respaldoAutoOffBtn.addEventListener("click", desactivarRespaldoAutomatico);
  respaldoFrecuenciaSelect.addEventListener("change", function () {
    var cfg = loadAutoBackupConfig();
    cfg.cadaDias = Number(respaldoFrecuenciaSelect.value) || 3;
    saveAutoBackupConfig(cfg);
    renderRespaldoEstado();
    renderAppAlerts();
  });
