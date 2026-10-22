import { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import get from 'lodash/get';
import { bindingKey, getBinding } from './bindings';
import { getSpecSummary } from './ipc';

/**
 * Spec-lint state of one request: its binding, the summary of the bound spec and `specCtx`, the target the JSON
 * editor lints against (null when no spec check applies).
 */
export const useSpecLint = ({ collection, item, enabled }) => {
  const data = useSelector((state) => state.specLint.byCollection[collection.uid]?.data);
  const bodyMode = item.draft ? get(item, 'draft.request.body.mode') : get(item, 'request.body.mode');
  const binding = data ? getBinding(data, bindingKey(collection.pathname, item.pathname)) : null;
  const collectionPath = collection.pathname;
  const specPath = binding ? binding.spec : null;
  const method = binding ? binding.method : null;
  const path = binding ? binding.path : null;
  const wanted = Boolean(enabled && bodyMode === 'json' && specPath);

  // The summary is tagged with the spec it was loaded for, so a binding change never shows the previous spec's summary.
  const [loaded, setLoaded] = useState(null);
  useEffect(() => {
    if (!wanted) {
      return undefined;
    }
    let alive = true;
    getSpecSummary({ collectionPath, specPath }).then((result) => {
      if (alive) {
        setLoaded({ collectionPath, specPath, result });
      }
    });
    return () => {
      alive = false;
    };
  }, [wanted, collectionPath, specPath]);

  const summary = wanted && loaded && loaded.collectionPath === collectionPath && loaded.specPath === specPath ? loaded.result : undefined;
  const operationKnown = Boolean(summary && summary.ok && summary.operations.some((op) => op.method === method && op.path === path));
  const active = wanted && operationKnown;

  const specCtx = useMemo(
    () => (active ? { collectionPath, specPath, method, path } : null),
    [active, collectionPath, specPath, method, path]
  );

  return { binding, specCtx, summary };
};
