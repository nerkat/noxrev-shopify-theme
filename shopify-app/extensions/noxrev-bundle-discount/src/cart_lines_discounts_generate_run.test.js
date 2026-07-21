import assert from 'node:assert/strict';
import test from 'node:test';

import { cartLinesDiscountsGenerateRun } from './cart_lines_discounts_generate_run.js';

const KEYBOARD = 'transparent-core-keyboard-case-ipad';
const MOUSE = 'txp1-mouse';
const STYLUS = 'txp1-pencil';
const ACCESSORIES = [STYLUS, MOUSE, 'txp1-case', 'txp1-charger', 'tpx1-cable'];

test('does not discount accessories without a keyboard', () => {
  const result = run([line('mouse', MOUSE, 2)]);
  assert.deepEqual(result, { operations: [] });
});

test('discounts only one mouse for one keyboard and two mice', () => {
  const result = run([line('keyboard', KEYBOARD, 1), line('mouse', MOUSE, 2)]);
  assert.equal(targetQuantity(result, 'mouse'), 1);
});

test('discounts only two mice for two keyboards and three mice', () => {
  const result = run([line('keyboard', KEYBOARD, 2), line('mouse', MOUSE, 3)]);
  assert.equal(targetQuantity(result, 'mouse'), 2);
});

test('sums keyboard quantity across variants and cart lines', () => {
  const result = run([
    line('keyboard-black', KEYBOARD, 1),
    line('keyboard-white', KEYBOARD, 2),
    line('mouse', MOUSE, 4),
  ]);
  assert.equal(targetQuantity(result, 'mouse'), 3);
});

test('caps each accessory independently by keyboard quantity', () => {
  const result = run([
    line('keyboard', KEYBOARD, 1),
    line('mouse', MOUSE, 2),
    line('stylus', STYLUS, 3),
  ]);
  assert.equal(targetQuantity(result, 'mouse'), 1);
  assert.equal(targetQuantity(result, 'stylus'), 1);
});

test('applies the default 20% discount to all five configured accessories', () => {
  const result = run([
    line('keyboard', KEYBOARD, 1),
    ...ACCESSORIES.map((handle, index) => line(`accessory-${index}`, handle, 2)),
  ]);

  for (const [index] of ACCESSORIES.entries()) {
    assert.equal(targetQuantity(result, `accessory-${index}`), 1);
    assert.equal(candidatePercentageForTarget(result, `accessory-${index}`), 20);
  }
});

test('shares an accessory cap across multiple lines of that accessory', () => {
  const result = run([
    line('keyboard', KEYBOARD, 2),
    line('mouse-red', MOUSE, 1),
    line('mouse-black', MOUSE, 3),
  ]);
  assert.equal(targetQuantity(result, 'mouse-red'), 1);
  assert.equal(targetQuantity(result, 'mouse-black'), 1);
});

test('uses the accessory quantity when it is below keyboard quantity', () => {
  const result = run([line('keyboard', KEYBOARD, 3), line('mouse', MOUSE, 1)]);
  assert.equal(targetQuantity(result, 'mouse'), 1);
});

test('supports a different configured percentage for each accessory', () => {
  const result = run(
    [line('keyboard', KEYBOARD, 1), line('mouse', MOUSE, 1), line('stylus', STYLUS, 1)],
    {
      keyboardProductHandles: [KEYBOARD],
      accessories: {
        [MOUSE]: { percentage: 15 },
        [STYLUS]: { percentage: 25 },
      },
    },
  );

  assert.equal(candidatePercentageForTarget(result, 'mouse'), 15);
  assert.equal(candidatePercentageForTarget(result, 'stylus'), 25);
});

test('ignores unrelated products and non-product discount classes', () => {
  const noAccessory = run([
    line('keyboard', KEYBOARD, 1),
    line('unrelated', 'unrelated-product', 2),
  ]);
  assert.deepEqual(noAccessory, { operations: [] });

  const wrongClass = run(
    [line('keyboard', KEYBOARD, 1), line('mouse', MOUSE, 1)],
    undefined,
    ['ORDER'],
  );
  assert.deepEqual(wrongClass, { operations: [] });
});

function line(id, productHandle, quantity) {
  return {
    id: `gid://shopify/CartLine/${id}`,
    quantity,
    merchandise: {
      __typename: 'ProductVariant',
      product: {
        handle: productHandle,
      },
    },
  };
}

function run(lines, configuration, discountClasses = ['PRODUCT']) {
  return cartLinesDiscountsGenerateRun({
    cart: { lines },
    discount: {
      discountClasses,
      metafield: configuration ? { jsonValue: configuration } : null,
    },
  });
}

function candidates(result) {
  return result.operations[0]?.productDiscountsAdd?.candidates ?? [];
}

function targetQuantity(result, id) {
  const cartLineId = `gid://shopify/CartLine/${id}`;
  for (const candidate of candidates(result)) {
    const target = candidate.targets.find((item) => item.cartLine.id === cartLineId);
    if (target) return target.cartLine.quantity;
  }
  return 0;
}

function candidatePercentageForTarget(result, id) {
  const cartLineId = `gid://shopify/CartLine/${id}`;
  const candidate = candidates(result).find((item) =>
    item.targets.some((target) => target.cartLine.id === cartLineId),
  );
  return candidate?.value?.percentage?.value;
}
