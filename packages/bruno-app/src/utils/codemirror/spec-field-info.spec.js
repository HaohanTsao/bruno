import CodeMirror from 'codemirror';
import { describeWithSpec } from 'utils/spec-lint/ipc';
import { renderFieldCard } from './spec-field-info';

jest.mock('utils/spec-lint/ipc', () => ({ describeWithSpec: jest.fn() }));

// The real codemirror needs a few layout APIs jsdom does not have.
document.createRange = () => ({
  setStart() {},
  setEnd() {},
  getBoundingClientRect: () => ({ right: 0, left: 0, top: 0, bottom: 0 }),
  getClientRects: () => ({ length: 0, item: () => null })
});

it('renders path, type, required and description as text', () => {
  const el = renderFieldCard({ from: 0, to: 6, path: 'limit.limit-type', type: 'integer', required: true, description: 'Allowed Values: 1:Credit Limit; 9:Overdraft Limit' });
  expect(el.textContent).toContain('limit.limit-type');
  expect(el.textContent).toContain('integer');
  expect(el.textContent).toContain('required');
  expect(el.textContent).toContain('Allowed Values: 1:Credit Limit; 9:Overdraft Limit');
});

it('shows optional for a field that is not required', () => {
  const el = renderFieldCard({ from: 0, to: 1, path: 'a', type: 'string', required: false, description: '' });
  expect(el.textContent).toContain('optional');
  expect(el.textContent).not.toContain('required');
});

it('never interprets the description as HTML', () => {
  const el = renderFieldCard({ from: 0, to: 1, path: 'a', type: 'string', required: false, description: '<img src=x onerror=alert(1)>' });
  expect(el.querySelector('img')).toBeNull();
  expect(el.textContent).toContain('<img src=x onerror=alert(1)>');
});

it('keeps very long descriptions whole and scrollable', () => {
  const long = 'Allowed Values: ' + Array.from({ length: 5000 }, (_, i) => `${i}:Code ${i}`).join('; ');
  const el = renderFieldCard({ from: 0, to: 1, path: 'a', type: 'integer', required: false, description: long });
  expect(el.textContent).toContain('4999:Code 4999');
  expect(el.style.maxHeight).toBe('320px');
  expect(el.style.overflowY).toBe('auto');
});

it('omits the description block when empty', () => {
  const el = renderFieldCard({ from: 0, to: 1, path: 'a', type: 'any', required: false, description: '' });
  expect(el.querySelector('.spec-field-description')).toBeNull();
});

