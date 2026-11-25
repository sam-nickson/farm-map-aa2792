/* Optional client-side decryption. If build.json says enc:true, the data .json.enc files and the tile .webp.enc files are AES-256-GCM files (12-byte IV + ciphertext + tag)
 * and the key comes from a passphrase (PBKDF2-SHA256). The derived key is kept on the device (IndexedDB, non-extractable) so the passphrase is asked once.
 * If enc is false (dev build) everything is plain and this module is a pass-through. */
(function (root) {
  var DB = 'bandurrias-vault', STORE = 'k', KEYID = 'aes';
  var info = null, key = null;
  var b64 = function (s) { var b = atob(s), a = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; };

  function idb() {
    return new Promise(function (res, rej) {
      var r = indexedDB.open(DB, 1);
      r.onupgradeneeded = function () { r.result.createObjectStore(STORE); };
      r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); };
    });
  }
  function idbGet() { return idb().then(function (d) { return new Promise(function (res, rej) { var q = d.transaction(STORE).objectStore(STORE).get(KEYID); q.onsuccess = function () { res(q.result || null); }; q.onerror = function () { rej(q.error); }; }); }); }
  function idbPut(k) { return idb().then(function (d) { return new Promise(function (res, rej) { var t = d.transaction(STORE, 'readwrite'); t.objectStore(STORE).put(k, KEYID); t.oncomplete = res; t.onerror = function () { rej(t.error); }; }); }); }

  function decryptWith(k, buf) {
    var u = new Uint8Array(buf);
    return crypto.subtle.decrypt({ name: 'AES-GCM', iv: u.slice(0, 12) }, k, u.slice(12));
  }
  function verify(k) { return decryptWith(k, b64(info.check)).then(function (p) { return new TextDecoder().decode(p) === 'ok'; }).catch(function () { return false; }); }

  var Vault = {
    enc: false,
    /* resolves 'open' (plain, or key restored) or 'locked' (passphrase needed) */
    init: function () {
      return fetch('build.json', { cache: 'no-store' }).catch(function () { return fetch('build.json'); }).then(function (r) { return r.json(); }).then(function (b) {
        info = b; Vault.enc = !!b.enc;
        if (!Vault.enc) return 'open';
        return idbGet().catch(function () { return null; }).then(function (k) {
          if (!k) return 'locked';
          return verify(k).then(function (ok) { if (ok) { key = k; return 'open'; } return 'locked'; });
        });
      });
    },
    unlock: function (pass) {
      var enc = new TextEncoder();
      return crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey'])
        .then(function (base) { return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: b64(info.kdf.salt), iterations: info.kdf.iter }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']); })
        .then(function (k) { return verify(k).then(function (ok) { if (!ok) return false; key = k; return idbPut(k).catch(function () { /* private mode: ask again next time */ }).then(function () { return true; }); }); });
    },
    lock: function () { key = null; return idb().then(function (d) { d.transaction(STORE, 'readwrite').objectStore(STORE).delete(KEYID); }); },
    /* path like 'data/pampas.json' (the .enc suffix is added when encrypted) */
    json: function (path) {
      var url = path + (Vault.enc ? '.enc' : '');
      return fetch(url).then(function (r) { if (!r.ok) throw new Error(url + ' ' + r.status); return Vault.enc ? r.arrayBuffer().then(function (b) { return decryptWith(key, b); }).then(function (p) { return JSON.parse(new TextDecoder().decode(p)); }) : r.json(); });
    },
    /* url of an encrypted tile (full url incl. ?v=) -> object URL of the decrypted image */
    blobURL: function (url) {
      return fetch(url).then(function (r) { if (!r.ok) throw new Error(url + ' ' + r.status); return r.arrayBuffer(); }).then(function (b) { return decryptWith(key, b); })
        .then(function (p) { return URL.createObjectURL(new Blob([p], { type: 'image/webp' })); });
    }
  };
  root.Vault = Vault;
})(this);
