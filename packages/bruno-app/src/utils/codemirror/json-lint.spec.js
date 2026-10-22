jest.mock('strip-json-comments', () => ({ __esModule: true, default: (s) => s }));
jest.mock('utils/spec-lint/ipc');

import * as jsonlint from '@prantlf/jsonlint';
import { jsonLintHelper } from './json-lint';
import { lintWithSpec } from 'utils/spec-lint/ipc';

const fakeCm = (specCtx) => ({ specCtx, state: {}, posFromIndex: (i) => ({ line: 0, ch: i }) });
const ctx = { collectionPath: '/c', specPath: 's.yaml', method: 'POST', path: '/v3/limit' };

beforeEach(() => {
  window.jsonlint = jsonlint;
});

it('is async', () => {
  expect(jsonLintHelper.async).toBe(true);
});

it('sanity: a syntax error yields exactly one annotation', () => {
  const updateLinting = jest.fn();
  jsonLintHelper('{"a": }', updateLinting, {}, fakeCm(null));
  expect(updateLinting).toHaveBeenCalledTimes(1);
  expect(updateLinting.mock.calls[0][0]).toHaveLength(1);
});

it('reports only syntax errors when there is no specCtx', () => {
  const updateLinting = jest.fn();
  jsonLintHelper('{"a": 1}', updateLinting, {}, fakeCm(null));
  expect(lintWithSpec).not.toHaveBeenCalled();
  expect(updateLinting).toHaveBeenCalledTimes(1);
  expect(updateLinting).toHaveBeenCalledWith([]);
});

it('appends spec errors from IPC when specCtx is set', async () => {
  lintWithSpec.mockResolvedValue([{ from: 0, to: 1, message: 'Spec requires: x' }]);
  const updateLinting = jest.fn();
  jsonLintHelper('{"a": 1}', updateLinting, {}, fakeCm(ctx));
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(lintWithSpec).toHaveBeenCalledWith({ ...ctx, text: '{"a": 1}' });
  expect(updateLinting).toHaveBeenCalledTimes(1);
  expect(updateLinting).toHaveBeenCalledWith([
    { from: { line: 0, ch: 0 }, to: { line: 0, ch: 1 }, message: 'Spec requires: x', severity: 'error' }
  ]);
});

it('ends with only the syntax result when IPC yields no errors', async () => {
  lintWithSpec.mockResolvedValue([]);
  const updateLinting = jest.fn();
  jsonLintHelper('{"a": 1}', updateLinting, {}, fakeCm(ctx));
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(updateLinting).toHaveBeenCalledTimes(1);
  expect(updateLinting).toHaveBeenCalledWith([]);
});

it('drops a stale response', async () => {
  let resolveFirst;
  lintWithSpec.mockReturnValueOnce(new Promise((resolve) => { resolveFirst = resolve; }));
  lintWithSpec.mockResolvedValueOnce([{ from: 2, to: 3, message: 'Spec second' }]);
  const cm = fakeCm(ctx);
  const first = jest.fn();
  const second = jest.fn();
  jsonLintHelper('{"a": 1}', first, {}, cm);
  jsonLintHelper('{"a": 2}', second, {}, cm);
  await new Promise((resolve) => setTimeout(resolve, 0));
  resolveFirst([{ from: 0, to: 1, message: 'Spec first' }]);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenCalledTimes(1);
  expect(second.mock.calls[0][0][0].message).toBe('Spec second');
});

it('skips spec lint when there is a syntax error', () => {
  const updateLinting = jest.fn();
  jsonLintHelper('{"a": }', updateLinting, {}, fakeCm(ctx));
  expect(lintWithSpec).not.toHaveBeenCalled();
  expect(updateLinting).toHaveBeenCalledTimes(1);
});

it('still calls updateLinting when IPC rejects', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  lintWithSpec.mockRejectedValue(new Error('boom'));
  const updateLinting = jest.fn();
  jsonLintHelper('{"a": 1}', updateLinting, {}, fakeCm(ctx));
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(warn).toHaveBeenCalled();
  expect(updateLinting).toHaveBeenCalledTimes(1);
  expect(updateLinting).toHaveBeenCalledWith([]);
  warn.mockRestore();
});
