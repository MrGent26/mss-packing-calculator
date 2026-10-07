// Runs the page's script against a fake browser storage. No page is drawn.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const script = html.match(/<script>\n([\s\S]*?)\n<\/script>/)[1];

// `expose` names the page's functions and variables the test can reach.
function boot(storage, expose) {
  const store = new Map(Object.entries(storage));
  const localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: k => { store.delete(k); },
  };
  const document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], activeElement: null };
  const ctx = vm.createContext({ localStorage, document, console, confirm: () => true, alert: () => {}, location: { reload() {} } });
  const api = vm.runInContext(script + `
    ;({ get book() { return book; }, get state() { return state; }, get safeMode() { return safeMode; },
        ${expose.join(', ')} })`, ctx);
  return { api, store };
}

module.exports = { boot };
