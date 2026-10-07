// Everyday behavior checks: the automatic defaults, the Additional boxes switch,
// the prep checklist and the compare table. Runs as part of tests/migrate.test.js,
// or on its own:   node tests/behavior.test.js
'use strict';
const { boot } = require('./harness');

const EXPOSE = ['setTrigger', 'tidyField', 'toggleBoxes', 'set', 'compute', 'orderedQty',
                'atPackSize', 'prepText', 'newItem'];

function run() {
  let failures = 0;
  const check = (name, ok, detail) => {
    if (ok) { console.log(`pass  ${name}`); return; }
    failures++;
    console.log(`FAIL  ${name}${detail ? `\n        - ${detail}` : ''}`);
  };
  const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want),
    `expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);

  // A fresh calculator with one blank tab. `type` replays each keystroke's
  // value into a case pack / pack size box, then leaves the box.
  const fresh = () => {
    const { api } = boot({}, EXPOSE);
    const it = api.state.items[0];
    const type = (key, ...values) => { for (const v of values) api.setTrigger({ value: v }, it.id, key); api.tidyField({}, it.id, key); };
    const total = () => { const r = api.compute(it); return r.error ? r.error : Math.round(r.perCase * api.orderedQty(it).cases * 100) / 100; };
    return { api, it, type, total };
  };

  {
    const { it, type } = fresh();
    same('new item: no mode or flat fee fields, switch off', [('mode' in it), ('flatRate' in it), it.extraBoxes], [false, false, false]);
    type('casePack', '1', '12');
    type('packSize', '1');
    same('pack size 1: no set sticker, bag stays', [it.setStickerCost, it.bagCost, it.extraBoxes], ['', '0.25', false]);
    type('packSize', '1', '12');
    same('pack size = case pack: no bag, sticker $0.15', [it.bagCost, it.setStickerCost, it.extraBoxes], ['', '0.15', false]);
    type('packSize', '5');
    same('uneven 12 in 5s: switch on at $1 a box, bag back to $0.25', [it.extraBoxes, it.extraBoxCost, it.bagCost], [true, '1', '0.25']);
    type('packSize', '6');
    same('even again: switch off', it.extraBoxes, false);
  }

  {
    const { api, it, type } = fresh();
    type('casePack', '10');
    type('packSize', '1');
    api.set(it.id, 'setStickerCost', '0.15');   // a twin pack: David wants the sticker even at pack size 1
    api.set(it.id, 'casesOrdered', '30');
    type('casePack', '2', '20');
    same('a hand-typed sticker survives a case pack change', it.setStickerCost, '0.15');
    type('packSize', '2');
    same('pack size 1 to 2: sticker $0.15', it.setStickerCost, '0.15');
    type('packSize', '1');
    same('pack size 2 to 1: sticker blank', it.setStickerCost, '');
  }

  {
    const { api, it, type } = fresh();
    type('casePack', '24');
    type('packSize', '1', '10');
    api.set(it.id, 'setStickerCost', '0.20');
    type('packSize', '1', '12');   // passes through "1" on the way to 12
    same('a half-typed pack size can’t wipe a hand-typed cost', it.setStickerCost, '0.20');
  }

  {
    const { api, it, type, total } = fresh();
    api.set(it.id, 'casesOrdered', '24');
    type('casePack', '9');
    type('packSize', '2');
    api.set(it.id, 'repackOK', 'no');
    api.set(it.id, 'boxStrategy', 'strict');
    api.set(it.id, 'reboxCount', '3');
    same('9 in 2s: switch on by itself at $1', [it.extraBoxes, it.extraBoxCost], [true, '1']);
    const on = total();
    const r = api.compute(it);
    api.toggleBoxes(it.id);
    const off = total();
    same('switch off: leftover and added boxes cost nothing', Math.round((on - off) * 100) / 100, (r.chosen.additional + 3) * 1);
    api.set(it.id, 'extraBoxCost', '');
    api.toggleBoxes(it.id);
    same('switch on with no cost entered: $1 a box', it.extraBoxCost, '1');
    api.set(it.id, 'extraBoxCost', '2');
    api.toggleBoxes(it.id); api.toggleBoxes(it.id);
    same('switch on keeps a cost already entered', it.extraBoxCost, '2');
  }

  {
    const { api, it } = fresh();
    Object.assign(it, { casePack: '12', packSize: '2', bagCost: '0.25', setStickerCost: '0.15' });
    same('compare pack of 1: no sticker', api.atPackSize(it, 1).setStickerCost, '');
    same('compare pack of 12: no bag', api.atPackSize(it, 12).bagCost, '');
    same('compare the current size: nothing changes', api.atPackSize(it, 2).setStickerCost + '|' + api.atPackSize(it, 2).bagCost, '0.15|0.25');
    Object.assign(it, { mode: 'flat', flatRate: '0.60', casesOrdered: '10' });
    const r = api.compute(it);
    same('an old flat-fee item is priced itemized', Math.round(r.perCase * 10 * 100) / 100, 6 * (0.25 + 0.25 + 0.15) * 10 + 0.25 * 10);
  }

  {
    const { api } = fresh();
    const mk = (id, f) => Object.assign(api.newItem(id), f);
    api.state.name = 'Gr8Getz Amazon';
    api.state.items = [
      mk(1, { name: 'ACH', casePack: '10', packSize: '1', bagCost: '', setStickerCost: '', casesOrdered: '3' }),
      mk(2, { name: 'Axe twin', casePack: '12', packSize: '2', casesOrdered: '5' }),
      mk(3, { name: 'Gloves', soldByCase: true, casesOrdered: '10' }),
      mk(4, { name: 'Towels', casePack: '9', packSize: '2', casesOrdered: '24', setStickerCost: '', extraBoxes: true, reboxCount: '3' }),
      mk(5, { name: 'Tab 3' }),
    ];
    const text = api.prepText(api.state);
    const body = text.split('\n').slice(2).join('\n');
    same('prep checklist matches the short format', body, [
      'ACH - 1 pack', '- ASIN', '- Box label', '',
      'Axe twin - 2 pack', '- Bag', '- ASIN', '- Box label', '- Sold as set sticker', '',
      'Gloves - sold by case', '- Box label', '',
      'Towels - 2 pack', '- Bag', '- ASIN', '- Box label', '- Boxes: 21 boxes of 10 + 1 box of 6', '- Additional boxes (3)', '',
      'Tab 3 - not filled in yet',
    ].join('\n'));
    check('prep checklist has no prices', !/\$/.test(text), text);
    check('prep checklist is titled with the order name', /^PREP: Gr8Getz Amazon \(/.test(text), text.split('\n')[0]);
  }

  return failures;
}

module.exports = { run };

if (require.main === module) {
  const f = run();
  console.log(f ? `\n${f} behavior check(s) failed. Do not ship.` : '\nAll behavior checks pass.');
  process.exit(f ? 1 : 0);
}