describe('hover', () => {
  const specCtx = { collectionPath: '/c', specPath: 's.yaml', method: 'POST', path: '/v3/limit' };
  const info = { from: 1, to: 7, path: 'role', type: 'string', required: true, description: 'R' };
  let host;
  let cm;

  const flush = async () => {
    for (let i = 0; i < 5; i++) {
      await Promise.resolve();
    }
  };

  const makeEditor = () => {
    cm = CodeMirror(host, { value: '{"role":"x"}', specFieldInfo: true });
    cm.specCtx = specCtx;
    cm.coordsChar = jest.fn(() => ({ line: 0, ch: 2 }));
    return cm;
  };

  const hover = async () => {
    const target = cm.getWrapperElement().querySelector('.CodeMirror-line span') || cm.getWrapperElement();
    target.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: 5, clientY: 5 }));
    jest.advanceTimersByTime(300);
    await flush();
  };

  beforeEach(() => {
    jest.useFakeTimers();
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  afterEach(() => {
    cm.setOption('specFieldInfo', false);
    host.remove();
    jest.useRealTimers();
  });

  it('shows a card for a key and turning the option off removes it', async () => {
    describeWithSpec.mockResolvedValue(info);
    makeEditor();
    await hover();

    expect(describeWithSpec).toHaveBeenCalledWith({ ...specCtx, text: '{"role":"x"}', offset: 2 });
    expect(document.querySelector('.spec-field-card')).not.toBeNull();
    // jsdom has no layout, so CodeMirror renders no line DOM; check the mark itself.
    expect(cm.getAllMarks().map((m) => m.className)).toEqual(['cm-spec-field-hover']);
    const { from, to } = cm.getAllMarks()[0].find();
    expect([from.line, from.ch, to.line, to.ch]).toEqual([0, 1, 0, 7]);

    cm.setOption('specFieldInfo', false);
    expect(document.querySelector('.spec-field-card')).toBeNull();
    expect(cm.getAllMarks()).toHaveLength(0);
  });

  it('stays open while the pointer is over the card', async () => {
    describeWithSpec.mockResolvedValue(info);
    makeEditor();
    await hover();
    const card = document.querySelector('.spec-field-card');

    cm.getWrapperElement().dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
    card.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    jest.advanceTimersByTime(1000);
    expect(document.querySelector('.spec-field-card')).not.toBeNull();

    card.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
    jest.advanceTimersByTime(500);
    expect(document.querySelector('.spec-field-card')).toBeNull();
    expect(cm.getAllMarks()).toHaveLength(0);
  });

  it('hides when the editor scrolls and on a mousedown outside the card', async () => {
    describeWithSpec.mockResolvedValue(info);
    makeEditor();
    await hover();
    CodeMirror.signal(cm, 'scroll', cm);
    expect(document.querySelector('.spec-field-card')).toBeNull();

    await hover();
    const card = document.querySelector('.spec-field-card');
    card.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(document.querySelector('.spec-field-card')).not.toBeNull();
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(document.querySelector('.spec-field-card')).toBeNull();
  });

  it('shows nothing when describeWithSpec resolves null', async () => {
    describeWithSpec.mockResolvedValue(null);
    makeEditor();
    await hover();
    expect(document.querySelector('.spec-field-card')).toBeNull();
  });

  it('shows nothing without a specCtx', async () => {
    describeWithSpec.mockResolvedValue(info);
    makeEditor();
    cm.specCtx = undefined;
    await hover();
    expect(describeWithSpec).not.toHaveBeenCalled();
    expect(document.querySelector('.spec-field-card')).toBeNull();
  });

  it('ignores a result that arrives after the pointer left the editor', async () => {
    let resolve;
    describeWithSpec.mockReturnValue(new Promise((r) => (resolve = r)));
    makeEditor();
    await hover();
    cm.getWrapperElement().dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
    resolve(info);
    await flush();
    expect(document.querySelector('.spec-field-card')).toBeNull();
  });

  const mouseOverNextLine = () => {
    const wrapper = cm.getWrapperElement();
    cm.coordsChar = jest.fn(() => ({ line: 0, ch: 10 }));
    wrapper.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: 5, clientY: 20 }));
  };

  it('keeps the card while the pointer crosses the next line on its way to the card (editor-integration F2)', async () => {
    describeWithSpec.mockResolvedValue(info);
    makeEditor();
    await hover();
    const card = document.querySelector('.spec-field-card');

    mouseOverNextLine();
    jest.advanceTimersByTime(100);
    expect(document.querySelector('.spec-field-card')).not.toBeNull();

    card.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    jest.advanceTimersByTime(1000);
    await flush();
    expect(document.querySelector('.spec-field-card')).toBe(card);
    expect(describeWithSpec).toHaveBeenCalledTimes(1);
  });

  it('hides the card 400 ms after the pointer left the key for another line', async () => {
    describeWithSpec.mockResolvedValue(null);
    makeEditor();
    describeWithSpec.mockResolvedValueOnce(info);
    await hover();
    expect(document.querySelector('.spec-field-card')).not.toBeNull();

    mouseOverNextLine();
    jest.advanceTimersByTime(399);
    expect(document.querySelector('.spec-field-card')).not.toBeNull();
    jest.advanceTimersByTime(2);
    expect(document.querySelector('.spec-field-card')).toBeNull();
  });

  it('replaces the card when the pointer rests on a different described key', async () => {
    makeEditor();
    describeWithSpec.mockResolvedValueOnce(info);
    await hover();
    describeWithSpec.mockResolvedValueOnce({ from: 10, to: 14, path: 'other', type: 'string', required: false, description: '' });
    mouseOverNextLine();
    jest.advanceTimersByTime(300);
    await flush();
    const cards = document.querySelectorAll('.spec-field-card');
    expect(cards).toHaveLength(1);
    expect(cards[0].textContent).toContain('other');
    jest.advanceTimersByTime(1000);
    expect(document.querySelectorAll('.spec-field-card')).toHaveLength(1);
  });

  it('opens the card 2 px over the key, with no gap (editor-integration F2)', async () => {
    describeWithSpec.mockResolvedValue(info);
    makeEditor();
    const spy = jest.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ top: 80, bottom: 100, left: 10, right: 50, width: 40, height: 0 });
    await hover();
    spy.mockRestore();
    expect(document.querySelector('.spec-field-card').style.top).toBe('98px');
  });

  it('scrolling clears a pending hover so no card appears for stale coordinates (packaging-readiness F5)', async () => {
    describeWithSpec.mockResolvedValue(info);
    makeEditor();
    cm.getWrapperElement().dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: 5, clientY: 5 }));
    jest.advanceTimersByTime(100);
    CodeMirror.signal(cm, 'scroll', cm);
    jest.advanceTimersByTime(500);
    await flush();
    expect(describeWithSpec).not.toHaveBeenCalled();
    expect(document.querySelector('.spec-field-card')).toBeNull();
  });
});
