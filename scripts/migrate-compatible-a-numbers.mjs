#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const DEFAULT_CSV_PATH = 'C:\\Users\\nerka\\Downloads\\NOXREV\\Group,Model,A-number.csv';
const DEFAULT_STORE = 'tykvge-hj.myshopify.com';
const API_VERSION = process.env.SHOPIFY_API_VERSION || '2026-04';
const METAFIELD_NAMESPACE = 'custom';
const METAFIELD_KEY = 'compatible_a_numbers';
const METAFIELD_TYPE = 'list.single_line_text_field';
const execFileAsync = promisify(execFile);

function parseArgs(argv) {
  const args = {
    csv: DEFAULT_CSV_PATH,
    store: process.env.SHOPIFY_STORE || process.env.SHOPIFY_SHOP || DEFAULT_STORE,
    token: process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN,
    dryRun: true,
    apply: false,
    productQuery: process.env.SHOPIFY_PRODUCT_QUERY || '',
    authMode: process.env.SHOPIFY_AUTH_MODE || 'auto',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--csv') args.csv = argv[++i];
    else if (arg === '--store') args.store = argv[++i];
    else if (arg === '--token-env') args.token = process.env[argv[++i]];
    else if (arg === '--product-query') args.productQuery = argv[++i];
    else if (arg === '--auth') args.authMode = argv[++i];
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--apply') {
      args.apply = true;
      args.dryRun = false;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function printHelp() {
  console.log(`Usage:
  node scripts/migrate-compatible-a-numbers.mjs --dry-run
  node scripts/migrate-compatible-a-numbers.mjs --apply

Options:
  --csv <path>             CSV path. Defaults to the attached NOXREV CSV.
  --store <myshopify>      Store domain. Defaults to ${DEFAULT_STORE}.
  --token-env <name>       Read Admin API token from a named environment variable.
  --product-query <query>  Optional Shopify product search query before keyboard filtering.
  --auth <auto|cli|token>  Auth source. Defaults to auto: token env first, then Shopify CLI store auth.

Environment:
  SHOPIFY_ADMIN_API_ACCESS_TOKEN or SHOPIFY_ADMIN_TOKEN may be used.
  Without a token, the script uses Shopify CLI store auth via "shopify store execute".
  SHOPIFY_STORE or SHOPIFY_SHOP can override the default store.
`);
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\bipad\b/g, 'ipad')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

function normalizeANumber(value) {
  const match = String(value || '').toUpperCase().replace(/\s+/g, '').match(/A\d{4}/);
  return match ? match[0] : '';
}

function parseCsv(text) {
  const simpleRows = parseSimpleCsv(text);
  if (simpleRows.length > 0) return simpleRows;

  const rows = [];
  let field = '';
  let row = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      field += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      row.push(field);
      field = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(field);
      if (row.some((cell) => cell.trim() !== '')) rows.push(row);
      field = '';
      row = [];
    } else {
      field += char;
    }
  }

  if (field || row.length) {
    row.push(field);
    if (row.some((cell) => cell.trim() !== '')) rows.push(row);
  }

  if (rows.length === 0) return [];
  return rowsToRecords(rows);
}

function parseSimpleCsv(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim() !== '');
  if (lines.length === 0) return [];
  const rows = lines.map((line) => line.split(','));
  const headers = rows[0].map((header) => header.trim());
  const expected = ['Group', 'Model', 'A-number'];
  if (headers.length !== expected.length || !expected.every((header, index) => headers[index] === header)) {
    return [];
  }

  return rowsToRecords(rows);
}

function rowsToRecords(rows) {
  const headers = rows[0].map((header) => header.trim().replace(/^\uFEFF/, ''));
  return rows.slice(1).map((cells, index) => {
    const record = { __row: index + 2 };
    headers.forEach((header, cellIndex) => {
      record[header] = (cells[cellIndex] || '').trim();
    });
    return record;
  });
}

