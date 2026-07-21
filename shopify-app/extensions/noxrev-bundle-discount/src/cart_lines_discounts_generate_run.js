// @ts-check

export const DEFAULT_CONFIGURATION = Object.freeze({
  keyboardProductHandles: ['transparent-core-keyboard-case-ipad'],
  accessories: {
    'txp1-pencil': { percentage: 20 },
    'txp1-mouse': { percentage: 20 },
    'txp1-case': { percentage: 20 },
    'txp1-charger': { percentage: 20 },
    'tpx1-cable': { percentage: 20 },
  },
});

const EMPTY_RESULT = Object.freeze({ operations: [] });

/**
 * Applies each configured accessory discount when at least one keyboard is in
 * the cart. Eligible units for each accessory product are capped by the total
 * keyboard quantity, even when the accessory is split across cart lines.
 *
 * @param {any} input
 * @returns {{operations: Array<any>}}
 */
export function cartLinesDiscountsGenerateRun(input) {
  if (!input?.discount?.discountClasses?.includes('PRODUCT')) {
    return EMPTY_RESULT;
  }

  const lines = Array.isArray(input?.cart?.lines) ? input.cart.lines : [];
  const configuration = getConfiguration(input?.discount?.metafield);
  const keyboardHandles = new Set(
    configuration.keyboardProductHandles.map(normalizeHandle).filter(Boolean),
  );

  const keyboardQuantity = lines.reduce((total, line) => {
    const handle = getProductHandle(line);
    return keyboardHandles.has(handle) ? total + getPositiveQuantity(line) : total;
  }, 0);

  if (keyboardQuantity === 0) {
    return EMPTY_RESULT;
  }

  const accessoryRules = new Map(
    Object.entries(configuration.accessories)
      .map(([handle, rule]) => [normalizeHandle(handle), sanitizePercentage(rule?.percentage)])
      .filter(([handle, percentage]) => handle && percentage !== null),
  );

  const remainingByAccessory = new Map(
    [...accessoryRules.keys()].map((handle) => [handle, keyboardQuantity]),
  );
  const targetsByPercentage = new Map();

  for (const line of lines) {
    const handle = getProductHandle(line);
    const percentage = accessoryRules.get(handle);
    const remaining = remainingByAccessory.get(handle) ?? 0;

    if (percentage === undefined || remaining <= 0) {
      continue;
    }

    const discountQuantity = Math.min(getPositiveQuantity(line), remaining);
    if (discountQuantity <= 0) {
      continue;
    }

    const targets = targetsByPercentage.get(percentage) ?? [];
    targets.push({
      cartLine: {
        id: line.id,
        quantity: discountQuantity,
      },
    });
    targetsByPercentage.set(percentage, targets);
    remainingByAccessory.set(handle, remaining - discountQuantity);
  }

  const candidates = [...targetsByPercentage.entries()].map(([percentage, targets]) => ({
    message: `${percentage}% keyboard bundle discount`,
    targets,
    value: {
      percentage: {
        value: percentage,
      },
    },
  }));

  if (candidates.length === 0) {
    return EMPTY_RESULT;
  }

  return {
    operations: [
      {
        productDiscountsAdd: {
          candidates,
          selectionStrategy: 'ALL',
        },
      },
    ],
  };
}

/**
 * @param {any} metafield
 */
function getConfiguration(metafield) {
  let configured = metafield?.jsonValue;

  if (configured === undefined && typeof metafield?.value === 'string') {
    try {
      configured = JSON.parse(metafield.value);
    } catch {
      configured = undefined;
    }
  }

  if (!configured || typeof configured !== 'object' || Array.isArray(configured)) {
    return DEFAULT_CONFIGURATION;
  }

  return {
    keyboardProductHandles: Array.isArray(configured.keyboardProductHandles)
      ? configured.keyboardProductHandles
      : DEFAULT_CONFIGURATION.keyboardProductHandles,
    accessories: {
      ...DEFAULT_CONFIGURATION.accessories,
      ...(configured.accessories && typeof configured.accessories === 'object'
        ? configured.accessories
        : {}),
    },
  };
}

/**
 * @param {any} line
 */
function getProductHandle(line) {
  if (line?.merchandise?.__typename !== 'ProductVariant') {
    return '';
  }

  return normalizeHandle(line.merchandise.product?.handle);
}

/**
 * @param {any} line
 */
function getPositiveQuantity(line) {
  const quantity = Number(line?.quantity);
  return Number.isInteger(quantity) && quantity > 0 ? quantity : 0;
}

/**
 * @param {unknown} value
 */
function normalizeHandle(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

/**
 * @param {unknown} value
 */
function sanitizePercentage(value) {
  const percentage = Number(value);
  return Number.isFinite(percentage) && percentage > 0 && percentage <= 100
    ? percentage
    : null;
}
