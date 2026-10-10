/*
 * Noxs Plugin SDK — version 0.0.2 (apiVersion 1, stable).
 *
 * Backward-compatible addition over 0.0.1: the plugin-scoped `storage`
 * feature, backed by a bounded key/value store inside the plugin's own
 * directory (host-implemented, permission-checked in the Noxs host; the
 * plugin must hold the "storage" permission).
 *
 *   noxs.sdk.log / ui / terminal   — identical to 0.0.1
 *   noxs.sdk.storage.get(key)      → value | undefined
 *   noxs.sdk.storage.set(key, v)   → boolean
 *   noxs.sdk.storage.remove(key)   → boolean
 *   noxs.sdk.storage.keys()        → string[]
 *
 * Values are JSON-encodable; the host stores the encoded form. Published
 * releases are immutable: this file never changes after sdk-v0.0.2.
 */
(function () {
  'use strict';
  if (typeof window === 'undefined' || window.__noxsSdk) return;
  if (typeof window.NoxsHost === 'undefined') {
    return;
  }
  window.__noxsSdk = true;

  var host = window.NoxsHost;
  var FEATURES = ['logging', 'ui', 'terminal', 'storage'];

  function line(level, message) {
    host.log('[' + level + '] ' + String(message));
  }

  var log = {
    info: function (message) { line('info', message); },
    warn: function (message) { line('warn', message); },
    error: function (message) { line('error', message); }
  };

  var ui = {
    createWindow: function (params) {
      if (!window.noxs || !window.noxs.ui || !window.noxs.ui.createWindow) {
        throw new Error('Noxs Plugin SDK: the Noxs window shim is unavailable');
      }
      return window.noxs.ui.createWindow(params || {});
    }
  };

  var terminal = {
    exec: function (command) {
      if (!window.noxs || !window.noxs.terminal || !window.noxs.terminal.exec) {
        return Promise.reject(new Error('Noxs Plugin SDK: terminal exec is unavailable'));
      }
      return window.noxs.terminal.exec(command);
    }
  };

  /* Plugin-scoped storage. The host returns JSON-encoded values (or null);
     a refused call (missing permission, oversized value, storage error)
     surfaces as undefined/false instead of throwing across the bridge. */
  function storageOp(op, key, value) {
    try {
      return host.storageOp(op, key, value);
    } catch (e) {
      host.log('[warn] storage refused: ' + e);
      return null;
    }
  }

  var storage = {
    get: function (key) {
      var encoded = storageOp('get', String(key), '');
      if (encoded === null || encoded === undefined) return undefined;
      try {
        return JSON.parse(encoded);
      } catch (e) {
        return undefined;
      }
    },
    set: function (key, value) {
      var encoded;
      try {
        encoded = JSON.stringify(value);
      } catch (e) {
        return false;
      }
      if (encoded === undefined) return false;
      return storageOp('set', String(key), encoded) !== null;
    },
    remove: function (key) {
      return storageOp('remove', String(key), '') !== null;
    },
    keys: function () {
      var encoded = storageOp('keys', '', '');
      if (encoded === null || encoded === undefined) return [];
      try {
        var parsed = JSON.parse(encoded);
        return Object.prototype.toString.call(parsed) === '[object Array]' ? parsed : [];
      } catch (e) {
        return [];
      }
    }
  };

  var sdk = {
    version: '0.0.2',
    apiVersion: '1',
    features: FEATURES.slice(),
    log: log,
    ui: ui,
    terminal: terminal,
    storage: storage
  };

  window.noxs = window.noxs || {};
  window.noxs.sdk = sdk;
  window.NoxsSdk = sdk;
})();
