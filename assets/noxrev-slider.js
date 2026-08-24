(() => {
  const readyAttribute = 'noxrevSliderReady';

  const getNumber = (value) => {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const initSlider = (sliderRoot) => {
    if (sliderRoot.dataset[readyAttribute] === 'true') return;
    sliderRoot.dataset[readyAttribute] = 'true';

    const track = sliderRoot.querySelector('[data-noxrev-slider-track]');
    const prev = sliderRoot.querySelector('[data-noxrev-slider-prev]');
    const next = sliderRoot.querySelector('[data-noxrev-slider-next]');
    if (!track || !prev || !next) return;

    const getStep = () => {
      const cardSelector = sliderRoot.dataset.noxrevSliderStepCard;
      const card = cardSelector ? track.querySelector(cardSelector) : track.firstElementChild;

      if (!card) {
        return track.clientWidth * 0.82;
      }

      const styles = window.getComputedStyle(track);
      const gap = getNumber(styles.columnGap || styles.gap);
      return card.getBoundingClientRect().width + gap;
    };

    const updateButtons = () => {
      const maxScroll = track.scrollWidth - track.clientWidth;
      const hasOverflow = maxScroll > 2;
      prev.hidden = !hasOverflow || track.scrollLeft <= 2;
      next.hidden = !hasOverflow || track.scrollLeft >= maxScroll - 2;
    };

    const scrollByDirection = (direction) => {
      const maxScroll = track.scrollWidth - track.clientWidth;
      const target = Math.max(0, Math.min(maxScroll, track.scrollLeft + getStep() * direction));
      track.scrollTo({ left: target, behavior: 'smooth' });
      window.setTimeout(updateButtons, 260);
    };

    prev.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      scrollByDirection(-1);
    });

    next.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      scrollByDirection(1);
    });

    track.addEventListener('scroll', updateButtons, { passive: true });
    window.addEventListener('resize', updateButtons);
    updateButtons();
  };

  const initSliders = (root = document) => {
    root.querySelectorAll('[data-noxrev-slider]').forEach(initSlider);
  };

  initSliders();
  document.addEventListener('shopify:section:load', (event) => initSliders(event.target));
})();
