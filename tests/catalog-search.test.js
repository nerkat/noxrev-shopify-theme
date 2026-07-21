const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  buildSearchUrl,
  compact,
  extractANumber,
  getIndex,
  normalize,
  prepareEntry,
  scorePreparedEntry,
  searchPreparedIndex
} = require('../assets/catalog-search.js');

function entry(overrides = {}) {
  return {
    id: 'keyboard-model-ipad-10-9',
    group: 'keyboard',
    productId: '1',
    variantId: '101',
    title: 'iPad 10.9 inch (10th / A16 11th)',
    productTitle: 'NoxRev TXP1',
    model: 'iPad 10.9 inch (10th / A16 11th)',
    handle: 'transparent-core-keyboard-case-ipad',
    url: '/products/transparent-core-keyboard-case-ipad?variant=101',
    image: { src: '', alt: 'NoxRev TXP1 for iPad 10.9 inch' },
    price: { cents: 9900, formatted: '$99.00', compareAtCents: null, compareAtFormatted: null },
    available: true,
    aNumbers: ['A2696', 'A2757', 'A2777'],
    vendor: 'NoxRev',
    productType: 'iPad Keyboard Case',
    tags: ['iPad case', 'transparent keyboard'],
    descriptionText: 'Protective keyboard with a precision trackpad for work and study.',
    variantTitles: ['Blue / iPad 10.9 inch', 'Black / iPad 10.9 inch'],
    optionValues: ['Blue', 'Black', 'iPad 10.9 inch'],
    skus: ['TXP1-109-BLUE', 'TXP1-109-BLACK'],
    searchKeywords: [],
    ...overrides
  };
}

function searchEntries(entries, query, options = {}) {
  const prepared = entries.map(prepareEntry);
  return searchPreparedIndex(prepared, query, { initialResults: 'all', ...options });
}

test('the global JSON index parser accepts a serialized catalog safely', () => {
  const payload = JSON.stringify([
    entry({
      title: 'iPad 10.9 "A16" <script>not executable</script>',
      descriptionText: 'Quotes, HTML-looking text, and punctuation stay data.'
    })
  ]);
  const documentRef = {
    getElementById(id) {
      assert.equal(id, 'CatalogSearchIndex');
      return { textContent: payload, dataset: { keyboardStatus: 'ready', accessoriesStatus: 'ready' } };
    }
  };

  const parsed = getIndex(documentRef);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].title, 'iPad 10.9 "A16" <script>not executable</script>');
});

test('normalization treats all common A-number formats as equivalent', () => {
  const forms = ['A2757', 'a2757', 'A 2757', 'a 2757', 'A-2757', 'a-2757'];
  assert.deepEqual(forms.map(compact), Array(forms.length).fill('a2757'));
});

test('lowercase, spaced, hyphenated, and prefixed A-number inputs match the same model', () => {
  const keyboard = entry();

  for (const query of ['a2757', 'A 2757', 'A-2757', 'model A2757']) {
    const results = searchEntries([keyboard], query);
    assert.equal(results.keyboard.length, 1, query);
    assert.equal(results.keyboard[0].variantId, '101', query);
    assert.equal(results.exactANumber, 'A2757', query);
  }
});

test('exact A-number matches have the strongest score', () => {
  const prepared = prepareEntry(entry(), 0);
  assert.equal(scorePreparedEntry(prepared, 'A2757'), 1000);
  assert.ok(scorePreparedEntry(prepared, 'ipad 10.9') < 1000);
});

test('partial A-number input can match the wider compact document', () => {
  const results = searchEntries([entry()], 'A275');
  assert.equal(results.keyboard.length, 1);
});

test('one logical model can support and match several A-numbers', () => {
  const keyboard = entry();

  for (const query of ['A2696', 'A2757', 'A2777']) {
    assert.equal(searchEntries([keyboard], query).keyboard.length, 1);
  }
});

test('one A-number can return several logical model entries', () => {
  const entries = [
    entry(),
    entry({
      id: 'keyboard-model-secondary',
      variantId: '102',
      title: 'iPad alternate model',
      model: 'iPad alternate model',
      aNumbers: ['A2757']
    })
  ];

  assert.deepEqual(
    searchEntries(entries, 'A2757').keyboard.map((item) => item.variantId),
    ['101', '102']
  );
});

test('multi-token matching uses AND semantics regardless of adjacency', () => {
  const results = searchEntries([entry()], 'ipad air');
  assert.equal(results.keyboard.length, 0);
  assert.equal(searchEntries([entry()], 'ipad 10.9').keyboard.length, 1);
  assert.equal(searchEntries([entry()], 'precision work').keyboard.length, 1);
});

