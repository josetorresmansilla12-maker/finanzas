"use strict";

  // ---------- Confirm delete modal (compartido) ----------

  var confirmModal = document.getElementById("confirm-modal");
  var confirmMessage = document.getElementById("confirm-message");
  var confirmDeleteBtn = document.getElementById("confirm-delete-btn");
  var confirmCancelBtn = document.getElementById("confirm-cancel-btn");

  function requestDelete(type, id) {
    pendingDelete = { type: type, id: id };
    var messages = {
      tarjeta: "¿Mover esta tarjeta a la papelera? Las compras ya registradas con ella se conservan.",
      compra: "¿Mover esta compra a la papelera?",
      abono: "¿Eliminar esta devolución/abono? La deuda pendiente aumentará de nuevo en ese monto.",
      sueldo: "¿Mover este ingreso a la papelera?"
    };
    confirmMessage.textContent = messages[type] || messages.compra;
    confirmModal.classList.remove("hidden");
  }

  function closeConfirmModal() {
    pendingDelete = null;
    confirmModal.classList.add("hidden");
  }

  confirmCancelBtn.addEventListener("click", closeConfirmModal);
  confirmModal.addEventListener("click", function (e) {
    if (e.target === confirmModal) closeConfirmModal();
  });

  // Un reembolso aplicado al banco vive en dos registros: el abono de "me
  // deben" y el abono de la tarjeta que lo agrupa. Al borrar el primero hay
  // que restar su monto del segundo (y eliminarlo si queda en cero).
  function descontarDeAbonoDeBanco(abonos, removedAbono) {
    if (!removedAbono || removedAbono.tipo !== "me_deben" || !removedAbono.aplicadoAlBanco) return abonos;
    var monto = Number(removedAbono.amount) || 0;

    return abonos.filter(function (a) {
      if (a.tipo !== "tarjeta" || !Array.isArray(a.origenReembolsos)) return true;
      if (a.origenReembolsos.indexOf(removedAbono.id) === -1) return true;
      a.amount = Math.max(0, (Number(a.amount) || 0) - monto);
      a.origenReembolsos = a.origenReembolsos.filter(function (id) { return id !== removedAbono.id; });
      return a.amount > 0;
    });
  }

  function addToTrash(type, data) {
    var trash = loadPapelera();
    var entryId = uid();
    trash.push({ id: entryId, type: type, data: data, deletedAt: Date.now() });
    savePapelera(trash);
    return entryId;
  }

  confirmDeleteBtn.addEventListener("click", function () {
    if (!pendingDelete) return;

    var trashedEntryId = null;

    if (pendingDelete.type === "tarjeta") {
      var tarjetas = loadTarjetas();
      var tIdx = tarjetas.findIndex(function (t) { return t.id === pendingDelete.id; });
      if (tIdx !== -1) {
        var removedTarjeta = tarjetas.splice(tIdx, 1)[0];
        trashedEntryId = addToTrash("tarjeta", removedTarjeta);
        saveTarjetas(tarjetas);
      }
      if (editingTarjetaId === pendingDelete.id) resetTarjetaForm();
    } else if (pendingDelete.type === "compra") {
      var compras = loadCompras();
      var cIdx = compras.findIndex(function (c) { return c.id === pendingDelete.id; });
      if (cIdx !== -1) {
        var removedCompra = compras.splice(cIdx, 1)[0];
        trashedEntryId = addToTrash("compra", removedCompra);
        saveCompras(compras);
      }
      if (editingCompraId === pendingDelete.id) resetCompraForm();
    } else if (pendingDelete.type === "abono") {
      var abonos = loadAbonos();
      var aIdx = abonos.findIndex(function (a) { return a.id === pendingDelete.id; });
      if (aIdx !== -1) {
        var removedAbono = abonos.splice(aIdx, 1)[0];
        trashedEntryId = addToTrash("abono", removedAbono);
        // Si este reembolso ya se había traspasado al banco, hay que bajar
        // también el abono de la tarjeta: si no, la deuda de la tarjeta
        // quedaría más baja de lo que realmente es.
        abonos = descontarDeAbonoDeBanco(abonos, removedAbono);
        saveAbonos(abonos);
      }
    } else if (pendingDelete.type === "sueldo") {
      var sueldos = loadSueldo();
      var sIdx = sueldos.findIndex(function (s) { return s.id === pendingDelete.id; });
      if (sIdx !== -1) {
        var removedSueldo = sueldos.splice(sIdx, 1)[0];
        trashedEntryId = addToTrash("sueldo", removedSueldo);
        saveSueldo(sueldos);
      }
      if (editingSueldoId === pendingDelete.id) resetSueldoForm();
    }

    closeConfirmModal();
    updateTrashCount();
    renderAll();
    if (trashedEntryId) {
      showToast("Movido a la papelera.", "Deshacer", function () { restoreTrashItem(trashedEntryId); });
    } else {
      showToast("Movido a la papelera.");
    }
  });

  // ---------- Papelera ----------

  var trashModal = document.getElementById("trash-modal");
  var trashList = document.getElementById("trash-list");
  var trashEmptyState = document.getElementById("trash-empty-state");
  var trashCountBadge = document.getElementById("trash-count-badge");
  var openTrashBtn = document.getElementById("open-trash-btn");
  var closeTrashBtn = document.getElementById("close-trash-btn");
  var emptyTrashBtn = document.getElementById("empty-trash-btn");

  function daysAgoLabel(timestamp) {
    var days = Math.floor((Date.now() - timestamp) / (1000 * 60 * 60 * 24));
    if (days <= 0) return "hoy";
    if (days === 1) return "hace 1 día";
    return "hace " + days + " días";
  }

  function trashItemInfo(entry) {
    if (entry.type === "tarjeta") {
      var owner = entry.data.owner;
      return { icon: "💳", title: entry.data.nombre, meta: "Tarjeta " + (!owner || owner === "mia" ? "mía" : "de " + personaNombre(owner)) };
    }
    if (entry.type === "compra") {
      return { icon: "🧾", title: compraDisplayName(entry.data), meta: formatCurrency(entry.data.monto) + " · " + formatDateDisplay(entry.data.fecha) };
    }
    if (entry.type === "abono") {
      var abono = entry.data;
      var who = abono.tipo === "tarjeta"
        ? tarjetaLabel(abono.tarjetaId)
        : (abono.tipo === "deuda_mia" ? personaNombre(abono.acreedor) : deudorNombre(abono.persona));
      return { icon: "💰", title: who, meta: "Devolución/abono · " + formatCurrency(abono.amount) };
    }
    if (entry.type === "sueldo") {
      return { icon: "💵", title: entry.data.concepto || "Ingreso", meta: formatCurrency(entry.data.monto) + " · " + formatDateDisplay(entry.data.fecha) };
    }
    return { icon: "❓", title: "Registro", meta: "" };
  }

  function restoreTrashItem(entryId) {
    var trash = loadPapelera();
    var idx = trash.findIndex(function (e) { return e.id === entryId; });
    if (idx === -1) return;
    var entry = trash[idx];

    if (entry.type === "tarjeta") {
      var tarjetas = loadTarjetas();
      tarjetas.push(entry.data);
      saveTarjetas(tarjetas);
    } else if (entry.type === "compra") {
      var compras = loadCompras();
      compras.push(entry.data);
      saveCompras(compras);
    } else if (entry.type === "abono") {
      var abonos = loadAbonos();
      abonos.push(entry.data);
      saveAbonos(abonos);
    } else if (entry.type === "sueldo") {
      var sueldos = loadSueldo();
      sueldos.push(entry.data);
      saveSueldo(sueldos);
    }

    trash.splice(idx, 1);
    savePapelera(trash);
    renderTrashModal();
    updateTrashCount();
    renderAll();
    showToast("Registro restaurado.");
  }

  function permanentlyDeleteTrashItem(entryId) {
    if (!confirm("¿Eliminar este registro para siempre? Esta acción no se puede deshacer.")) return;
    var trash = loadPapelera().filter(function (e) { return e.id !== entryId; });
    savePapelera(trash);
    renderTrashModal();
    updateTrashCount();
  }

  function renderTrashModal() {
    var trash = loadPapelera().slice().sort(function (a, b) { return b.deletedAt - a.deletedAt; });

    trashList.innerHTML = "";
    trashEmptyState.classList.toggle("hidden", trash.length !== 0);

    trash.forEach(function (entry) {
      var info = trashItemInfo(entry);

      var row = document.createElement("div");
      row.className = "trash-item";

      var infoWrap = document.createElement("div");
      infoWrap.className = "trash-item-info";

      var icon = document.createElement("span");
      icon.className = "trash-item-icon";
      icon.textContent = info.icon;
      infoWrap.appendChild(icon);

      var textWrap = document.createElement("div");
      var title = document.createElement("div");
      title.className = "trash-item-title";
      title.textContent = info.title;
      var meta = document.createElement("div");
      meta.className = "trash-item-meta";
      meta.textContent = info.meta + " · Eliminado " + daysAgoLabel(entry.deletedAt);
      textWrap.appendChild(title);
      textWrap.appendChild(meta);
      infoWrap.appendChild(textWrap);

      row.appendChild(infoWrap);

      var actions = document.createElement("div");
      actions.className = "trash-item-actions";

      var restoreBtn = document.createElement("button");
      restoreBtn.type = "button";
      restoreBtn.className = "btn btn-secondary btn-small";
      restoreBtn.textContent = "Restaurar";
      restoreBtn.addEventListener("click", function () { restoreTrashItem(entry.id); });

      var permDeleteBtn = document.createElement("button");
      permDeleteBtn.type = "button";
      permDeleteBtn.className = "btn btn-danger btn-small";
      permDeleteBtn.textContent = "Eliminar definitivo";
      permDeleteBtn.addEventListener("click", function () { permanentlyDeleteTrashItem(entry.id); });

      actions.appendChild(restoreBtn);
      actions.appendChild(permDeleteBtn);
      row.appendChild(actions);

      trashList.appendChild(row);
    });
  }

  function updateTrashCount() {
    var count = loadPapelera().length;
    trashCountBadge.textContent = count > 0 ? " (" + count + ")" : "";
  }

  openTrashBtn.addEventListener("click", function () {
    renderTrashModal();
    trashModal.classList.remove("hidden");
  });
  closeTrashBtn.addEventListener("click", function () {
    trashModal.classList.add("hidden");
  });
  trashModal.addEventListener("click", function (e) {
    if (e.target === trashModal) trashModal.classList.add("hidden");
  });
  emptyTrashBtn.addEventListener("click", function () {
    var trash = loadPapelera();
    if (trash.length === 0) return;
    if (!confirm("¿Vaciar la papelera por completo? Se eliminarán " + trash.length + " registro(s) para siempre.")) return;
    savePapelera([]);
    renderTrashModal();
    updateTrashCount();
    showToast("Papelera vaciada.");
  });

  // ---------- Eliminar todos los datos ----------

  var deleteAllDataBtn = document.getElementById("delete-all-data-btn");
  var deleteAllConfirmModal = document.getElementById("delete-all-confirm-modal");
  var deleteAllCancelBtn = document.getElementById("delete-all-cancel-btn");
  var deleteAllConfirmBtn = document.getElementById("delete-all-confirm-btn");

  deleteAllDataBtn.addEventListener("click", function () {
    deleteAllConfirmModal.classList.remove("hidden");
  });
  deleteAllCancelBtn.addEventListener("click", function () {
    deleteAllConfirmModal.classList.add("hidden");
  });
  deleteAllConfirmModal.addEventListener("click", function (e) {
    if (e.target === deleteAllConfirmModal) deleteAllConfirmModal.classList.add("hidden");
  });
  deleteAllConfirmBtn.addEventListener("click", function () {
    [TARJETAS_KEY, COMPRAS_KEY, ABONOS_KEY, PAPELERA_KEY, PERSONAS_KEY, MIEMBROS_KEY, SUELDO_KEY,
     SUELDO_DISTRIB_KEY, FIJOS_RECORDATORIOS_KEY, MIGRACION_KEY,
     MIGRACION_HOGAR_KEY, LAST_BACKUP_KEY].forEach(function (key) {
      localStorage.removeItem(key);
    });
    deleteAllConfirmModal.classList.add("hidden");
    resetTarjetaForm();
    resetCompraForm();
    resetSueldoForm();
    renderAll();
    showToast("Se eliminaron todos los datos.");
  });
