"use strict";

  // =========================================================
  // SINCRONIZACIÓN EN LA NUBE (Firebase Realtime Database)
  //
  // Guarda todo el estado de la app (las mismas claves del respaldo) en una
  // rama privada de tu propia base de datos de Firebase, identificada por un
  // "código de sincronización" secreto. Los dos dispositivos que usen la misma
  // configuración + el mismo código ven y editan los mismos datos, en vivo.
  //
  // Modelo: "gana el último que escribe" sobre el bloque completo. Para una
  // sola persona que usa un dispositivo a la vez es más que suficiente.
  //
  // El navegador no puede escribir en la nube a escondidas: por eso la
  // configuración se pega una vez en cada dispositivo. Nada se envía hasta que
  // tú conectas.
  // =========================================================

  var SYNC_CONFIG_KEY = "finanzas_sync_config_v1"; // { firebaseConfig, code }
  var SYNC_DEVICE_KEY = "finanzas_sync_device_v1"; // id aleatorio por dispositivo

  // Configuración de Firebase del proyecto (segura de incluir: las claves web
  // de Firebase son públicas por diseño; la seguridad real son las reglas de
  // la base de datos + tu código secreto). Al venir integrada, no hay que
  // pegarla en cada dispositivo: basta con poner el mismo código y conectar.
  var DEFAULT_FIREBASE_CONFIG = {
    apiKey: "AIzaSyBMlxdUK0k3HBg2gCviOGRaNjAUxoTO3Eg",
    authDomain: "app-finanzas-abb3f.firebaseapp.com",
    databaseURL: "https://app-finanzas-abb3f-default-rtdb.firebaseio.com",
    projectId: "app-finanzas-abb3f",
    storageBucket: "app-finanzas-abb3f.firebasestorage.app",
    messagingSenderId: "990381428510",
    appId: "1:990381428510:web:10f08964326b9fec07430f"
  };

  // Claves que NO se sincronizan: la propia config de sync y lo específico de
  // cada dispositivo (respaldo local).
  var NO_SYNC = [SYNC_CONFIG_KEY, SYNC_DEVICE_KEY, AUTO_BACKUP_KEY, LAST_BACKUP_KEY];

  var syncConfigInput = document.getElementById("sync-config");
  var syncCodeInput = document.getElementById("sync-code");
  var syncGenerateBtn = document.getElementById("sync-generate-btn");
  var syncConnectBtn = document.getElementById("sync-connect-btn");
  var syncDisconnectBtn = document.getElementById("sync-disconnect-btn");
  var syncEstadoEl = document.getElementById("sync-estado");
  var syncHintEl = document.getElementById("sync-hint");

  var db = null;
  var ref = null;
  var connected = false;
  var applyingRemote = false;   // true mientras escribimos datos que llegaron de la nube
  var lastSyncedSnapshot = null; // huella del último estado enviado/recibido, para no repetir
  var pollTimer = null;
  var estadoTexto = "Sin conectar.";
  var estadoClase = "";

  // ---------- Config guardada ----------

  function loadSyncConfig() {
    return loadObjectFromStorage(SYNC_CONFIG_KEY);
  }

  function saveSyncConfig(cfg) {
    saveObjectToStorage(SYNC_CONFIG_KEY, cfg);
  }

  function getDeviceId() {
    var id = localStorage.getItem(SYNC_DEVICE_KEY);
    if (!id) {
      id = "dev_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
      localStorage.setItem(SYNC_DEVICE_KEY, id);
    }
    return id;
  }

  // ---------- Snapshot del estado ----------

  function buildSnapshot() {
    var snap = {};
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.indexOf("finanzas_") === 0 && NO_SYNC.indexOf(k) === -1) {
        snap[k] = localStorage.getItem(k);
      }
    }
    return snap;
  }

  // Vuelca un snapshot remoto en localStorage, reflejándolo tal cual: borra las
  // claves locales que ya no existen en la nube y escribe las que llegan.
  function applySnapshot(remote) {
    var local = buildSnapshot();
    Object.keys(local).forEach(function (k) {
      if (!(k in remote)) localStorage.removeItem(k);
    });
    Object.keys(remote).forEach(function (k) {
      localStorage.setItem(k, remote[k]);
    });
  }

  // Huella estable (para comparar si cambió algo, ignorando el orden de claves).
  function snapshotHuella(snap) {
    return JSON.stringify(Object.keys(snap).sort().map(function (k) { return [k, snap[k]]; }));
  }

  // ---------- Firebase SDK (se carga solo al conectar) ----------

  function loadScript(src, cb, onErr) {
    var s = document.createElement("script");
    s.src = src;
    s.onload = cb;
    s.onerror = onErr;
    document.head.appendChild(s);
  }

  function loadFirebaseSdk(cb, onErr) {
    if (window.firebase && window.firebase.database) { cb(); return; }
    var base = "https://www.gstatic.com/firebasejs/10.12.2/";
    loadScript(base + "firebase-app-compat.js", function () {
      loadScript(base + "firebase-database-compat.js", cb, onErr);
    }, onErr);
  }

  // ---------- Parseo del bloque firebaseConfig pegado ----------

  function parseFirebaseConfig(text) {
    if (!text) return null;
    var m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    var body = m[0]
      .replace(/([{,]\s*)([A-Za-z0-9_]+)\s*:/g, '$1"$2":') // comillas a las claves
      .replace(/'/g, '"')                                    // comillas simples a dobles
      .replace(/,(\s*[}\]])/g, "$1");                        // comas colgantes
    try {
      var obj = JSON.parse(body);
      return obj && typeof obj === "object" ? obj : null;
    } catch (e) {
      return null;
    }
  }

  function generarCodigo() {
    var chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    var s = "";
    for (var i = 0; i < 24; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
    return s;
  }

  // ---------- Estado visible ----------

  function setEstado(texto, clase) {
    estadoTexto = texto;
    estadoClase = clase || "";
    renderSyncEstado();
  }

  function renderSyncEstado() {
    if (!syncEstadoEl) return;
    syncEstadoEl.textContent = (connected ? "🟢 " : "") + estadoTexto;
    syncEstadoEl.className = "respaldo-estado" + (estadoClase ? " " + estadoClase : "");
    syncConnectBtn.classList.toggle("hidden", connected);
    syncDisconnectBtn.classList.toggle("hidden", !connected);
    syncConfigInput.disabled = connected;
    syncCodeInput.disabled = connected;
  }

  // ---------- Aplicar cambios que llegan de la nube ----------

  function adoptarRemoto(remote) {
    applyingRemote = true;
    applySnapshot(remote);
    lastSyncedSnapshot = snapshotHuella(buildSnapshot());
    applyingRemote = false;
    // El estado siempre se lee fresco desde localStorage, así que basta con
    // volver a dibujar todo.
    if (typeof renderAll === "function") renderAll();
  }

  // ---------- Enviar cambios locales a la nube ----------

  function empujarSiCambio() {
    if (!connected || applyingRemote || !ref) return;
    var snap = buildSnapshot();
    var huella = snapshotHuella(snap);
    if (huella === lastSyncedSnapshot) return; // nada nuevo
    lastSyncedSnapshot = huella;
    ref.set({ data: snap, device: getDeviceId(), updatedAt: Date.now() })
      .then(function () { setEstado("Al día. Guardado en la nube.", "ok"); })
      .catch(function (e) {
        console.error("Error al sincronizar:", e);
        setEstado("No se pudo guardar en la nube. Revisa tu conexión.", "aviso");
      });
  }

  // ---------- Conectar / desconectar ----------

  function connectSync(firebaseConfig, code) {
    setEstado("Conectando…", "");
    loadFirebaseSdk(function () {
      try {
        if (!window.firebase.apps || !window.firebase.apps.length) {
          window.firebase.initializeApp(firebaseConfig);
        }
        db = window.firebase.database();
        ref = db.ref("finanzas/" + code);
      } catch (e) {
        console.error(e);
        setEstado("La configuración de Firebase no es válida. Revisa lo que pegaste.", "aviso");
        return;
      }

      connected = true;
      renderSyncEstado();

      ref.on("value", function (snapshot) {
        var val = snapshot.val();
        if (!val || !val.data) {
          // La nube está vacía: este dispositivo sube sus datos por primera vez.
          lastSyncedSnapshot = null;
          empujarSiCambio();
          setEstado("Conectado. Nube vacía: se subieron los datos de este dispositivo.", "ok");
          return;
        }
        var huellaRemota = snapshotHuella(val.data);
        if (huellaRemota === lastSyncedSnapshot) return;   // ya lo tenemos
        if (val.device === getDeviceId()) {                // es nuestro propio envío
          lastSyncedSnapshot = huellaRemota;
          return;
        }
        adoptarRemoto(val.data);
        setEstado("Actualizado con los cambios del otro dispositivo.", "ok");
      }, function (err) {
        console.error(err);
        setEstado("No se pudo leer de la nube. Revisa las reglas de Firebase o el código.", "aviso");
      });

      // Además del tiempo real para recibir, revisamos cada 2 s si hay algo
      // local nuevo que subir (así no hay que enganchar cada botón de guardar).
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = setInterval(empujarSiCambio, 2000);

      setEstado("Conectado.", "ok");
    }, function () {
      setEstado("No se pudo cargar Firebase. ¿Tienes internet?", "aviso");
    });
  }

  function disconnectSync() {
    if (ref) { try { ref.off(); } catch (e) {} }
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    ref = null;
    connected = false;
    lastSyncedSnapshot = null;
    setEstado("Desconectado. Los datos siguen guardados en este dispositivo.", "");
  }

  // ---------- Botones ----------

  syncGenerateBtn.addEventListener("click", function () {
    syncCodeInput.value = generarCodigo();
  });

  syncConnectBtn.addEventListener("click", function () {
    // Si el campo está vacío o no se entiende, usamos la config integrada.
    var firebaseConfig = parseFirebaseConfig(syncConfigInput.value) || DEFAULT_FIREBASE_CONFIG;
    var code = (syncCodeInput.value || "").trim().replace(/[^A-Za-z0-9_-]/g, "");
    if (!firebaseConfig.databaseURL) {
      setEstado("Falta 'databaseURL' en la configuración. Crea la Realtime Database en Firebase y vuelve a copiar el bloque.", "aviso");
      return;
    }
    if (!code || code.length < 8) {
      setEstado("Escribe un código de al menos 8 caracteres (o toca Generar).", "aviso");
      return;
    }

    if (!confirm("Al conectar: si la nube ya tiene datos, se traerán y reemplazarán los de este dispositivo. ¿Continuar?")) return;

    saveSyncConfig({ firebaseConfig: firebaseConfig, code: code });
    connectSync(firebaseConfig, code);
  });

  syncDisconnectBtn.addEventListener("click", function () {
    var cfg = loadSyncConfig();
    cfg.activo = false;
    saveSyncConfig(cfg);
    disconnectSync();
  });

  // ---------- Arranque ----------
  //
  // Si ya se configuró antes, se reconecta solo al abrir la app (en los dos
  // dispositivos), sin que tengas que hacer nada.

  function syncBootstrap() {
    var cfg = loadSyncConfig();
    if (cfg && cfg.firebaseConfig && cfg.code) {
      syncConfigInput.value = JSON.stringify(cfg.firebaseConfig, null, 2);
      syncCodeInput.value = cfg.code;
      if (cfg.activo !== false) {
        connectSync(cfg.firebaseConfig, cfg.code);
        return;
      }
    } else {
      // Config integrada lista para usar: solo falta el código.
      syncConfigInput.value = JSON.stringify(DEFAULT_FIREBASE_CONFIG, null, 2);
    }
    renderSyncEstado();
  }

  // Al conectar exitosamente marcamos la config como activa, para reconectar
  // en el próximo arranque.
  var _connectSync = connectSync;
  connectSync = function (firebaseConfig, code) {
    var cfg = loadSyncConfig();
    cfg.firebaseConfig = firebaseConfig;
    cfg.code = code;
    cfg.activo = true;
    saveSyncConfig(cfg);
    _connectSync(firebaseConfig, code);
  };

  syncBootstrap();