test('accessories match title, tags, product type, description, options, and SKU', () => {
  const mouse = entry({
    id: 'accessory-product-txp1-mouse',
    group: 'accessory',
    variantId: '201',
    title: 'TXP1 Mouse',
    productTitle: 'TXP1 Mouse',
    model: '',
    productType: 'Wireless Accessory',
    tags: ['portable', 'desk setup'],
    descriptionText: 'Bluetooth mouse with silent clicks.',
    optionValues: ['Space Black'],
    variantTitles: [],
    skus: ['MOUSE-BT-01'],
    aNumbers: []
  });

  for (const query of ['mouse', 'portable', 'wireless', 'silent', 'space black', 'MOUSE-BT-01']) {
    assert.equal(searchEntries([mouse], query).accessory.length, 1, query);
  }
});

test('no match returns distinct empty result groups', () => {
  const results = searchEntries([entry()], 'completely invalid term');
  assert.deepEqual(results.keyboard, []);
  assert.deepEqual(results.accessory, []);
});

test('duplicate entries are prevented by group and variant ID', () => {
  const duplicate = entry({ id: 'duplicate-index-entry' });
  const results = searchEntries([entry(), duplicate], 'A2757');
  assert.equal(results.keyboard.length, 1);
});

test('empty queries preserve configured catalog order', () => {
  const entries = [
    entry({ variantId: '103', title: 'First configured result' }),
    entry({ variantId: '104', title: 'Second configured result' })
  ];

  assert.deepEqual(
    searchEntries(entries, '').keyboard.map((item) => item.variantId),
    ['103', '104']
  );
});

test('hidden initial behavior returns no results until a query exists', () => {
  const results = searchEntries([entry()], '', { initialResults: 'hidden' });
  assert.equal(results.all.length, 0);
  assert.equal(searchEntries([entry()], 'keyboard', { initialResults: 'hidden' }).keyboard.length, 1);
});

test('header-mode result limits cap keyboard and accessory groups independently', () => {
  const entries = [];

  for (let index = 0; index < 5; index += 1) {
    entries.push(
      entry({
        id: `keyboard-${index}`,
        variantId: `keyboard-variant-${index}`,
        title: `Keyboard setup ${index}`,
        model: `Keyboard setup ${index}`
      })
    );
    entries.push(
      entry({
        id: `accessory-${index}`,
        group: 'accessory',
        variantId: `accessory-variant-${index}`,
        title: `Accessory setup ${index}`,
        productTitle: `Accessory setup ${index}`,
        model: '',
        aNumbers: []
      })
    );
  }

  const results = searchEntries(entries, 'setup', {
    initialResults: 'hidden',
    keyboardLimit: 3,
    accessoryLimit: 3
  });
  assert.equal(results.keyboard.length, 3);
  assert.equal(results.accessory.length, 3);
});

test('header search URLs encode the query and preserve route query parameters', () => {
  assert.equal(
    buildSearchUrl('/en/search?type=product', 'A 2757', 'https://noxrev.example'),
    '/en/search?type=product&q=A+2757'
  );
  assert.equal(
    buildSearchUrl('/en/search?type=product&q=old', '', 'https://noxrev.example'),
    '/en/search?type=product'
  );
});

test('header markup uses the shared interface and accessible controls', () => {
  const headerSource = fs.readFileSync(path.join(__dirname, '..', 'sections', 'header.liquid'), 'utf8');
  assert.match(headerSource, /aria-label="Search"/);
  assert.match(headerSource, /aria-expanded="false"/);
  assert.match(headerSource, /aria-controls="HeaderCatalogSearch-/);
  assert.match(headerSource, /render 'catalog-search-interface',[\s\S]*mode: 'header'/);
  assert.match(headerSource, /data-header-search-close/);
  assert.match(headerSource, /event\.key === 'Escape'/);

  const headerScript = headerSource.match(/{% javascript %}([\s\S]*?){% endjavascript %}/);
  assert.ok(headerScript, 'header JavaScript block should exist');
  assert.doesNotThrow(() => new Function(headerScript[1]));
});

test('normalization handles punctuation, typographic quotes, slashes, underscores, and accents', () => {
  assert.equal(normalize('  iPád—Air_11” / M4  '), 'ipad air 11 m4');
});

test('the local search engine contains no fetch request', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'catalog-search.js'), 'utf8');
  assert.equal(/\bfetch\s*\(/.test(source), false);
});

test('A-number extraction ignores unrelated text without an A-number', () => {
  assert.equal(extractANumber('charger'), '');
  assert.equal(extractANumber('model A2757'), 'A2757');
});