function sizeToken(part) {
  const normalized = part.toLowerCase().replace(/"/g, '').replace(/\binch\b/g, '');
  const match = normalized.match(/(\d+(?:\.\d+)?)/);
  return match ? match[1].replace('.', '') : '';
}

function lineToken(part) {
  const lower = part.toLowerCase();
  if (lower.includes('mini')) return 'mini';
  if (lower.includes('air')) return 'air';
  if (lower.includes('pro')) return 'pro';
  return 'ipad';
}

function modelParts(model) {
  return model.split('/').map((part) => {
    const line = lineToken(part);
    const size = sizeToken(part);
    return { line, size, label: part.trim() };
  });
}

function partMatchesVariant(part, variantTitle) {
  const normalized = normalizeText(variantTitle);
  const compact = `${part.line}${part.size}`;
  const ipadCompact = `ipad${part.line === 'ipad' ? '' : part.line}${part.size}`;

  if (part.line === 'ipad') {
    return normalized.includes(ipadCompact) || normalized.includes(`ipad${part.size}`);
  }

  return normalized.includes(ipadCompact) || normalized.includes(compact);
}

function modelMatchesVariant(model, variantTitle) {
  const parts = modelParts(model);
  const normalized = normalizeText(variantTitle);
  const variantMentionsAirAndPro = normalized.includes('air') && normalized.includes('pro');

  if (variantMentionsAirAndPro && parts.length === 1) {
    return false;
  }

  return parts.every((part) => partMatchesVariant(part, variantTitle));
}

function groupCsvRows(rows) {
  const groups = new Map();
  const invalidRows = [];

  for (const row of rows) {
    const group = row.Group || '';
    const model = row.Model || '';
    const aNumber = normalizeANumber(row['A-number']);

    if (!group || !model || !aNumber) {
      invalidRows.push(row);
      continue;
    }

    const key = `${normalizeText(group)}::${normalizeText(model)}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        group,
        model,
        numbers: new Set(),
        rows: [],
      });
    }

    const entry = groups.get(key);
    entry.numbers.add(aNumber);
    entry.rows.push(row);
  }

  return { groups: [...groups.values()], invalidRows };
}

function isKeyboardProduct(product) {
  const haystack = normalizeText([
    product.title,
    product.handle,
    product.productType,
    ...(product.tags || []),
  ].join(' '));

  const hasIpadVariants = product.variants.nodes.some((variant) => normalizeText(variant.title).includes('ipad'));

  return hasIpadVariants && (haystack.includes('keyboard') || haystack.includes('txp1'));
}

async function shopifyGraphql({ store, token, query, variables }) {
  if (!token) {
    return shopifyGraphqlViaCli({ store, query, variables });
  }

  const response = await fetch(`https://${store}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify({ query, variables }),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok || body?.errors) {
    throw new Error(JSON.stringify({ status: response.status, body }, null, 2));
  }

  return body.data;
}

async function shopifyGraphqlViaCli({ store, query, variables }) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'noxrev-shopify-'));
  const queryFile = path.join(tempDir, 'operation.graphql');
  const variablesFile = path.join(tempDir, 'variables.json');
  const outputFile = path.join(tempDir, 'response.json');
  const isMutation = /^\s*(#graphql\s*)?mutation\b/i.test(query);

  try {
    await fs.writeFile(queryFile, query, 'utf8');
    await fs.writeFile(variablesFile, JSON.stringify(variables || {}), 'utf8');

    const cliArgs = [
      'store',
      'execute',
      '--store',
      store,
      '--query-file',
      queryFile,
      '--variable-file',
      variablesFile,
      '--version',
      API_VERSION,
      '--json',
      '--output-file',
      outputFile,
    ];

    if (isMutation) cliArgs.push('--allow-mutations');

    try {
      const command = process.platform === 'win32' ? 'cmd.exe' : 'shopify';
      const args = process.platform === 'win32' ? ['/d', '/s', '/c', 'shopify.cmd', ...cliArgs] : cliArgs;

      await execFileAsync(command, args, {
        cwd: process.cwd(),
        windowsHide: true,
        maxBuffer: 1024 * 1024 * 20,
      });
    } catch (error) {
      const detail = [error.stdout, error.stderr, error.message].filter(Boolean).join('\n').trim();
      throw new Error(`Shopify CLI Admin GraphQL failed.\n${detail}\n\nRun this once to create CLI store auth:\nshopify store auth --store ${store} --scopes read_products,write_products,read_metafields,write_metafields`);
    }

    const raw = await fs.readFile(outputFile, 'utf8');
    const body = JSON.parse(raw);
    if (body?.errors) {
      throw new Error(JSON.stringify(body.errors, null, 2));
    }

    return body.data || body;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function fetchProducts(args) {
  const products = [];
  let cursor = null;
  const query = `#graphql
    query Products($cursor: String, $query: String) {
      products(first: 50, after: $cursor, query: $query) {
        nodes {
          id
          title
          handle
          productType
          tags
          variants(first: 100) {
            nodes {
              id
              title
              sku
              selectedOptions {
                name
                value
              }
              metafield(namespace: "${METAFIELD_NAMESPACE}", key: "${METAFIELD_KEY}") {
                id
                value
                type
              }
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  `;

  do {
    const data = await shopifyGraphql({
      store: args.store,
      token: args.token,
      query,
      variables: { cursor, query: args.productQuery || null },
    });

    products.push(...data.products.nodes);
    cursor = data.products.pageInfo.hasNextPage ? data.products.pageInfo.endCursor : null;
  } while (cursor);

  return products;
}

function selectedModelText(product, variant) {
  const options = (variant.selectedOptions || []).map((option) => option.value).join(' / ');
  return `${product.title} / ${variant.title} / ${options}`;
}

function buildMapping(groups, products) {
  const keyboardProducts = products.filter(isKeyboardProduct);
  const variants = keyboardProducts.flatMap((product) =>
    product.variants.nodes.map((variant) => ({ product, variant }))
  );

  const mapped = [];
  const unmatchedVariants = [];
  const ambiguousVariants = [];
  const matchedGroupKeys = new Set();

  for (const item of variants) {
    const text = selectedModelText(item.product, item.variant);
    const matches = groups.filter((group) => modelMatchesVariant(group.model, text));

    if (matches.length === 1) {
      const group = matches[0];
      matchedGroupKeys.add(group.key);
      mapped.push({ ...item, group, numbers: [...group.numbers].sort() });
    } else if (matches.length === 0) {
      unmatchedVariants.push({ ...item, text });
    } else {
      ambiguousVariants.push({ ...item, text, matches });
    }
  }

  const unmatchedCsvGroups = groups.filter((group) => !matchedGroupKeys.has(group.key));

  return {
    keyboardProducts,
    mapped,
    unmatchedVariants,
    ambiguousVariants,
    unmatchedCsvGroups,
  };
}

function metafieldInput(variantId, numbers) {
  return {
    ownerId: variantId,
    namespace: METAFIELD_NAMESPACE,
    key: METAFIELD_KEY,
    type: METAFIELD_TYPE,
    value: JSON.stringify(numbers),
  };
}

function printDryRun(mapping, invalidRows) {
  console.log('DRY RUN ONLY - no writes will be sent to Shopify.');
  console.log('');
  console.log(`Keyboard products found: ${mapping.keyboardProducts.length}`);
  console.log(`Variants that would be updated: ${mapping.mapped.length}`);
  console.log('');

  for (const item of mapping.mapped) {
    const payload = metafieldInput(item.variant.id, item.numbers);
    console.log('---');
    console.log(`Product: ${item.product.title}`);
    console.log(`Variant: ${item.variant.title}`);
    console.log(`Matched CSV group/model: ${item.group.group} / ${item.group.model}`);
    console.log(`A-numbers (${item.numbers.length}): ${item.numbers.join(', ')}`);
    console.log('Metafield value:');
    console.log(payload.value);
    console.log('GraphQL metafieldsSet input:');
    console.log(JSON.stringify(payload, null, 2));
  }

  printDiagnostics(mapping, invalidRows);
}

function printDiagnostics(mapping, invalidRows) {
  console.log('');
  console.log('=== Diagnostics ===');
  console.log(`Invalid CSV rows: ${invalidRows.length}`);
  for (const row of invalidRows) {
    console.log(`CSV row ${row.__row}: ${JSON.stringify(row)}`);
  }

  console.log(`Unmatched CSV groups: ${mapping.unmatchedCsvGroups.length}`);
  for (const group of mapping.unmatchedCsvGroups) {
    console.log(`${group.group} / ${group.model}: ${[...group.numbers].sort().join(', ')}`);
  }

  console.log(`Unmatched Shopify variants: ${mapping.unmatchedVariants.length}`);
  for (const item of mapping.unmatchedVariants) {
    console.log(`${item.product.title} / ${item.variant.title}`);
  }

  console.log(`Ambiguous Shopify variants: ${mapping.ambiguousVariants.length}`);
  for (const item of mapping.ambiguousVariants) {
    console.log(`${item.product.title} / ${item.variant.title}`);
    console.log(`Matches: ${item.matches.map((match) => `${match.group} / ${match.model}`).join(' | ')}`);
  }
}

async function applyUpdates(args, mapped) {
  const mutation = `#graphql
    mutation SetVariantMetafield($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields {
          id
          namespace
          key
          value
          owner {
            ... on ProductVariant {
              id
              title
            }
          }
        }
        userErrors {
          field
          message
          code
        }
      }
    }
  `;

  const results = {
    successful: [],
    failed: [],
  };

  for (const item of mapped) {
    const input = metafieldInput(item.variant.id, item.numbers);
    try {
      const data = await shopifyGraphql({
        store: args.store,
        token: args.token,
        query: mutation,
        variables: { metafields: [input] },
      });

      const errors = data.metafieldsSet.userErrors || [];
      if (errors.length) {
        results.failed.push({ item, errors });
        console.log(`${item.variant.title}: failed (${JSON.stringify(errors)})`);
        continue;
      }

      results.successful.push(item);
      console.log(`${item.variant.title}: wrote ${item.numbers.length} A-numbers (${item.numbers.slice(0, 5).join(', ')})`);
    } catch (error) {
      results.failed.push({ item, errors: [{ message: error.message }] });
      console.log(`${item.variant.title}: failed (${error.message})`);
    }
  }

  return results;
}

function parseMetafieldList(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String).sort() : [];
  } catch {
    return [];
  }
}

