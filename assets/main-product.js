  (() => {
    const FRAGMENT_SELECTORS = [
      '[data-product-gallery-region]',
      '[data-product-price-region]',
      '[data-product-options-region]',
      '[data-product-form-region]',
    ];
    const PENDING_CLASS = 'is-pending';
    const OPTIMISTIC_CLASS = 'is-optimistically-selected';
    const DESELECTING_CLASS = 'is-optimistically-deselected';
    const SUBMIT_LOADING_CLASS = 'is-loading';
    let variantRequestController = null;
    let variantRequestSequence = 0;
    const initializedModelTabs = new WeakSet();
    const activeModelFamilies = new Map();

    const applyModelFamilyState = (selector, family) => {
      if (!selector) {
        return;
      }

      const tabs = Array.from(selector.querySelectorAll('[data-model-tab]'));
      const panels = Array.from(selector.querySelectorAll('[data-model-panel]'));
      const shouldOpen = family && tabs.some((tab) => tab.dataset.modelTab === family);

      tabs.forEach((tab) => {
        const isActive = shouldOpen && tab.dataset.modelTab === family;
        tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
        tab.setAttribute('tabindex', shouldOpen ? (isActive ? '0' : '-1') : '0');
      });

      panels.forEach((panel) => {
        const isActive = shouldOpen && panel.dataset.modelPanel === family;
        panel.hidden = !isActive;
        panel.classList.toggle('is-active', isActive);
      });

      selector.dataset.activeFamily = shouldOpen ? family : '';
    };

    const initModelTabs = (scope = document) => {
      scope.querySelectorAll('[data-model-tabs]').forEach((selector) => {
        if (initializedModelTabs.has(selector)) {
          return;
        }

        const section = selector.closest('[data-main-product-section]');
        const productHandle = section?.dataset.productHandle || 'product';
        const tabs = Array.from(selector.querySelectorAll('[data-model-tab]'));
        const panels = Array.from(selector.querySelectorAll('[data-model-panel]'));

        if (!tabs.length || !panels.length) {
          return;
        }

        const setActiveFamily = (family) => {
          applyModelFamilyState(selector, family);
          activeModelFamilies.set(productHandle, family || '');
        };

        const clearActiveFamily = () => {
          applyModelFamilyState(selector, '');
          activeModelFamilies.delete(productHandle);
        };

        tabs.forEach((tab, index) => {
          tab.addEventListener('click', () => {
            if (selector.dataset.activeFamily === tab.dataset.modelTab) {
              clearActiveFamily();
              return;
            }

            setActiveFamily(tab.dataset.modelTab);
          });

          tab.addEventListener('keydown', (event) => {
            if (
              event.key !== 'ArrowRight' &&
              event.key !== 'ArrowLeft' &&
              event.key !== 'Home' &&
              event.key !== 'End'
            ) {
              return;
            }

            event.preventDefault();

            let nextIndex = index;

            if (event.key === 'ArrowRight') {
              nextIndex = (index + 1) % tabs.length;
            } else if (event.key === 'ArrowLeft') {
              nextIndex = (index - 1 + tabs.length) % tabs.length;
            } else if (event.key === 'Home') {
              nextIndex = 0;
            } else if (event.key === 'End') {
              nextIndex = tabs.length - 1;
            }

            tabs[nextIndex].focus();
            setActiveFamily(tabs[nextIndex].dataset.modelTab);
          });
        });

        const selectedModelLink = selector.querySelector('[data-variant-link][aria-current="true"]');
        const selectedPanel = selectedModelLink?.closest('[data-model-panel]');
        const selectedFamily = selectedPanel?.dataset.modelPanel || '';
        const storedFamily = activeModelFamilies.get(productHandle) || selectedFamily;

        if (storedFamily && tabs.some((tab) => tab.dataset.modelTab === storedFamily)) {
          setActiveFamily(storedFamily);
        } else {
          clearActiveFamily();
        }

        initializedModelTabs.add(selector);
      });
    };

    const initGallery = (gallery) => {
      if (!gallery || gallery.dataset.initialized === 'true') {
        return;
      }

      gallery.classList.add('is-initializing');

      const track = gallery.querySelector('[data-gallery-track]');
      const slides = Array.from(gallery.querySelectorAll('[data-gallery-slide]'));
      const dots = Array.from(gallery.querySelectorAll('[data-gallery-dot]'));
      const previousButton = gallery.querySelector('[data-gallery-prev]');
      const nextButton = gallery.querySelector('[data-gallery-next]');

      if (!track || !slides.length) {
        gallery.dataset.initialized = 'true';
        return;
      }

      let activeIndex = slides.findIndex((slide) => slide.classList.contains('is-active'));

      if (activeIndex < 0) {
        activeIndex = 0;
      }

      const jumpToSlide = (index) => {
        const previousScrollBehavior = track.style.scrollBehavior;

        track.style.scrollBehavior = 'auto';
        track.scrollLeft = slides[index].offsetLeft;
        track.style.scrollBehavior = previousScrollBehavior;
      };

      const getSlideIndexByMediaId = (mediaId) => {
        if (!mediaId) {
          return -1;
        }

        return slides.findIndex((slide) => slide.dataset.mediaId === String(mediaId));
      };

      const setActiveSlide = (index, shouldScroll = false) => {
        activeIndex = Math.max(0, Math.min(index, slides.length - 1));

        slides.forEach((slide, slideIndex) => {
          const isActive = slideIndex === activeIndex;
          slide.classList.toggle('is-active', isActive);
          slide.setAttribute('aria-hidden', isActive ? 'false' : 'true');
        });

        dots.forEach((dot, dotIndex) => {
          const isActive = dotIndex === activeIndex;
          dot.classList.toggle('is-active', isActive);
          dot.setAttribute('aria-current', isActive ? 'true' : 'false');
        });

        if (previousButton) {
          previousButton.classList.toggle('is-visible', activeIndex > 0);
          previousButton.disabled = activeIndex === 0;
        }

        if (nextButton) {
          nextButton.classList.toggle('is-visible', activeIndex < slides.length - 1);
          nextButton.disabled = activeIndex >= slides.length - 1;
        }

        if (shouldScroll) {
          track.scrollTo({
            left: slides[activeIndex].offsetLeft,
            behavior: 'smooth',
          });
        }
      };

      const goToMediaId = (mediaId, behavior = 'smooth') => {
        const nextIndex = getSlideIndexByMediaId(mediaId);

        if (nextIndex < 0) {
          return false;
        }

        setActiveSlide(nextIndex);

        if (behavior === 'instant') {
          jumpToSlide(nextIndex);
        } else {
          track.scrollTo({
            left: slides[nextIndex].offsetLeft,
            behavior,
          });
        }

        return true;
      };

      const waitForMediaId = (mediaId, timeout = 520) =>
        new Promise((resolve) => {
          const nextIndex = getSlideIndexByMediaId(mediaId);

          if (nextIndex < 0) {
            resolve(false);
            return;
          }

          const targetLeft = slides[nextIndex].offsetLeft;
          const isSettled = () => Math.abs(track.scrollLeft - targetLeft) <= 2;

          if (isSettled()) {
            resolve(true);
            return;
          }

          let frameId = 0;
          const startedAt = window.performance.now();

          const check = () => {
            if (isSettled()) {
              resolve(true);
              return;
            }

            if (window.performance.now() - startedAt >= timeout) {
              resolve(false);
              return;
            }

            frameId = window.requestAnimationFrame(check);
          };

          frameId = window.requestAnimationFrame(check);

          track.addEventListener(
            'pointerdown',
            () => {
              window.cancelAnimationFrame(frameId);
              resolve(false);
            },
            { once: true }
          );
        });

      const updateActiveSlideFromScroll = () => {
        const nextIndex = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));

        if (nextIndex !== activeIndex) {
          setActiveSlide(nextIndex);
        }
      };

      previousButton?.addEventListener('click', () => setActiveSlide(activeIndex - 1, true));
      nextButton?.addEventListener('click', () => setActiveSlide(activeIndex + 1, true));

      dots.forEach((dot) => {
        dot.addEventListener('click', () => {
          const nextIndex = Number.parseInt(dot.dataset.galleryIndex, 10);

          if (!Number.isNaN(nextIndex)) {
            setActiveSlide(nextIndex, true);
          }
        });
      });

      track.addEventListener('scroll', updateActiveSlideFromScroll, { passive: true });

      setActiveSlide(activeIndex);
      jumpToSlide(activeIndex);
      gallery.noxrevGallery = {
        goToMediaId,
        waitForMediaId,
        getActiveMediaId: () => slides[activeIndex]?.dataset.mediaId || '',
      };
      gallery.dataset.initialized = 'true';

      requestAnimationFrame(() => {
        gallery.classList.remove('is-initializing');
      });
    };

    const initQuantityControls = (scope = document) => {
      scope.querySelectorAll('[data-quantity-control]').forEach((control) => {
        if (control.dataset.initialized === 'true') {
          return;
        }

        const input = control.querySelector('.main-product__quantity-input');
        const decrease = control.querySelector('[data-quantity-decrease]');
        const increase = control.querySelector('[data-quantity-increase]');

        if (!input || !decrease || !increase) {
          return;
        }

        const updateQuantity = (delta) => {
          const currentValue = Number.parseInt(input.value, 10);
          const nextValue = Number.isNaN(currentValue) ? 1 : Math.max(1, currentValue + delta);
          input.value = String(nextValue);
          input.dispatchEvent(new Event('change', { bubbles: true }));
        };

        decrease.addEventListener('click', () => updateQuantity(-1));
        increase.addEventListener('click', () => updateQuantity(1));
        control.dataset.initialized = 'true';
      });
    };

    const initAllGalleries = () => {
      document.querySelectorAll('[data-product-gallery]').forEach(initGallery);
    };

    const initGalleriesInScope = (scope = document) => {
      scope.querySelectorAll('[data-product-gallery]').forEach(initGallery);
    };

    const initMainProductBehaviors = (scope = document) => {
      initGalleriesInScope(scope);
      initModelTabs(scope);
      initQuantityControls(scope);
    };

    const getCurrentGallery = (section) => section?.querySelector('[data-product-gallery]');

    const moveGalleryToVariantMedia = (section, mediaId, behavior = 'smooth') => {
      const gallery = getCurrentGallery(section);

      if (!gallery) {
        return false;
      }

      if (gallery.noxrevGallery?.goToMediaId(mediaId, behavior)) {
        return true;
      }

      const targetSlide = gallery.querySelector(`[data-gallery-slide][data-media-id="${mediaId}"]`);
      const slides = Array.from(gallery.querySelectorAll('[data-gallery-slide]'));
      const index = slides.indexOf(targetSlide);

      if (index < 0) {
        return false;
      }

      targetSlide.scrollIntoView({
        behavior,
        block: 'nearest',
        inline: 'start',
      });

      return true;
    };

    const replaceVariantFragments = (currentSection, nextSection, preferredMediaId = '') => {
      FRAGMENT_SELECTORS.forEach((selector) => {
        const currentFragment = currentSection.querySelector(selector);
        const nextFragment = nextSection.querySelector(selector);

        if (currentFragment && nextFragment) {
          const nextFragmentClone = nextFragment.cloneNode(true);

          if (selector === '[data-product-options-region]') {
            const productHandle = currentSection.dataset.productHandle || 'product';
            const storedFamily = activeModelFamilies.get(productHandle) || '';
            applyModelFamilyState(nextFragmentClone.querySelector('[data-model-tabs]'), storedFamily);
          }

          currentFragment.replaceWith(nextFragmentClone);
        }
      });

      if (preferredMediaId) {
        const nextGallery = getCurrentGallery(currentSection);
        initGallery(nextGallery);
        moveGalleryToVariantMedia(currentSection, preferredMediaId, 'instant');
      }
    };

    const clearPendingVariantState = (section) => {
      if (!section) {
        return;
      }

      section.querySelectorAll(`.${PENDING_CLASS}, .${OPTIMISTIC_CLASS}, .${DESELECTING_CLASS}`).forEach((element) => {
        element.classList.remove(PENDING_CLASS, OPTIMISTIC_CLASS, DESELECTING_CLASS);
      });
    };

    const applyPendingVariantState = (trigger) => {
      const optionGroup = trigger.closest('.main-product__option');

      if (optionGroup) {
        optionGroup.querySelectorAll('[data-variant-link]').forEach((link) => {
          link.classList.remove(PENDING_CLASS, OPTIMISTIC_CLASS, DESELECTING_CLASS);
        });

        optionGroup.querySelectorAll('[data-variant-link][aria-current="true"]').forEach((link) => {
          if (link !== trigger) {
            link.classList.add(DESELECTING_CLASS);
          }
        });
      }

      trigger.classList.add(PENDING_CLASS, OPTIMISTIC_CLASS);
    };

    const setTemporarySubmitLoadingState = (section) => {
      const submitButton = section.querySelector('[data-product-form-region] .main-product__submit');

      if (!submitButton) {
        return null;
      }

      const originalText = submitButton.textContent;
      const originalDisabled = submitButton.disabled;

      submitButton.disabled = true;
      submitButton.classList.add(SUBMIT_LOADING_CLASS);
      submitButton.textContent = 'Updating...';

      return {
        submitButton,
        originalText,
        originalDisabled,
      };
    };

    const restoreTemporarySubmitLoadingState = (loadingState) => {
      if (!loadingState?.submitButton?.isConnected) {
        return;
      }

      loadingState.submitButton.disabled = loadingState.originalDisabled;
      loadingState.submitButton.classList.remove(SUBMIT_LOADING_CLASS);
      loadingState.submitButton.textContent = loadingState.originalText;
    };

    const restoreVariantFocus = (section, trigger) => {
      if (!section || !trigger) {
        return;
      }

      const variantId = trigger.dataset.variantId;
      let nextFocusTarget = null;

      if (variantId) {
        nextFocusTarget = section.querySelector(`[data-variant-link][data-variant-id="${variantId}"]`);
      }

      if (!nextFocusTarget) {
        nextFocusTarget = section.querySelector('[data-product-options-region] [aria-current="true"]');
      }

      nextFocusTarget?.focus();
    };

    const handleVariantSelection = async (trigger) => {
      const currentSection = trigger.closest('[data-main-product-section]');

      if (!currentSection) {
        return;
      }

      const sectionId = currentSection.dataset.sectionId;

      if (!sectionId) {
        return;
      }

      if (variantRequestController) {
        variantRequestController.abort();
      }

      variantRequestController = new AbortController();
      variantRequestSequence += 1;
      const requestId = variantRequestSequence;

      const url = new URL(trigger.href, window.location.origin);
      url.searchParams.set('section_id', sectionId);
      const preferredMediaId = trigger.dataset.variantMediaId || '';

      applyPendingVariantState(trigger);
      moveGalleryToVariantMedia(currentSection, preferredMediaId, 'smooth');
      currentSection.setAttribute('aria-busy', 'true');
      const submitLoadingState = setTemporarySubmitLoadingState(currentSection);

      try {
        const response = await fetch(url.toString(), {
          signal: variantRequestController.signal,
          headers: {
            'X-Requested-With': 'XMLHttpRequest',
          },
        });

        if (!response.ok) {
          throw new Error(`Variant section request failed with status ${response.status}`);
        }

        const html = await response.text();

        if (requestId !== variantRequestSequence) {
          return;
        }

        const parser = new DOMParser();
        const nextDocument = parser.parseFromString(html, 'text/html');
        const nextSection = nextDocument.querySelector('[data-main-product-section]');

        if (!nextSection) {
          throw new Error('Updated product section markup was not found in the response');
        }

        if (preferredMediaId) {
          await getCurrentGallery(currentSection)?.noxrevGallery?.waitForMediaId(preferredMediaId);

          if (requestId !== variantRequestSequence) {
            return;
          }
        }

        replaceVariantFragments(currentSection, nextSection, preferredMediaId);
        initMainProductBehaviors(currentSection);
        history.replaceState({}, '', trigger.href);
        restoreVariantFocus(currentSection, trigger);
      } catch (error) {
        if (error.name === 'AbortError') {
          return;
        }

        if (requestId === variantRequestSequence) {
          clearPendingVariantState(currentSection);
          restoreTemporarySubmitLoadingState(submitLoadingState);
        }

        currentSection.removeAttribute('aria-busy');
        window.location.href = trigger.href;
      } finally {
        if (requestId === variantRequestSequence) {
          clearPendingVariantState(currentSection);
          currentSection.removeAttribute('aria-busy');
          variantRequestController = null;
        }
      }
    };

    const initVariantLinks = (scope = document) => {
      if (scope.dataset?.variantLinksReady === 'true') {
        return;
      }

      scope.addEventListener('click', (event) => {
        const trigger = event.target.closest('[data-variant-link]');

        if (!trigger) {
          return;
        }

        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }

        event.preventDefault();
        handleVariantSelection(trigger);
      });

      if (scope.dataset) {
        scope.dataset.variantLinksReady = 'true';
      }
    };

    const initPageEnhancements = () => {
      initAllGalleries();
      initMainProductBehaviors();
      document.querySelectorAll('[data-main-product-section]').forEach(initVariantLinks);
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initPageEnhancements);
    } else {
      initPageEnhancements();
    }

    document.addEventListener('shopify:section:load', (event) => {
      initGalleriesInScope(event.target);
      initMainProductBehaviors(event.target);
      event.target.querySelectorAll?.('[data-main-product-section]').forEach(initVariantLinks);
    });
  })();
