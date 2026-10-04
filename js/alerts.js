"use strict";

  // =========================================================
  // Avisos al abrir la app: tarjetas por vencer, gastos fijos recurrentes
  // por vencer, y respaldo atrasado.
  // =========================================================

  var appAlertsEl = document.getElementById("app-alerts");
  var FIJO_RECORDATORIO_AVISO_DIAS = 5;

  function markBackupDone() {
    localStorage.setItem(LAST_BACKUP_KEY, String(Date.now()));
  }

  function daysSinceLastBackup() {
    var raw = localStorage.getItem(LAST_BACKUP_KEY);
    if (!raw) return null;
    var diff = Date.now() - Number(raw);
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  }

  function renderAppAlerts() {
    appAlertsEl.innerHTML = "";

    // Aviso: tarjetas que vencen dentro de su ventana de aviso. Las propias
    // solo avisan si su estado de cuenta todavía tiene saldo (si ya está
    // pagado no hay nada que recordar), y dicen cuánto falta. Las tarjetas
    // de otras personas avisan solo por fecha, como recordatorio.
    var propiasPorVencer = tarjetasPorVencerConSaldo();
    var ajenasPorVencer = loadTarjetas().filter(function (t) {
      if (esTarjetaPersonal(t.id)) return false;
      var due = nextDueInfo(t);
      if (!due) return false;
      var aviso = t.diasAviso != null ? t.diasAviso : DEFAULT_DIAS_AVISO;
      return due.daysUntil <= aviso;
    });
    var dueSoonCards = propiasPorVencer.concat(ajenasPorVencer);

    if (dueSoonCards.length > 0) {
      var names = propiasPorVencer.map(function (x) {
        return x.tarjeta.nombre + " (" + dueBadgeLabel(x.dias).toLowerCase() + ", falta " + formatCurrency(x.estado.pendiente) + ")";
      }).concat(ajenasPorVencer.map(function (t) {
        return t.nombre + " (" + dueBadgeLabel(nextDueInfo(t).daysUntil).toLowerCase() + ")";
      })).join(", ");
      var cardAlert = document.createElement("div");
      cardAlert.className = "app-alert";
      var cardText = document.createElement("span");
      cardText.className = "app-alert-text";
      cardText.textContent = "💳 " + (dueSoonCards.length === 1 ? "Tarjeta por pagar: " : "Tarjetas por pagar: ") + names;
      cardAlert.appendChild(cardText);
      var cardBtn = document.createElement("button");
      cardBtn.type = "button";
      cardBtn.className = "btn btn-secondary btn-small";
      cardBtn.textContent = "Ver deuda del mes";
      cardBtn.addEventListener("click", function () { activateTab("deuda-tarjetas"); });
      cardAlert.appendChild(cardBtn);
      appAlertsEl.appendChild(cardAlert);
    }

    // Aviso: gastos fijos con recordatorio mensual configurado (ej. "agua se
    // paga el día 15") que están por vencer.
    var recordatorios = allFijosRecordatorios();
    var fijosPorVencer = Object.keys(recordatorios).map(function (categoriaId) {
      var dia = recordatorios[categoriaId];
      var dueIso = nextOccurrenceOfDay(Number(dia), todayStamp());
      var daysUntil = daysBetweenDates(todayStamp(), dueIso);
      var cat = categoriaById(categoriaId);
      return { label: cat ? cat.label : categoriaId, dueIso: dueIso, daysUntil: daysUntil };
    }).filter(function (r) { return r.daysUntil <= FIJO_RECORDATORIO_AVISO_DIAS; })
      .sort(function (a, b) { return a.daysUntil - b.daysUntil; });

    if (fijosPorVencer.length > 0) {
      var fijoNames = fijosPorVencer.map(function (r) {
        return r.label + " (" + dueBadgeLabel(r.daysUntil).toLowerCase() + ")";
      }).join(", ");
      var fijoAlert = document.createElement("div");
      fijoAlert.className = "app-alert";
      var fijoText = document.createElement("span");
      fijoText.className = "app-alert-text";
      fijoText.textContent = "🏠 " + (fijosPorVencer.length === 1 ? "Gasto fijo por pagar: " : "Gastos fijos por pagar: ") + fijoNames;
      fijoAlert.appendChild(fijoText);
      var fijoBtn = document.createElement("button");
      fijoBtn.type = "button";
      fijoBtn.className = "btn btn-secondary btn-small";
      fijoBtn.textContent = "Ver compras";
      fijoBtn.addEventListener("click", function () { activateTab("compras"); });
      fijoAlert.appendChild(fijoBtn);
      appAlertsEl.appendChild(fijoAlert);
    }

    // Aviso de respaldo: siempre dice cuándo fue el último, y se pone en modo
    // advertencia cuando ya pasó la frecuencia elegida.
    var days = daysSinceLastBackup();
    var cadaDias = loadAutoBackupConfig().cadaDias;
    var atrasado = days === null || days >= cadaDias;
    {
      var backupAlert = document.createElement("div");
      backupAlert.className = "app-alert" + (atrasado ? "" : " app-alert-info");
      var backupText = document.createElement("span");
      backupText.className = "app-alert-text";
      if (days === null) {
        backupText.textContent = "💾 Todavía no has hecho un respaldo.";
      } else if (days === 0) {
        backupText.textContent = "💾 Último respaldo: hoy. Todo al día.";
      } else if (atrasado) {
        backupText.textContent = "💾 No has respaldado hace " + days + " días.";
      } else {
        backupText.textContent = "💾 Último respaldo: hace " + days + (days === 1 ? " día." : " días.");
      }
      backupAlert.appendChild(backupText);
      var backupBtn = document.createElement("button");
      backupBtn.type = "button";
      backupBtn.className = "btn btn-secondary btn-small";
      backupBtn.textContent = "Respaldar ahora";
      backupBtn.addEventListener("click", function () {
        document.getElementById("save-backup-btn").click();
      });
      backupAlert.appendChild(backupBtn);
      appAlertsEl.appendChild(backupAlert);
    }
  }
