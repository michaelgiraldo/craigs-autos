const CLEANUP_KEY = '__craigsBaseLayoutCleanup';

const focusElement = (element) => {
  try {
    element?.focus?.({ preventScroll: true });
  } catch {
    element?.focus?.();
  }
};

const createBodyScrollLock = (datasetKey) => {
  const scrollDatasetKey = `${datasetKey}ScrollY`;
  const isLocked = () => Object.hasOwn(document.body.dataset, scrollDatasetKey);

  return {
    lock() {
      if (isLocked()) {
        return;
      }
      const scrollY = window.scrollY || document.documentElement.scrollTop;
      document.body.dataset[scrollDatasetKey] = String(scrollY);
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.left = '0';
      document.body.style.right = '0';
      document.body.style.width = '100%';
    },
    unlock() {
      if (!isLocked()) {
        return;
      }
      const scrollY = parseInt(document.body.dataset[scrollDatasetKey] || '0', 10);
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      document.body.style.width = '';
      delete document.body.dataset[scrollDatasetKey];
      window.scrollTo(0, scrollY);
    },
  };
};

const initLanguageSwitcherPanel = () => {
  const toggles = Array.from(document.querySelectorAll('[data-lang-switcher-toggle]'));
  const overlay = document.querySelector('[data-lang-switcher-overlay]');
  const panel = overlay?.querySelector('[data-lang-switcher-panel]');
  const input = overlay?.querySelector('[data-lang-switcher-search]');
  const items = Array.from(overlay?.querySelectorAll('[data-lang-switcher-item]') ?? []);
  const closeButton = overlay?.querySelector('[data-lang-switcher-close]');

  document.documentElement.classList.add('lang-switcher--js');

  if (!overlay || !panel || toggles.length === 0) {
    return null;
  }

  const { lock, unlock } = createBodyScrollLock('langSwitcher');
  const isMobile = () => window.matchMedia('(max-width: 859px)').matches;
  let activeToggle = null;

  const applyFilter = () => {
    if (!input) {
      return;
    }
    const query = input.value.trim().toLowerCase();
    items.forEach((item) => {
      const search = (item.dataset.search || '').toLowerCase();
      item.hidden = query.length > 0 && !search.includes(query);
    });
  };

  const setToggleState = (toggle) => {
    toggles.forEach((button) => {
      button.setAttribute('aria-expanded', button === toggle ? 'true' : 'false');
    });
  };

  const setOverlayPosition = (toggle) => {
    if (!toggle) {
      return;
    }
    if (isMobile()) {
      overlay.style.removeProperty('--lang-switcher-top');
      overlay.style.removeProperty('--lang-switcher-right');
      return;
    }
    const rect = toggle.getBoundingClientRect();
    const top = Math.round(rect.bottom + 8);
    const right = Math.max(12, Math.round(window.innerWidth - rect.right));
    overlay.style.setProperty('--lang-switcher-top', `${top}px`);
    overlay.style.setProperty('--lang-switcher-right', `${right}px`);
  };

  const openPanel = (toggle) => {
    activeToggle = toggle;
    setOverlayPosition(toggle);
    overlay.hidden = false;
    setToggleState(toggle);
    if (isMobile()) {
      lock();
    }
    if (input) {
      input.value = '';
      applyFilter();
      focusElement(input);
      return;
    }
    focusElement(panel);
  };

  const closePanel = ({ restoreFocus = true } = {}) => {
    overlay.hidden = true;
    setToggleState(null);
    unlock();
    if (restoreFocus) {
      focusElement(activeToggle);
    }
    activeToggle = null;
  };

  const onToggleClick = (event) => {
    const toggle = event.currentTarget;
    if (overlay.hidden) {
      openPanel(toggle);
      return;
    }
    if (activeToggle === toggle) {
      closePanel();
      return;
    }
    openPanel(toggle);
  };

  const onResize = () => {
    if (activeToggle) {
      setOverlayPosition(activeToggle);
    }
  };

  const onDocumentKeydown = (event) => {
    if (event.key === 'Escape' && !overlay.hidden) {
      event.preventDefault();
      closePanel();
    }
  };

  const onOverlayClick = (event) => {
    if (event.target === overlay) {
      closePanel();
    }
  };

  const onItemClick = () => {
    closePanel({ restoreFocus: false });
  };

  toggles.forEach((toggle) => {
    toggle.addEventListener('click', onToggleClick);
  });
  window.addEventListener('resize', onResize);
  document.addEventListener('keydown', onDocumentKeydown);
  overlay.addEventListener('click', onOverlayClick);
  input?.addEventListener('input', applyFilter);
  closeButton?.addEventListener('click', closePanel);
  items.forEach((item) => {
    item.querySelector('a')?.addEventListener('click', onItemClick);
  });

  return () => {
    closePanel({ restoreFocus: false });
    toggles.forEach((toggle) => {
      toggle.removeEventListener('click', onToggleClick);
    });
    window.removeEventListener('resize', onResize);
    document.removeEventListener('keydown', onDocumentKeydown);
    overlay.removeEventListener('click', onOverlayClick);
    input?.removeEventListener('input', applyFilter);
    closeButton?.removeEventListener('click', closePanel);
    items.forEach((item) => {
      item.querySelector('a')?.removeEventListener('click', onItemClick);
    });
  };
};