function sameList(a, b) {
  return JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
}

function verifyMetafields(mapping) {
  const failures = [];

  for (const item of mapping.mapped) {
    const actual = parseMetafieldList(item.variant.metafield?.value);
    const expected = [...item.numbers].sort();
    if (!sameList(actual, expected)) {
      failures.push({
        variant: item.variant.title,
        expected,
        actual,
      });
    }
  }

  return failures;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.authMode === 'token' && !args.token) {
    throw new Error('Missing Admin API token. Set SHOPIFY_ADMIN_API_ACCESS_TOKEN or SHOPIFY_ADMIN_TOKEN, or pass --token-env <ENV_NAME>.');
  }

  if (args.authMode === 'cli') {
    args.token = null;
  } else if (args.authMode !== 'auto' && args.authMode !== 'token') {
    throw new Error('--auth must be one of: auto, cli, token.');
  }

  const csvPath = path.resolve(args.csv);
  const csvText = await fs.readFile(csvPath, 'utf8');
  const rows = parseCsv(csvText);
  const { groups, invalidRows } = groupCsvRows(rows);

  console.log(`CSV: ${csvPath}`);
  console.log(`Store: ${args.store}`);
  console.log(`Mode: ${args.dryRun ? 'dry-run' : 'apply'}`);
  console.log(`Auth: ${args.token ? 'Admin API token env' : 'Shopify CLI store execute'}`);
  console.log(`CSV rows: ${rows.length}`);
  console.log(`CSV model groups: ${groups.length}`);
  console.log('');

  const products = await fetchProducts(args);
  const mapping = buildMapping(groups, products);

  if (mapping.ambiguousVariants.length > 0) {
    printDiagnostics(mapping, invalidRows);
    throw new Error('Ambiguous variant mapping found. Stopping before any writes.');
  }

  if (mapping.unmatchedVariants.length > 0 || mapping.unmatchedCsvGroups.length > 0 || invalidRows.length > 0) {
    printDiagnostics(mapping, invalidRows);
    throw new Error('Unmatched data found. Stopping before any writes.');
  }

  if (args.dryRun) {
    printDryRun(mapping, invalidRows);
    return;
  }

  if (!args.apply) {
    throw new Error('Live updates require --apply.');
  }

  const results = await applyUpdates(args, mapping.mapped);

  console.log('');
  console.log('=== Apply Summary ===');
  console.log(`Total successful updates: ${results.successful.length}`);
  console.log(`Total failed updates: ${results.failed.length}`);
  for (const failure of results.failed) {
    console.log(`${failure.item.product.title} / ${failure.item.variant.title}`);
    console.log(JSON.stringify(failure.errors, null, 2));
  }

  if (results.failed.length > 0) {
    throw new Error('One or more updates failed. Verification skipped.');
  }

  const verificationProducts = await fetchProducts(args);
  const verificationMapping = buildMapping(groups, verificationProducts);
  const verificationFailures = verifyMetafields(verificationMapping);

  console.log('');
  console.log('=== Verification ===');
  console.log(`Variants checked: ${verificationMapping.mapped.length}`);
  console.log(`Verification failures: ${verificationFailures.length}`);
  for (const failure of verificationFailures) {
    console.log(`${failure.variant}`);
    console.log(`Expected: ${failure.expected.join(', ')}`);
    console.log(`Actual: ${failure.actual.join(', ')}`);
  }

  if (verificationFailures.length > 0) {
    throw new Error('Post-apply verification failed.');
  }

  console.log('All variants contain the expected custom.compatible_a_numbers values.');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
