"use strict";

  // =========================================================
  // DESCARGAR EN PDF (Informes, Calculadora de cobro y de juntas)
  //
  // "Imprimir → Guardar como PDF" desde el teléfono sale con formato de
  // celular: el navegador arma la hoja con el ancho de la pantalla. Acá el
  // documento se dibuja aparte, siempre con ancho de escritorio (como si
  // se viera en un computador), y se arma el PDF directo:
  // - Si cabe en una hoja A4 (aunque haya que achicarlo un poco), queda en
  //   UNA sola página.
  // - Si es muy largo, se reparte en varias hojas cortando en un espacio en
  //   blanco entre filas, nunca a la mitad de una línea.
  //
  // Las librerías (html2canvas + jsPDF) se cargan solo la primera vez que se
  // usa. Sin internet, se cae de vuelta al "Imprimir" del navegador.
  // =========================================================

  var PDF_LIBS = [
    "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js",
    "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"
  ];
  var PDF_ANCHO_DOC_PX = 820;        // ancho "de escritorio" del documento
  var PDF_MARGEN_MM = 12;
  var PDF_ACHIQUE_MAXIMO = 0.62;     // hasta cuánto se achica para que quepa en 1 hoja

  var pdfLibsPromesa = null;

  function cargarScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function cargarLibreriasPdf() {
    if (window.html2canvas && window.jspdf) return Promise.resolve();
    if (!pdfLibsPromesa) {
      pdfLibsPromesa = PDF_LIBS.reduce(function (p, src) {
        return p.then(function () { return cargarScript(src); });
      }, Promise.resolve()).catch(function (err) {
        pdfLibsPromesa = null; // permitir reintentar cuando vuelva internet
        throw err;
      });
    }
    return pdfLibsPromesa;
  }

  function nombreArchivoSeguro(texto) {
    return String(texto || "documento")
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "documento";
  }

  // Copia del documento, fuera de pantalla, con el ancho de escritorio fijo.
  function prepararCopiaParaPdf(elemento) {
    var raiz = document.createElement("div");
    raiz.className = "pdf-export";
    raiz.style.width = PDF_ANCHO_DOC_PX + "px";
    var copia = elemento.cloneNode(true);
    copia.querySelectorAll("[contenteditable]").forEach(function (el) { el.removeAttribute("contenteditable"); });
    copia.querySelectorAll(".calc-edicion-hint, .no-pdf, button").forEach(function (el) { el.remove(); });
    raiz.appendChild(copia);
    document.body.appendChild(raiz);
    return raiz;
  }

  // Busca, subiendo desde `desde`, una fila de píxeles casi blanca donde
  // cortar la hoja sin partir texto. Si no encuentra, corta en `desde`.
  function buscarCorteLimpio(ctx, ancho, desde, hasta) {
    for (var y = desde; y > hasta; y -= 2) {
      var datos = ctx.getImageData(0, y, ancho, 1).data;
      var limpia = true;
      for (var i = 0; i < datos.length; i += 16) { // muestreo cada 4 px
        if (datos[i] < 245 || datos[i + 1] < 245 || datos[i + 2] < 245) { limpia = false; break; }
      }
      if (limpia) return y;
    }
    return desde;
  }

  function armarPdf(canvas) {
    var jsPDF = window.jspdf.jsPDF;
    var doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    var anchoPagina = doc.internal.pageSize.getWidth();
    var altoPagina = doc.internal.pageSize.getHeight();
    var anchoUtil = anchoPagina - PDF_MARGEN_MM * 2;
    var altoUtil = altoPagina - PDF_MARGEN_MM * 2;

    var altoAlAncho = canvas.height * anchoUtil / canvas.width; // mm, usando todo el ancho

    // 1) Cabe tal cual, o 2) achicándolo un poco: una sola página.
    if (altoAlAncho <= altoUtil / PDF_ACHIQUE_MAXIMO) {
      var escala = Math.min(1, altoUtil / altoAlAncho);
      var w = anchoUtil * escala;
      var h = altoAlAncho * escala;
      doc.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", (anchoPagina - w) / 2, PDF_MARGEN_MM, w, h);
      return doc;
    }

    // 3) Muy largo: varias hojas, cortando en espacios en blanco.
    var pxPorMm = canvas.width / anchoUtil;
    var altoPaginaPx = Math.floor(altoUtil * pxPorMm);
    var ctx = canvas.getContext("2d");
    var y = 0;
    var primera = true;
    while (y < canvas.height - 2) {
      var fin = Math.min(canvas.height, y + altoPaginaPx);
      if (fin < canvas.height) fin = buscarCorteLimpio(ctx, canvas.width, fin, y + Math.floor(altoPaginaPx * 0.75));
      var trozo = document.createElement("canvas");
      trozo.width = canvas.width;
      trozo.height = fin - y;
      var tctx = trozo.getContext("2d");
      tctx.fillStyle = "#ffffff";
      tctx.fillRect(0, 0, trozo.width, trozo.height);
      tctx.drawImage(canvas, 0, y, canvas.width, trozo.height, 0, 0, canvas.width, trozo.height);
      if (!primera) doc.addPage();
      doc.addImage(trozo.toDataURL("image/jpeg", 0.92), "JPEG", PDF_MARGEN_MM, PDF_MARGEN_MM, anchoUtil, trozo.height / pxPorMm);
      primera = false;
      y = fin;
    }
    return doc;
  }

  // En el teléfono se ofrece "Compartir / Guardar en Archivos" (más cómodo
  // que una descarga, y no deja la app instalada atrapada en el visor); en
  // el computador se descarga directo.
  function entregarPdf(doc, nombre) {
    var esTactil = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
    if (esTactil && navigator.canShare && typeof File === "function") {
      var archivo = new File([doc.output("blob")], nombre, { type: "application/pdf" });
      if (navigator.canShare({ files: [archivo] })) {
        return navigator.share({ files: [archivo], title: nombre }).catch(function (err) {
          if (err && err.name === "AbortError") return; // el usuario cerró el menú
          doc.save(nombre);
        });
      }
    }
    doc.save(nombre);
    return Promise.resolve();
  }

  function descargarPdfDe(elemento, nombreBase, boton) {
    if (!elemento || !elemento.children.length) {
      showToast("Primero genera el documento.");
      return;
    }
    var textoBoton = boton ? boton.textContent : "";
    if (boton) { boton.disabled = true; boton.textContent = "⏳ Preparando PDF…"; }
    var restaurar = function () { if (boton) { boton.disabled = false; boton.textContent = textoBoton; } };
    var nombre = nombreArchivoSeguro(nombreBase) + "_" + todayStamp() + ".pdf";

    cargarLibreriasPdf().then(function () {
      var raiz = prepararCopiaParaPdf(elemento);
      return window.html2canvas(raiz, {
        scale: 2,
        backgroundColor: "#ffffff",
        // El documento se dibuja como en una pantalla de escritorio aunque
        // estés en el teléfono (así no se aplican los estilos de celular).
        windowWidth: 1280,
        logging: false
      }).then(function (canvas) {
        raiz.remove();
        return entregarPdf(armarPdf(canvas), nombre);
      }, function (err) {
        raiz.remove();
        throw err;
      });
    }).then(function () {
      restaurar();
    }).catch(function (err) {
      console.error("No se pudo generar el PDF:", err);
      restaurar();
      showToast("No se pudo armar el PDF (¿sin internet?). Se abre Imprimir: elige \"Guardar como PDF\".");
      window.print();
    });
  }
