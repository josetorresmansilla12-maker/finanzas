"use strict";

  // ---------- Tabs ----------
  //
  // "tarjetas" es el id histórico de la pestaña que hoy se llama
  // ⚙️ Configuración (tarjetas, personas, sincronización y respaldos): se
  // mantiene el id para no romper los atajos que ya la abren por nombre.
  // Juntas ya no es una pestaña aparte: vive como segundo modo dentro de la
  // Calculadora (ver mostrarModoCalculadora).

  var TABS = ["compras", "avisos", "vercompras", "deudas", "deuda-tarjetas", "estadisticas", "sueldo", "informes", "calculadora", "tarjetas"];

  function tabBtn(tab) { return document.getElementById("tab-" + tab + "-btn"); }
  function tabPanel(tab) { return document.getElementById("tab-" + tab); }

  function showTabPanels(tab) {
    TABS.forEach(function (t) { tabPanel(t).classList.toggle("hidden", t !== tab); });
  }

  function activateTab(tab) {
    if (tab === "juntas") {
      activateTab("calculadora");
      mostrarModoCalculadora("juntas");
      return;
    }
    TABS.forEach(function (t) { tabBtn(t).classList.toggle("active", t === tab); });
    showTabPanels(tab);
    // En el teléfono la barra de pestañas se desliza: se centra la activa
    // (solo en horizontal, sin mover la página).
    var nav = document.getElementById("tabs");
    var btn = tabBtn(tab);
    if (nav.scrollWidth > nav.clientWidth) {
      nav.scrollTo({ left: btn.offsetLeft - (nav.clientWidth - btn.offsetWidth) / 2, behavior: "smooth" });
    }

    if (tab === "deudas") renderDeudas();
    if (tab === "deuda-tarjetas") renderDeudaTarjetas();
    if (tab === "estadisticas") renderEstadisticas();
    if (tab === "sueldo") renderSueldo();
    if (tab === "informes") renderInformesFiltros();
    if (tab === "calculadora") { renderCalculadoraFiltros(); renderJuntasLista(); }
    if (tab === "vercompras") renderVerComprasFiltros();
    if (tab === "avisos") renderAvisos();
  }

  TABS.forEach(function (t) {
    tabBtn(t).addEventListener("click", function () { activateTab(t); });
  });

  // ---------- Modos de la Calculadora (cobro / juntas) ----------

  var calcModoCobroBtn = document.getElementById("calc-modo-cobro-btn");
  var calcModoJuntasBtn = document.getElementById("calc-modo-juntas-btn");

  function mostrarModoCalculadora(modo) {
    var esJuntas = modo === "juntas";
    document.getElementById("calc-modo-cobro").classList.toggle("hidden", esJuntas);
    document.getElementById("calc-modo-juntas").classList.toggle("hidden", !esJuntas);
    calcModoCobroBtn.classList.toggle("active", !esJuntas);
    calcModoJuntasBtn.classList.toggle("active", esJuntas);
    calcModoCobroBtn.setAttribute("aria-selected", String(!esJuntas));
    calcModoJuntasBtn.setAttribute("aria-selected", String(esJuntas));
  }

  calcModoCobroBtn.addEventListener("click", function () { mostrarModoCalculadora("cobro"); });
  calcModoJuntasBtn.addEventListener("click", function () { mostrarModoCalculadora("juntas"); });
