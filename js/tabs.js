"use strict";

  // ---------- Tabs ----------

  var tabComprasBtn = document.getElementById("tab-compras-btn");
  var tabDeudasBtn = document.getElementById("tab-deudas-btn");
  var tabDeudaTarjetasBtn = document.getElementById("tab-deuda-tarjetas-btn");
  var tabEstadisticasBtn = document.getElementById("tab-estadisticas-btn");
  var tabSueldoBtn = document.getElementById("tab-sueldo-btn");
  var tabTarjetasBtn = document.getElementById("tab-tarjetas-btn");
  var tabInformesBtn = document.getElementById("tab-informes-btn");
  var tabCalculadoraBtn = document.getElementById("tab-calculadora-btn");

  var tabComprasPanel = document.getElementById("tab-compras");
  var tabDeudasPanel = document.getElementById("tab-deudas");
  var tabDeudaTarjetasPanel = document.getElementById("tab-deuda-tarjetas");
  var tabEstadisticasPanel = document.getElementById("tab-estadisticas");
  var tabSueldoPanel = document.getElementById("tab-sueldo");
  var tabTarjetasPanel = document.getElementById("tab-tarjetas");
  var tabInformesPanel = document.getElementById("tab-informes");
  var tabCalculadoraPanel = document.getElementById("tab-calculadora");

  function showTabPanels(tab) {
    tabComprasPanel.classList.toggle("hidden", tab !== "compras");
    tabDeudasPanel.classList.toggle("hidden", tab !== "deudas");
    tabDeudaTarjetasPanel.classList.toggle("hidden", tab !== "deuda-tarjetas");
    tabEstadisticasPanel.classList.toggle("hidden", tab !== "estadisticas");
    tabSueldoPanel.classList.toggle("hidden", tab !== "sueldo");
    tabTarjetasPanel.classList.toggle("hidden", tab !== "tarjetas");
    tabInformesPanel.classList.toggle("hidden", tab !== "informes");
    tabCalculadoraPanel.classList.toggle("hidden", tab !== "calculadora");
  }

  function activateTab(tab) {
    tabComprasBtn.classList.toggle("active", tab === "compras");
    tabDeudasBtn.classList.toggle("active", tab === "deudas");
    tabDeudaTarjetasBtn.classList.toggle("active", tab === "deuda-tarjetas");
    tabEstadisticasBtn.classList.toggle("active", tab === "estadisticas");
    tabSueldoBtn.classList.toggle("active", tab === "sueldo");
    tabTarjetasBtn.classList.toggle("active", tab === "tarjetas");
    tabInformesBtn.classList.toggle("active", tab === "informes");
    tabCalculadoraBtn.classList.toggle("active", tab === "calculadora");
    showTabPanels(tab);

    if (tab === "deudas") renderDeudas();
    if (tab === "deuda-tarjetas") renderDeudaTarjetas();
    if (tab === "estadisticas") renderEstadisticas();
    if (tab === "sueldo") renderSueldo();
    if (tab === "informes") renderInformesFiltros();
    if (tab === "calculadora") renderCalculadoraFiltros();
  }

  tabComprasBtn.addEventListener("click", function () { activateTab("compras"); });
  tabDeudasBtn.addEventListener("click", function () { activateTab("deudas"); });
  tabDeudaTarjetasBtn.addEventListener("click", function () { activateTab("deuda-tarjetas"); });
  tabEstadisticasBtn.addEventListener("click", function () { activateTab("estadisticas"); });
  tabSueldoBtn.addEventListener("click", function () { activateTab("sueldo"); });
  tabTarjetasBtn.addEventListener("click", function () { activateTab("tarjetas"); });
  tabInformesBtn.addEventListener("click", function () { activateTab("informes"); });
  tabCalculadoraBtn.addEventListener("click", function () { activateTab("calculadora"); });
