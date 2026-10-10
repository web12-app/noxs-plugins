/*
 * Noxs Plugin SDK — version 0.0.1 (apiVersion 1, stable).
 *
 * The plugin-facing API contract of the Noxs host. This file is loaded by
 * the Noxs app into the plugin's private JavaScript context BEFORE the
 * plugin bundle runs, and attaches a documented, permission-checked `sdk`
 * object to the existing `noxs` global:
 *
 *   noxs.sdk.log.info / warn / error      (host: NoxsHost.log)
 *   noxs.sdk.ui.createWindow(params)      (host: permission-checked windows)
 *   noxs.sdk.terminal.exec(command)       (host: permission-checked exec)
 *
 * It wraps — never replaces — the existing globalThis.__NOXS_PLUGIN__
 * lifecycle contract, and exposes only APIs the Noxs host actually
 * implements. Features of this release: logging, ui, terminal.
 *
 * Published releases are immutable: this file never changes after the
 * sdk-v0.0.1 release is published.
 */
(function () {
  'use strict';
  if (typeof window === 'undefined' || window.__noxsSdk) return;
  if (typeof window.NoxsHost === 'undefined') {
    /* No host bridge: leave without defining anything so the plugin's own
       activate() fails loudly instead of running unverified code paths. */
    return;
  }
  window.__noxsSdk = true;

  var host = window.NoxsHost;
  var FEATURES = ['logging', 'ui', 'terminal'];

  function line(level, message) {
    host.log('[' + level + '] ' + String(message));
  }

  var log = {
    info: function (message) { line('info', message); },
    warn: function (message) { line('warn', message); },
    error: function (message) { line('error', message); }
  };

  /* Window handles mirror the host window shim (show/hide/close/setHTML/
     setText/on/emit). Creation is refused by the host when the plugin does
     not hold the ui permission. */
  var ui = {
    createWindow: function (params) {
      if (!window.noxs || !window.noxs.ui || !window.noxs.ui.createWindow) {
        throw new Error('Noxs Plugin SDK: the Noxs window shim is unavailable');
      }
      return window.noxs.ui.createWindow(params || {});
    }
  };

  /* One-shot commands inside the Noxs Linux environment. Rejected by the
     host when the plugin does not hold the terminal permission. */
  var terminal = {
    exec: function (command) {
      if (!window.noxs || !window.noxs.terminal || !window.noxs.terminal.exec) {
        return Promise.reject(new Error('Noxs Plugin SDK: terminal exec is unavailable'));
      }
      return window.noxs.terminal.exec(command);
    }
  };

  var sdk = {
    version: '0.0.1',
    apiVersion: '1',
    features: FEATURES.slice(),
    log: log,
    ui: ui,
    terminal: terminal
  };

  window.noxs = window.noxs || {};
  window.noxs.sdk = sdk;
  window.NoxsSdk = sdk;
})();
