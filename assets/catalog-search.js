(function catalogSearchModule(globalScope) {
  'use strict';

  const INDEX_ID = 'CatalogSearchIndex';
  const ROOT_SELECTOR = '[data-catalog-search]';
  const instances = new Set();
  let indexState = null;
  let preparedIndex = null;
  let browserEventsBound = false;

  function asString(value) {
    return value == null ? '' : String(value);
  }

  function flattenText(value) {
    if (Array.isArray(value)) {
      return value.flatMap(flattenText);
    }

    if (value == null || value === false) {
      return [];
    }

    if (typeof value === 'object') {
      return Object.values(value).flatMap(flattenText);
    }

    return [asString(value)];
  }

  function normalize(value) {
    return asString(value)
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[\u2018\u2019\u201a\u201b\u2032\u2035\u201c\u201d\u201e\u201f\u2033\u2036]/g, ' ')
      .replace(/&/g, ' and ')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
      .replace(/\s+/g, ' ');
  }

  function compact(value) {
    return normalize(value).replace(/[^\p{L}\p{N}]+/gu, '');
  }

  function extractANumber(value) {
    const match = asString(value).match(/(?:^|[^a-z0-9])a[\s_\-/]*(\d{3,})(?=$|[^0-9])/i);
    return match ? `A${match[1]}` : '';
  }

  function prepareEntry(entry, order) {
    const titleText = [entry.title, entry.model, entry.productTitle].filter(Boolean).join(' ');
    const searchableParts = [
      entry.title,
      entry.model,
      entry.productTitle,
      entry.vendor,
      entry.productType,
      entry.handle,
      entry.descriptionText,
      entry.tags,
      entry.variantTitles,
      entry.optionValues,
      entry.skus,
      entry.aNumbers,
      entry.searchKeywords
    ].flatMap(flattenText);
    const aNumbers = flattenText(entry.aNumbers).filter(Boolean);

    return {
      entry,
      order,
      normalizedTitle: normalize(titleText),
      compactTitle: compact(titleText),
      document: normalize(searchableParts.join(' ')),
      compactDocument: compact(searchableParts.join(' ')),
      normalizedANumbers: new Set(aNumbers.map(compact)),
      aNumbers
    };
  }

  function parseIndex(documentRef) {
    if (indexState) {
      return indexState;
    }

    const indexElement = documentRef && documentRef.getElementById(INDEX_ID);

    if (!indexElement) {
      indexState = { status: 'missing', entries: [], element: null };
      console.error('[NoxRev catalog search] Global CatalogSearchIndex element was not found.');
      return indexState;
    }

    try {
      const parsed = JSON.parse(indexElement.textContent || '[]');

      if (!Array.isArray(parsed)) {
        throw new TypeError('CatalogSearchIndex must contain a JSON array.');
      }

      const entries = parsed.filter((entry) => entry && typeof entry === 'object');
      indexState = {
        status: entries.length ? 'ready' : 'empty',
        entries: Object.freeze(entries.map((entry) => Object.freeze(entry))),
        element: indexElement
      };

      const keyboardStatus = indexElement.dataset.keyboardStatus;
      const accessoriesStatus = indexElement.dataset.accessoriesStatus;

      if (keyboardStatus && keyboardStatus !== 'ready') {
        const configuredName = indexElement.dataset.modelOptionName || '(not configured)';
        console.warn(
          `[NoxRev catalog search] Keyboard index status: ${keyboardStatus}. ` +
            `The configured model option is “${configuredName}”.`
        );
      }

      if (accessoriesStatus && accessoriesStatus !== 'ready') {
        console.warn(`[NoxRev catalog search] Accessories index status: ${accessoriesStatus}.`);
      }

      if (!entries.length) {
        console.error('[NoxRev catalog search] The global catalog index contains no products.');
      }
    } catch (error) {
      indexState = { status: 'invalid', entries: [], element: indexElement, error };
      console.error('[NoxRev catalog search] CatalogSearchIndex contains invalid JSON.', error);
    }

    return indexState;
  }

  function getPreparedIndex(documentRef) {
    if (preparedIndex) {
      return preparedIndex;
    }

    const state = parseIndex(documentRef);
    preparedIndex = Object.freeze(state.entries.map(prepareEntry));
    return preparedIndex;
  }

  function scorePreparedEntry(prepared, query) {
    const normalizedQuery = normalize(query);

    if (!normalizedQuery) {
      return 0;
    }

    const compactQuery = compact(query);
    const exactANumber = extractANumber(query);

    if (exactANumber && prepared.normalizedANumbers.has(compact(exactANumber))) {
      return 1000;
    }

    if (prepared.normalizedTitle === normalizedQuery || prepared.compactTitle === compactQuery) {
      return 900;
    }

    if (
      prepared.normalizedTitle.startsWith(normalizedQuery) ||
      (compactQuery.length > 1 && prepared.compactTitle.startsWith(compactQuery))
    ) {
      return 800;
    }

    const tokens = normalizedQuery.split(' ').filter(Boolean);

    if (tokens.length && tokens.every((token) => prepared.normalizedTitle.includes(token))) {
      return 700;
    }

    if (tokens.length && tokens.every((token) => prepared.document.includes(token))) {
      return 600;
    }

    if (compactQuery.length > 1 && prepared.compactDocument.includes(compactQuery)) {
      return 500;
    }

    return null;
  }

  function deduplicateMatches(matches) {
    const seen = new Set();

    return matches.filter((match) => {
      const entry = match.prepared.entry;
      const key = entry.variantId ? `${entry.group}:${entry.variantId}` : `${entry.group}:${entry.id}`;

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
  }

  function searchPreparedIndex(preparedEntries, query, options) {
    const settings = options || {};
    const normalizedQuery = normalize(query);
    const showInitial = settings.initialResults !== 'hidden';
    const exactANumber = extractANumber(query);

    if (!normalizedQuery && !showInitial) {
      return { query: '', exactANumber: '', keyboard: [], accessory: [], all: [] };
    }

    const matches = deduplicateMatches(
      preparedEntries
        .map((prepared) => ({ prepared, score: scorePreparedEntry(prepared, query) }))
        .filter((match) => match.score !== null)
        .sort((left, right) => right.score - left.score || left.prepared.order - right.prepared.order)
    );

    let keyboard = matches
      .filter((match) => match.prepared.entry.group === 'keyboard')
      .map((match) => match.prepared.entry);
    let accessory = matches
      .filter((match) => match.prepared.entry.group === 'accessory')
      .map((match) => match.prepared.entry);

    const keyboardLimit = Number(settings.keyboardLimit) || 0;
    const accessoryLimit = Number(settings.accessoryLimit) || 0;

    if (keyboardLimit > 0) {
      keyboard = keyboard.slice(0, keyboardLimit);
    }
    if (accessoryLimit > 0) {
      accessory = accessory.slice(0, accessoryLimit);
    }

    return {
      query: asString(query),
      exactANumber,
      keyboard,
      accessory,
      all: keyboard.concat(accessory)
    };
  }

  function getIndex(documentRef) {
    const state = parseIndex(documentRef || (typeof document !== 'undefined' ? document : null));
    return state.entries;
  }

  function search(query, options) {
    const documentRef = options && options.document ? options.document : typeof document !== 'undefined' ? document : null;
    return searchPreparedIndex(getPreparedIndex(documentRef), query, options);
  }

  function buildSearchUrl(baseUrl, query, origin) {
    const destination = asString(baseUrl);

    if (!destination) {
      return '';
    }

    const baseOrigin = origin || (globalScope.location && globalScope.location.origin) || 'https://example.invalid';
    const url = new URL(destination, baseOrigin);
    const normalizedQuery = asString(query).trim();

    if (normalizedQuery) {
      url.searchParams.set('q', normalizedQuery);
    } else {
      url.searchParams.delete('q');
    }

    return destination.startsWith('/') ? `${url.pathname}${url.search}${url.hash}` : url.toString();
  }

  function createElement(documentRef, tagName, className, text) {
    const element = documentRef.createElement(tagName);

    if (className) {
      element.className = className;
    }
    if (text !== undefined && text !== null) {
      element.textContent = asString(text);
    }

    return element;
  }

  function renderImage(documentRef, entry) {
    const media = createElement(documentRef, 'div', 'catalog-search__card-media');
    const imageData = entry.image || {};

    if (imageData.src) {
      const image = createElement(documentRef, 'img', 'catalog-search__card-image');
      image.src = imageData.src;
      image.alt = imageData.alt || entry.model || entry.title || entry.productTitle || '';
      image.loading = 'lazy';
      image.decoding = 'async';
      image.sizes = '(min-width: 1200px) 22vw, (min-width: 750px) 33vw, 50vw';

      if (imageData.srcset) {
        image.srcset = imageData.srcset;
      }
      if (Number(imageData.width) > 0) {
        image.width = Number(imageData.width);
      }
      if (Number(imageData.height) > 0) {
        image.height = Number(imageData.height);
      }

      media.append(image);
    } else {
      const placeholder = createElement(documentRef, 'div', 'catalog-search__card-placeholder', 'N');
      placeholder.setAttribute('aria-hidden', 'true');
      media.append(placeholder);
    }

    return media;
  }

  function renderPrice(documentRef, entry) {
    const price = entry.price || {};
    const wrapper = createElement(documentRef, 'div', 'catalog-search__card-price');
    const current = createElement(documentRef, 'span', 'catalog-search__card-price-current', price.formatted || '');
    wrapper.setAttribute('aria-label', 'Product price');
    wrapper.append(current);

    if (
      price.compareAtFormatted &&
      Number(price.compareAtCents) > 0 &&
      Number(price.compareAtCents) > Number(price.cents)
    ) {
      const compare = createElement(
        documentRef,
        's',
        'catalog-search__card-price-compare',
        price.compareAtFormatted
      );
      wrapper.append(compare);
    }

    return wrapper;
  }

  function renderCard(documentRef, entry, options) {
    const article = createElement(documentRef, 'article', 'catalog-search__card panel link-surface');
    const link = createElement(documentRef, 'a', 'catalog-search__card-link');
    const content = createElement(documentRef, 'div', 'catalog-search__card-content');
    const isKeyboard = entry.group === 'keyboard';
    const isOnSale =
      entry.price && Number(entry.price.compareAtCents) > 0 && Number(entry.price.compareAtCents) > Number(entry.price.cents);

    article.setAttribute('role', 'listitem');
    article.dataset.catalogSearchEntryId = entry.id || '';
    article.classList.add(isKeyboard ? 'catalog-search__card--keyboard' : 'catalog-search__card--accessory');
    if (options.mode === 'header') {
      article.classList.add('catalog-search__card--compact');
    }
    link.href = entry.url || '#';
    link.setAttribute('aria-label', `Open ${entry.title || entry.productTitle || 'product'}`);
    link.append(renderImage(documentRef, entry));

    const badges = createElement(documentRef, 'div', 'catalog-search__card-badges');
    if (!entry.available) {
      badges.append(createElement(documentRef, 'span', 'badge badge--secondary', 'Sold out'));
    }
    if (isOnSale) {
      badges.append(createElement(documentRef, 'span', 'badge', 'Sale'));
    }
    if (badges.childElementCount) {
      link.append(badges);
    }

    content.append(
      createElement(documentRef, 'p', 'catalog-search__card-eyebrow', isKeyboard ? 'Keyboard Case' : entry.productType || 'Accessory')
    );
    content.append(createElement(documentRef, 'h3', 'catalog-search__card-title', entry.title || entry.productTitle));

    if (isKeyboard && entry.productTitle && entry.productTitle !== entry.title) {
      content.append(createElement(documentRef, 'p', 'catalog-search__card-parent', entry.productTitle));
    }

    if (options.exactANumber && flattenText(entry.aNumbers).map(compact).includes(compact(options.exactANumber))) {
      content.append(
        createElement(
          documentRef,
          'p',
          'catalog-search__card-compatibility',
          `Compatible with ${options.exactANumber}`
        )
      );
    }

    if (options.showDescriptions && entry.descriptionText) {
      content.append(createElement(documentRef, 'p', 'catalog-search__card-description', entry.descriptionText));
    }

    const footer = createElement(documentRef, 'div', 'catalog-search__card-footer');
    const details = createElement(documentRef, 'div', 'catalog-search__card-details');

    if (options.showPrices && entry.price && entry.price.formatted) {
      details.append(renderPrice(documentRef, entry));
    }

    if (!entry.available) {
      details.append(createElement(documentRef, 'span', 'catalog-search__card-availability', 'Currently unavailable'));
    }

    footer.append(details);
    footer.append(createElement(documentRef, 'span', 'catalog-search__card-cta', 'View product'));
    content.append(footer);
    link.append(content);
    article.append(link);
    return article;
  }

  function renderGroup(documentRef, container, emptyState, countBadge, entries, renderOptions, showEmptyState) {
    const fragment = documentRef.createDocumentFragment();

    entries.forEach((entry) => fragment.append(renderCard(documentRef, entry, renderOptions)));
    container.replaceChildren(fragment);
    emptyState.hidden = !showEmptyState || entries.length > 0;
    container.hidden = entries.length === 0;
    countBadge.textContent = asString(entries.length);
  }

  function statusText(keyboardCount, accessoryCount) {
    const total = keyboardCount + accessoryCount;

    if (!total) {
      return 'No matching products';
    }

    const keyboardLabel = `${keyboardCount} keyboard result${keyboardCount === 1 ? '' : 's'}`;
    const accessoryLabel = `${accessoryCount} accessory result${accessoryCount === 1 ? '' : 's'}`;
    return `${keyboardLabel} and ${accessoryLabel}`;
  }

  function updatePageUrl(query, targetUrl) {
    const url = new URL(globalScope.location.href);
    const normalizedQuery = asString(query).trim();

    if (normalizedQuery) {
      url.searchParams.set('q', normalizedQuery);
    } else {
      url.searchParams.delete('q');
    }

    if (targetUrl) {
      const configuredUrl = new URL(targetUrl, globalScope.location.origin);
      url.pathname = configuredUrl.pathname;
    }

    globalScope.history.replaceState(globalScope.history.state, '', url.toString());
  }

  function mount(root) {
    if (!root || root.dataset.catalogSearchInitialized === 'true') {
      return null;
    }

    root.dataset.catalogSearchInitialized = 'true';
    const documentRef = root.ownerDocument;
    const state = parseIndex(documentRef);
    const elements = {
      form: root.querySelector('[data-catalog-search-form]'),
      input: root.querySelector('[data-catalog-search-input]'),
      clear: root.querySelector('[data-catalog-search-clear]'),
      status: root.querySelector('[data-catalog-search-status]'),
      unavailable: root.querySelector('[data-catalog-search-unavailable]'),
      groups: root.querySelector('[data-catalog-search-groups]'),
      keyboardResults: root.querySelector('[data-catalog-search-keyboard-results]'),
      keyboardEmpty: root.querySelector('[data-catalog-search-keyboard-empty]'),
      keyboardCount: root.querySelector('[data-catalog-search-keyboard-count]'),
      accessoryResults: root.querySelector('[data-catalog-search-accessory-results]'),
      accessoryEmpty: root.querySelector('[data-catalog-search-accessory-empty]'),
      accessoryCount: root.querySelector('[data-catalog-search-accessory-count]'),
      keyboardGroup: root.querySelector('[data-catalog-search-keyboard-group]'),
      accessoryGroup: root.querySelector('[data-catalog-search-accessory-group]'),
      prompt: root.querySelector('[data-catalog-search-prompt]'),
      noResults: root.querySelector('[data-catalog-search-no-results]'),
      viewAll: root.querySelector('[data-catalog-search-view-all]')
    };
    const mode = root.dataset.catalogSearchMode || 'section';
    const showKeyboard = root.dataset.catalogSearchShowKeyboard !== 'false';
    const showAccessories = root.dataset.catalogSearchShowAccessories !== 'false';
    const settings = {
      initialResults: root.dataset.catalogSearchInitialResults || 'all',
      keyboardLimit: root.dataset.catalogSearchKeyboardLimit || 0,
      accessoryLimit: root.dataset.catalogSearchAccessoryLimit || 0,
      showDescriptions: root.dataset.catalogSearchShowDescriptions === 'true',
      showPrices: root.dataset.catalogSearchShowPrices !== 'false'
    };

    if (!elements.form || !elements.input || !elements.clear || !elements.status) {
      console.error('[NoxRev catalog search] A search interface is missing required internal hooks.', root);
      return null;
    }

    if (state.status === 'missing' || state.status === 'invalid' || state.status === 'empty') {
      if (elements.unavailable) {
        elements.unavailable.hidden = false;
      }
      if (elements.groups) {
        elements.groups.hidden = true;
      }
      elements.status.textContent = 'Search is temporarily unavailable';
      return null;
    }

    const prepared = getPreparedIndex(documentRef);

    const instance = {
      root,
      mode,
      render(query, syncUrl) {
        const results = searchPreparedIndex(prepared, query, settings);
        const renderOptions = {
          exactANumber: results.exactANumber,
          showDescriptions: settings.showDescriptions,
          showPrices: settings.showPrices,
          mode
        };
        const showGroupEmptyStates = mode !== 'header';

        if (showKeyboard && elements.keyboardResults && elements.keyboardEmpty && elements.keyboardCount) {
          renderGroup(
            documentRef,
            elements.keyboardResults,
            elements.keyboardEmpty,
            elements.keyboardCount,
            results.keyboard,
            renderOptions,
            showGroupEmptyStates
          );
        }

        if (showAccessories && elements.accessoryResults && elements.accessoryEmpty && elements.accessoryCount) {
          renderGroup(
            documentRef,
            elements.accessoryResults,
            elements.accessoryEmpty,
            elements.accessoryCount,
            results.accessory,
            renderOptions,
            showGroupEmptyStates
          );
        }

        const keyboardCount = showKeyboard ? results.keyboard.length : 0;
        const accessoryCount = showAccessories ? results.accessory.length : 0;
        const hasQuery = normalize(query).length > 0;
        const totalCount = keyboardCount + accessoryCount;

        if (mode === 'header') {
          if (elements.prompt) {
            elements.prompt.hidden = hasQuery;
          }
          if (elements.noResults) {
            elements.noResults.hidden = !hasQuery || totalCount > 0;
          }
          if (elements.groups) {
            elements.groups.hidden = !hasQuery || totalCount === 0;
            elements.groups.classList.toggle(
              'catalog-search__groups--single',
              hasQuery && totalCount > 0 && (keyboardCount === 0 || accessoryCount === 0)
            );
          }
          if (elements.keyboardGroup) {
            elements.keyboardGroup.hidden = !hasQuery || keyboardCount === 0;
          }
          if (elements.accessoryGroup) {
            elements.accessoryGroup.hidden = !hasQuery || accessoryCount === 0;
          }
          if (elements.viewAll) {
            elements.viewAll.href = buildSearchUrl(root.dataset.catalogSearchUrl, query);
          }
        }

        elements.status.textContent = hasQuery
          ? statusText(keyboardCount, accessoryCount)
          : mode === 'header'
            ? 'Start typing to search the catalog'
            : statusText(keyboardCount, accessoryCount);
        elements.clear.hidden = !asString(query).length;

        if (syncUrl && mode === 'page') {
          updatePageUrl(query, root.dataset.catalogSearchUrl);
        }

        return results;
      },
      restoreFromLocation() {
        if (mode !== 'page') {
          return;
        }

        const query = new URL(globalScope.location.href).searchParams.get('q') || '';
        elements.input.value = query;
        instance.render(query, false);
      }
    };

    elements.form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (mode === 'header') {
        globalScope.location.assign(buildSearchUrl(root.dataset.catalogSearchUrl, elements.input.value));
        return;
      }
      instance.render(elements.input.value, true);
    });
    elements.input.addEventListener('input', () => instance.render(elements.input.value, true));
    elements.clear.addEventListener('click', () => {
      elements.input.value = '';
      instance.render('', true);
      elements.input.focus();
    });

    instances.add(instance);
    instance.render(elements.input.value, false);
    return instance;
  }

  function mountAll(scope) {
    const searchScope = scope || (typeof document !== 'undefined' ? document : null);

    if (!searchScope) {
      return [];
    }

    const roots = [];

    if (searchScope.matches && searchScope.matches(ROOT_SELECTOR)) {
      roots.push(searchScope);
    }
    if (searchScope.querySelectorAll) {
      roots.push(...searchScope.querySelectorAll(ROOT_SELECTOR));
    }

    return roots.map(mount).filter(Boolean);
  }

  function bindBrowserEvents() {
    if (browserEventsBound || typeof document === 'undefined') {
      return;
    }

    browserEventsBound = true;
    globalScope.addEventListener('popstate', () => {
      instances.forEach((instance) => {
        if (!instance.root.isConnected) {
          instances.delete(instance);
          return;
        }
        instance.restoreFromLocation();
      });
    });
    document.addEventListener('shopify:section:load', (event) => mountAll(event.target));

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => mountAll(document), { once: true });
    } else {
      mountAll(document);
    }
  }

  const publicApi = Object.freeze({
    getIndex,
    buildSearchUrl,
    mount,
    mountAll,
    normalize,
    compact,
    extractANumber,
    prepareEntry,
    scorePreparedEntry,
    searchPreparedIndex,
    search
  });

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = publicApi;
  }

  if (globalScope && globalScope.document) {
    globalScope.NoxrevCatalogSearch = publicApi;
    bindBrowserEvents();
  }
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this);
