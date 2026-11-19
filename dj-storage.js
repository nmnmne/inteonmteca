/* Import metadata is read at startup. Audio stays in IndexedDB until a deck requests it. */
(() => {
  'use strict';

  let connection;
  let opening;
  const hydrating = new Map();
  const bothStores = ['tracks', 'audio'];

  function database() {
    if (connection) return Promise.resolve(connection);
    if (opening) return opening;
    opening = new Promise((resolve, reject) => {
      const request = indexedDB.open('inteonmteca-dj-imports', 1);
      let blocked = false;
      request.onupgradeneeded = () => {
        request.result.createObjectStore('tracks', { keyPath: 'id' });
        request.result.createObjectStore('audio');
      };
      request.onblocked = () => { blocked = true; reject(new Error('Storage upgrade blocked')); };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        if (blocked) { db.close(); return; }
        connection = db;
        db.onversionchange = () => { db.close(); if (connection === db) connection = null; };
        db.onclose = () => { if (connection === db) connection = null; };
        resolve(db);
      };
    }).finally(() => { opening = null; });
    return opening;
  }

  async function transact(stores, mode, perform) {
    const db = await database();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(stores, mode);
      let request;
      tx.oncomplete = () => resolve(request?.result);
      tx.onabort = () => reject(tx.error || new Error('Storage transaction aborted'));
      try { request = perform(tx); }
      catch (error) { tx.abort(); reject(error); }
    });
  }

  async function put(track, file) {
    if (!track?.id || !(file instanceof Blob) || !file.size) return false;
    discardPending(track.id);
    try {
      const { id, title, artist, duration, bpm, offset, key, peaks, bass, analysisStatus, analysisMessage, normalization } = track;
      const metadata = { id, title, artist, duration, bpm, offset, key, peaks, bass, analysisStatus, analysisMessage, normalization, imported: true, importedAt: Date.now() };
      await transact(bothStores, 'readwrite', tx => {
        tx.objectStore('tracks').put(metadata);
        tx.objectStore('audio').put(file, id);
      });
      return true;
    } catch { return false; }
  }

  async function list() {
    try {
      const rows = await transact('tracks', 'readonly', tx => tx.objectStore('tracks').getAll());
      rows.sort((a, b) => a.importedAt - b.importedAt);
      return rows.map(row => ({ ...row, src: null }));
    } catch { return []; }
  }

  function discardPending(id) {
    const read = hydrating.get(id);
    if (read) read.obsolete = true;
    hydrating.delete(id);
  }

  async function storedFile(id) {
    try {
      const file = await transact('audio', 'readonly', tx => tx.objectStore('audio').get(id));
      return file instanceof Blob ? file : null;
    } catch { return null; }
  }

  async function hydrate(track) {
    if (!track?.id || track.src) return track;
    const id = track.id;
    let read = hydrating.get(id);
    if (!read) {
      read = { file: storedFile(id), url: null, obsolete: false };
      hydrating.set(id, read);
    }
    const file = await read.file;
    if (file && !read.obsolete && window.DJImportLoudness && track.normalization?.version !== window.DJImportLoudness.version) {
      read.analysis ??= (async () => {
        const measured = await window.DJImportLoudness.measure(file, track.duration);
        if (read.obsolete) return null;
        try {
          await transact('tracks', 'readwrite', tx => {
            const store = tx.objectStore('tracks');
            const current = store.get(id);
            current.onsuccess = () => {
              const row = current.result;
              if (row && !read.obsolete) store.put({ ...row, normalization: measured });
            };
            return current;
          });
        } catch { /* Still apply the result for this playback if storage is under pressure. */ }
        return measured;
      })();
      const result = await read.analysis;
      if (!read.obsolete && result) track.normalization = result;
    }
    if (file && !track.src && !read.obsolete) {
      read.url ??= URL.createObjectURL(file);
      track.src = read.url;
    }
    if (hydrating.get(id) === read) hydrating.delete(id);
    return track;
  }

  async function remove(id) {
    if (!id) return false;
    discardPending(id);
    try {
      await transact(bothStores, 'readwrite', tx => {
        for (const store of bothStores) tx.objectStore(store).delete(id);
      });
      return true;
    } catch { return false; }
  }

  window.DJStorage = { put, list, hydrate, remove };
})();
