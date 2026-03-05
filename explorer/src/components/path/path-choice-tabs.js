import { initYellowBrickRoad } from './effects/yellow-brick-road.js';

function isSupportedChoiceRowDrop(value) {
  if (!value) {
    return false;
  }

  const candidate = value.trim();
  if (!candidate) {
    return false;
  }

  return CSS.supports('transform', `translateY(${candidate})`);
}

function parsePanelChoice(panel, index) {
  if (panel.dataset.choice) {
    return panel.dataset.choice;
  }

  const classChoice = Array.from(panel.classList)
    .find((className) => className.startsWith('panel-') && className !== 'panel')
    ?.slice('panel-'.length);

  if (classChoice) {
    return classChoice;
  }

  return `option-${index + 1}`;
}

function applyQueryFeatureFlags(root) {
  const params = new URLSearchParams(window.location.search);

  const choiceRowDropOverride = params.get('choiceRowDrop');
  if (isSupportedChoiceRowDrop(choiceRowDropOverride)) {
    document.documentElement.style.setProperty('--choice-row-drop', choiceRowDropOverride.trim());
  }

  const kitsPaletteOverride = (params.get('kitsPalette') || '').trim().toLowerCase();
  root.classList.remove('ff-kits-purple', 'ff-kits-gold');
  if (kitsPaletteOverride === 'purple') {
    root.classList.add('ff-kits-purple');
  } else if (kitsPaletteOverride === 'gold') {
    root.classList.add('ff-kits-gold');
  }
}

function loadBackgroundPanels(root, panelFrames) {
  if (!panelFrames.length) {
    root.classList.remove('is-preload');
    return;
  }

  root.classList.add('is-preload');
  let loadedCount = 0;

  const onFrameDone = (frame) => {
    frame.classList.add('is-ready');
    loadedCount += 1;
    if (loadedCount === panelFrames.length) {
      root.classList.remove('is-preload');
    }
  };

  panelFrames.forEach((frame, index) => {
    frame.addEventListener('load', () => onFrameDone(frame), { once: true });
    frame.addEventListener('error', () => onFrameDone(frame), { once: true });

    const src = frame.dataset.src;
    const delayMs = 80 + (index * 90);
    window.setTimeout(() => {
      if (!src || frame.src) {
        onFrameDone(frame);
        return;
      }
      frame.src = src;
    }, delayMs);
  });
}

export function initPathChoiceTabs(options = {}) {
  const {
    rootSelector = '#chooserRoot',
    minOptions = 2,
    maxOptions = 5,
  } = options;

  const root = document.querySelector(rootSelector);
  if (!root) {
    return;
  }

  const pills = Array.from(root.querySelectorAll('.pill[data-choice]'));
  const panelsContainer = root.querySelector('.panels');
  const panels = Array.from(root.querySelectorAll('.panel'));
  const panelFrames = Array.from(root.querySelectorAll('.panel iframe[data-src]'));

  if (!pills.length || !panelsContainer) {
    return;
  }

  const pillChoices = pills.map((pill) => pill.dataset.choice).filter(Boolean);
  const choiceCount = pillChoices.length;
  const boundedOptionCount = Math.max(minOptions, Math.min(maxOptions, choiceCount));
  document.documentElement.style.setProperty('--option-count', String(boundedOptionCount));

  const panelChoiceByIndex = panels.map((panel, index) => parsePanelChoice(panel, index));
  let selected = null;

  const yellowBrickRoad = initYellowBrickRoad({
    root,
    anchorSelector: '.pill--kits',
  });

  const setPanelsLayout = () => {
    if (!selected) {
      panelsContainer.style.gridTemplateColumns = `repeat(${choiceCount}, minmax(0, 1fr))`;
      panels.forEach((panel) => {
        panel.classList.remove('is-hidden');
        panel.removeAttribute('aria-hidden');
      });
      return;
    }

    const columns = panelChoiceByIndex.map((panelChoice) => (panelChoice === selected ? '1fr' : '0fr')).join(' ');
    panelsContainer.style.gridTemplateColumns = columns;

    panels.forEach((panel, index) => {
      const shouldHide = panelChoiceByIndex[index] !== selected;
      panel.classList.toggle('is-hidden', shouldHide);
      if (shouldHide) {
        panel.setAttribute('aria-hidden', 'true');
      } else {
        panel.removeAttribute('aria-hidden');
      }
    });
  };

  const setActivePill = (choice) => {
    for (const pill of pills) {
      const isActive = pill.dataset.choice === choice;
      pill.classList.toggle('is-active', isActive);
      pill.setAttribute('aria-selected', String(isActive));
      pill.setAttribute('tabindex', isActive ? '0' : '-1');
    }
  };

  const clearChoice = () => {
    if (!selected) {
      return;
    }
    root.classList.remove('is-selected');
    selected = null;
    setActivePill(null);
    setPanelsLayout();
  };

  const choose = (choice) => {
    if (!choice || !pillChoices.includes(choice)) {
      return;
    }

    if (selected === choice) {
      clearChoice();
      return;
    }

    selected = choice;
    root.classList.add('is-selected');
    setActivePill(choice);
    setPanelsLayout();
  };

  pills.forEach((pill) => {
    pill.addEventListener('click', () => choose(pill.dataset.choice));
  });

  applyQueryFeatureFlags(root);

  const bootPanels = () => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        yellowBrickRoad.scheduleRender();
        loadBackgroundPanels(root, panelFrames);
        setPanelsLayout();
      });
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootPanels, { once: true });
  } else {
    bootPanels();
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window.parent) {
      return;
    }

    const data = event.data;
    if (!data || data.type !== 'MGX_SECTION_SHORTCUT') {
      return;
    }

    const payload = data.payload ?? {};
    if (payload.navId !== 'build' || payload.command !== 'choose') {
      return;
    }

    const choice = payload.choice;
    choose(choice);
  });
}

initPathChoiceTabs();
