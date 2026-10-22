import { describeWithSpec } from 'utils/spec-lint/ipc';

let CodeMirror;
const SERVER_RENDERED = typeof window === 'undefined' || global['PREVENT_CODEMIRROR_RENDER'] === true;

const HOVER_DELAY_MS = 250;
const HIDE_DELAY_MS = 400;
// The card overlaps the key line by this much, so there is no strip between them that belongs to the next line.
const CARD_OVERLAP_PX = 2;
const CARD_EDGE_PX = 15;

/**
 * Builds the card for a described field. Everything coming from the spec is set through `textContent`,
 * so a description can never inject markup.
 */
export const renderFieldCard = (info) => {
  const card = document.createElement('div');
  card.className = 'spec-field-card';
  card.style.maxWidth = '480px';
  card.style.maxHeight = '320px';
  card.style.overflowY = 'auto';

  const path = document.createElement('div');
  path.className = 'spec-field-path';
  path.textContent = info.path;
  card.appendChild(path);

  const meta = document.createElement('div');
  meta.className = 'spec-field-meta';
  meta.textContent = `${info.type} · ${info.required ? 'required' : 'optional'}`;
  card.appendChild(meta);

  if (info.description) {
    const description = document.createElement('div');
    description.className = 'spec-field-description';
    description.style.whiteSpace = 'pre-wrap';
    description.textContent = info.description;
    card.appendChild(description);
  }

  return card;
};

const placeCard = (card, box) => {
  const cardBox = card.getBoundingClientRect();
  let top = box.bottom - CARD_OVERLAP_PX;
  if (top + cardBox.height > window.innerHeight - CARD_EDGE_PX && box.top + CARD_OVERLAP_PX - cardBox.height >= 0) {
    top = box.top + CARD_OVERLAP_PX - cardBox.height;
  }
  let left = box.left;
  if (left + cardBox.width > window.innerWidth - CARD_EDGE_PX) {
    left = window.innerWidth - cardBox.width - CARD_EDGE_PX;
  }
  card.style.top = `${Math.max(top, 0)}px`;
  card.style.left = `${Math.max(left, 0)}px`;
};

if (!SERVER_RENDERED) {
  CodeMirror = require('codemirror');

  CodeMirror.defineOption('specFieldInfo', false, function (cm, enabled, old) {
    if (old && old !== CodeMirror.Init) {
      teardown(cm);
    }
    if (enabled) {
      setup(cm);
    }
  });

  function setup(cm) {
    const wrapper = cm.getWrapperElement();
    const state = (cm.state.specFieldInfo = {
      hoverTimeout: undefined,
      hideTimeout: undefined,
      target: null,
      seq: 0,
      card: null,
      mark: null
    });

    const clearHideTimer = () => {
      clearTimeout(state.hideTimeout);
      state.hideTimeout = undefined;
    };

    const hideCard = () => {
      clearHideTimer();
      state.seq += 1;
      if (state.mark) {
        state.mark.clear();
        state.mark = null;
      }
      if (state.card) {
        state.card.element.removeEventListener('mouseover', onCardEnter);
        state.card.element.removeEventListener('mouseout', onLeave);
        state.card.element.remove();
        state.card = null;
      }
      document.removeEventListener('mousedown', onDocumentMouseDown, true);
    };

    const clearHoverTimer = () => {
      clearTimeout(state.hoverTimeout);
      state.hoverTimeout = undefined;
    };

    // Entering the card keeps it, and cancels a describe that was about to replace it.
    function onCardEnter() {
      clearHideTimer();
      clearHoverTimer();
    }

    const scheduleHide = () => {
      clearHideTimer();
      state.hideTimeout = setTimeout(hideCard, HIDE_DELAY_MS);
    };

    // A mouseout that stays inside the same element tree is not leaving.
    function onLeave(e) {
      const inside = (node) => node && (wrapper.contains(node) || (state.card && state.card.element.contains(node)));
      if (e.currentTarget === wrapper) {
        clearHoverTimer();
        if (!e.relatedTarget || !wrapper.contains(e.relatedTarget)) {
          state.target = null;
        }
      }
      if (inside(e.relatedTarget)) {
        return;
      }
      if (state.card) {
        scheduleHide();
      }
    }

    function onDocumentMouseDown(e) {
      if (state.card && !state.card.element.contains(e.target)) {
        hideCard();
      }
    }

    const showCard = (info, target) => {
      // A card for another key replaces the one that is still showing.
      hideCard();
      // Measure before marking: the mark re-renders the span.
      const box = target.getBoundingClientRect();
      const element = renderFieldCard(info);
      document.body.appendChild(element);
      element.addEventListener('mouseover', onCardEnter);
      element.addEventListener('mouseout', onLeave);
      document.addEventListener('mousedown', onDocumentMouseDown, true);
      state.card = { element, info };
      state.mark = cm.markText(cm.posFromIndex(info.from), cm.posFromIndex(info.to), { className: 'cm-spec-field-hover' });
      placeCard(element, box);
    };

    const describeAt = (target, clientX, clientY) => {
      const text = cm.getValue();
      const offset = cm.indexFromPos(cm.coordsChar({ left: clientX, top: clientY }));
      const seq = state.seq;
      describeWithSpec({ ...cm.specCtx, text, offset }).then((info) => {
        if (!info || seq !== state.seq || state.target !== target || !wrapper.isConnected || cm.getValue() !== text) {
          return;
        }
        showCard(info, target);
      }, () => {});
    };

    const onMouseOver = (e) => {
      const target = e.target;
      if (!cm.specCtx || !(target instanceof Element)) {
        return;
      }
      // Variables keep their own card.
      if (target.classList.contains('cm-variable-valid') || target.classList.contains('cm-variable-invalid')) {
        return;
      }
      // Marking the key re-renders its span, which fires a new mouseover on the same text: keep the card.
      if (state.card) {
        const offset = cm.indexFromPos(cm.coordsChar({ left: e.clientX, top: e.clientY }));
        if (offset >= state.card.info.from && offset <= state.card.info.to) {
          clearHideTimer();
          clearHoverTimer();
          state.target = target;
          return;
        }
      }
      clearHoverTimer();
      state.seq += 1;
      if (state.card) {
        // The pointer left the key: the card stays for a moment so the pointer can reach it, unless another key is described first.
        scheduleHide();
      }
      state.target = target;
      const { clientX, clientY } = e;
      state.hoverTimeout = setTimeout(() => {
        state.hoverTimeout = undefined;
        describeAt(target, clientX, clientY);
      }, HOVER_DELAY_MS);
    };

    wrapper.addEventListener('mouseover', onMouseOver);
    wrapper.addEventListener('mouseout', onLeave);
    const onScrollOrChange = () => {
      clearHoverTimer();
      hideCard();
    };
    cm.on('scroll', onScrollOrChange);
    cm.on('change', onScrollOrChange);

    state.dispose = () => {
      clearHoverTimer();
      hideCard();
      wrapper.removeEventListener('mouseover', onMouseOver);
      wrapper.removeEventListener('mouseout', onLeave);
      cm.off('scroll', onScrollOrChange);
      cm.off('change', onScrollOrChange);
    };
  }

  function teardown(cm) {
    const state = cm.state.specFieldInfo;
    if (state) {
      state.dispose();
      delete cm.state.specFieldInfo;
    }
  }
}