const initSiteMenu = () => {
  const toggle = document.querySelector('[data-site-menu-toggle]');
  const overlay = document.querySelector('[data-site-menu-overlay]');
  const panel = overlay?.querySelector('[data-site-menu-panel]');
  const closeButton = overlay?.querySelector('[data-site-menu-close]');
  const links = Array.from(overlay?.querySelectorAll('[data-site-menu-link]') ?? []);

  document.documentElement.classList.add('site-menu--js');

  if (!toggle || !overlay || !panel || !closeButton) {
    return null;
  }

  const { lock, unlock } = createBodyScrollLock('siteMenu');

  const openMenu = () => {
    overlay.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    lock();
    focusElement(panel);
  };

  const closeMenu = ({ restoreFocus = true } = {}) => {
    overlay.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    unlock();
    if (restoreFocus) {
      focusElement(toggle);
    }
  };

  const onToggleClick = () => {
    if (overlay.hidden) {
      openMenu();
      return;
    }
    closeMenu();
  };

  const onDocumentKeydown = (event) => {
    if (event.key === 'Escape' && !overlay.hidden) {
      event.preventDefault();
      closeMenu();
    }
  };

  const onLinkClick = () => {
    closeMenu({ restoreFocus: false });
  };

  toggle.addEventListener('click', onToggleClick);
  closeButton.addEventListener('click', closeMenu);
  document.addEventListener('keydown', onDocumentKeydown);
  links.forEach((link) => {
    link.addEventListener('click', onLinkClick);
  });

  return () => {
    closeMenu({ restoreFocus: false });
    toggle.removeEventListener('click', onToggleClick);
    closeButton.removeEventListener('click', closeMenu);
    document.removeEventListener('keydown', onDocumentKeydown);
    links.forEach((link) => {
      link.removeEventListener('click', onLinkClick);
    });
  };
};

const initNavPanels = () => {
  const panels = Array.from(document.querySelectorAll('[data-nav-panel]'));
  if (panels.length === 0) {
    return null;
  }

  const closeAll = (except = null) => {
    panels.forEach((panel) => {
      if (panel !== except) {
        panel.removeAttribute('open');
      }
    });
  };

  const onPanelToggle = (event) => {
    const panel = event.currentTarget;
    if (panel.open) {
      closeAll(panel);
    }
  };

  const onDocumentClick = (event) => {
    if (!panels.some((panel) => panel.contains(event.target))) {
      closeAll();
    }
  };

  const onDocumentKeydown = (event) => {
    if (event.key === 'Escape') {
      closeAll();
    }
  };

  panels.forEach((panel) => {
    panel.addEventListener('toggle', onPanelToggle);
  });
  document.addEventListener('click', onDocumentClick);
  document.addEventListener('keydown', onDocumentKeydown);

  return () => {
    closeAll();
    panels.forEach((panel) => {
      panel.removeEventListener('toggle', onPanelToggle);
    });
    document.removeEventListener('click', onDocumentClick);
    document.removeEventListener('keydown', onDocumentKeydown);
  };
};

const initDefaultMailtoLinks = () => {
  const defaultMailtoHref = document.body.dataset.defaultMailtoHref;
  const defaultMailtoAddress = document.body.dataset.defaultMailtoAddress;
  if (!defaultMailtoHref || !defaultMailtoAddress) {
    return null;
  }

  const links = Array.from(
    document.querySelectorAll(`a[href="mailto:${CSS.escape(defaultMailtoAddress)}"]`),
  );
  links.forEach((link) => {
    link.setAttribute('href', defaultMailtoHref);
  });

  return null;
};

export const initBaseLayoutBehaviors = () => {
  if (typeof window === 'undefined') {
    return;
  }

  const previousCleanup = window[CLEANUP_KEY];
  if (typeof previousCleanup === 'function') {
    previousCleanup();
  }

  const cleanups = [
    initLanguageSwitcherPanel(),
    initSiteMenu(),
    initNavPanels(),
    initDefaultMailtoLinks(),
  ].filter(Boolean);

  window[CLEANUP_KEY] = () => {
    cleanups.forEach((cleanup) => {
      cleanup();
    });
    delete window[CLEANUP_KEY];
  };
};
