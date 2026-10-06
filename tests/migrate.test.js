// Release gate: run before every push.   node tests/migrate.test.js
//
// Loads every sample in tests/fixtures/ (one per storage format the calculator
// has ever written) through the real loading code in index.html, and fails if
// any order, item, value or dollar total is lost, if damaged data doesn't lock
// saving, or if reloading changes anything. If this fails, nothing ships.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const script = html.match(/<script>\n([\s\S]*?)\n<\/script>/)[1];
const FIXTURES = path.join(__dirname, 'fixtures');

// Run the page's script against a fake browser storage. No page is drawn.
function boot(storage) {
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
        orderTotal, set, save, prepText, readBackups })`, ctx);
  return { api, store };
}

const cents = n => Math.round(n * 100) / 100;
let failures = 0;

for (const file of fs.readdirSync(FIXTURES).filter(f => f.endsWith('.json')).sort()) {
  const fx = JSON.parse(fs.readFileSync(path.join(FIXTURES, file), 'utf8'));
  const problems = [];
  const check = (ok, msg) => { if (!ok) problems.push(msg); };
  const { api, store } = boot(fx.storage);
  const ex = fx.expect;

  check(!!api.safeMode === !!ex.safeMode, `safe mode should be ${!!ex.safeMode}, was ${JSON.stringify(api.safeMode)}`);
  for (const k of ex.untouched || [])
    check(store.get(k) === fx.storage[k], `${k} was changed by loading`);

  const hadData = Object.keys(fx.storage).length > 0;
  if (hadData) {
    const bk = api.readBackups();
    check(bk.length >= 1, 'no backup was taken');
    check(bk.some(b => (fx.storage.prepCostCalcV2 && b.v2 === fx.storage.prepCostCalcV2) ||
                      (!fx.storage.prepCostCalcV2 && fx.storage.prepCostCalcV1 && b.v1 === fx.storage.prepCostCalcV1)),
          'no backup holds the original saved text');
  }

  if (ex.safeMode) {
    // Saving must be locked: an edit followed by a save writes nothing.
    const before = new Map(store);
    const it = api.state.items[0];
    api.set(it.id, 'casePack', '123');
    api.save();
    for (const k of ['prepCostCalcV1', 'prepCostCalcV2'])
      check(store.get(k) === before.get(k), `${k} was written while saving was locked`);
  } else {
    const orders = [...api.book.orders].sort((a, b) => a.id - b.id);
    check(orders.length === ex.orders.length, `expected ${ex.orders.length} orders, got ${orders.length}`);
    if (ex.currentId !== undefined) check(api.book.currentId === ex.currentId, `open order should be ${ex.currentId}, was ${api.book.currentId}`);
    ex.orders.forEach((eo, i) => {
      const o = orders[i];
      if (!o) return;
      if (eo.name !== undefined) check(o.name === eo.name, `order ${i + 1} name should be "${eo.name}", was "${o.name}"`);
      if (eo.active !== undefined) check(o.active === eo.active, `order ${i + 1} open tab should be ${eo.active}, was ${o.active}`);
      if (eo.grand !== undefined) {
        const g = cents(api.orderTotal(o).grand);
        check(g === eo.grand, `order ${i + 1} total should be $${eo.grand.toFixed(2)}, was $${g.toFixed(2)}`);
      }
      check(o.items.length === eo.items.length, `order ${i + 1} should have ${eo.items.length} items, has ${o.items.length}`);
      eo.items.forEach((ei, j) => {
        const it = o.items[j];
        if (!it) return;
        for (const [k, v] of Object.entries(ei))
          check(JSON.stringify(it[k]) === JSON.stringify(v), `order ${i + 1} item ${j + 1} ${k} should be ${JSON.stringify(v)}, was ${JSON.stringify(it[k])}`);
        check(!('needsSetSticker' in it), `order ${i + 1} item ${j + 1} still carries the old switch`);
      });
      check(!/\$/.test(api.prepText(o)), `order ${i + 1} prep instructions contain a price`);
    });

    // Loading a second time (a relaunch) must change nothing that is saved.
    const again = boot(Object.fromEntries(store));
    check(!again.api.safeMode, 'second load went into safe mode');
    for (const k of ['prepCostCalcV1', 'prepCostCalcV2'])
      check(again.store.get(k) === store.get(k), `a second load changed ${k}`);
    check(again.api.readBackups().length === api.readBackups().length, 'a second load on the same day added another backup');
  }

  if (problems.length) {
    failures++;
    console.log(`FAIL  ${file}  (${fx.about})`);
    problems.forEach(p => console.log('        - ' + p));
  } else {
    console.log(`pass  ${file}`);
  }
}

console.log(failures ? `\n${failures} sample(s) failed. Do not ship.` : '\nAll samples pass. Safe to ship.');
process.exit(failures ? 1 : 0);
