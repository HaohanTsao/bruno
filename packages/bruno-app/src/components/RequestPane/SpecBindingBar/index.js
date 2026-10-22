import React, { useEffect, useMemo, useRef, useState } from 'react';
import get from 'lodash/get';
import { useDispatch, useSelector } from 'react-redux';
import { bindingKey } from 'utils/spec-lint/bindings';
import { operationHasJsonBody, urlDiffersFromSpec } from 'utils/spec-lint/ipc';
import { useSpecLint } from 'utils/spec-lint/use-spec-lint';
import { useSpecSummaries } from 'utils/spec-lint/use-spec-summaries';
import { loadSpecBindings, saveSpecBindings } from 'providers/ReduxStore/slices/spec-lint';
import { toastError } from 'utils/common/error';
import StyledWrapper from './StyledWrapper';

const BROKEN_FILE_TITLE = 'spec-bindings.json is not valid JSON — fix or delete the file';
// A spec has a few hundred operations; plain buttons render fine. The cap only guards against absurd specs.
const MAX_LISTED_OPERATIONS = 2000;

const fileNameOf = (storedPath) => storedPath.split('/').pop();

// A missing file is named by its file name; any other loader error (not parsable, Swagger 2.0, ...) is shown as it is.
const fileProblemText = (error, storedPath) => (/^Spec file not found/.test(error) ? `Spec file not found: ${fileNameOf(storedPath)}` : error);

const matchesFilter = (operation, filter) => {
  const words = filter.toLowerCase().split(/\s+/).filter(Boolean);
  const haystack = `${operation.method} ${operation.path} ${operation.summary || ''}`.toLowerCase();
  return words.every((word) => haystack.includes(word));
};

const SpecPicker = ({ specs, summaries, onChoose, onClose, triggerRef }) => {
  const [specPath, setSpecPath] = useState(null);
  const [filter, setFilter] = useState('');
  const rootRef = useRef(null);

  useEffect(() => {
    const onMouseDown = (event) => {
      // The trigger button toggles the picker itself; closing here too would let its click reopen it.
      if (triggerRef.current && triggerRef.current.contains(event.target)) {
        return;
      }
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [onClose, triggerRef]);

  const summary = specPath ? summaries[specPath] : null;
  const operations = useMemo(() => {
    if (!summary || !summary.ok) {
      return [];
    }
    return summary.operations.filter((operation) => matchesFilter(operation, filter));
  }, [summary, filter]);

  const onKeyDown = (event) => {
    if (event.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div className="picker" ref={rootRef} onKeyDown={onKeyDown} data-testid="spec-binding-picker">
      {!specPath && specs.length === 0 && (
        <div className="picker-empty">No API specs registered. Add them in Collection Settings → Spec Lint.</div>
      )}
      {!specPath && specs.length > 0 && (
        <div className="picker-list">
          {specs.map((spec) => {
            const result = summaries[spec];
            const ready = result && result.ok;
            return (
              <button key={spec} type="button" className="picker-item picker-spec" disabled={!ready} title={spec} onClick={() => setSpecPath(spec)}>
                {ready && <span className="picker-spec-title">{`${result.title || fileNameOf(spec)} ${result.specVersion}`.trim()}</span>}
                <span className="picker-spec-file">{fileNameOf(spec)}</span>
              </button>
            );
          })}
        </div>
      )}
      {specPath && (
        <>
          <button type="button" className="bar-link picker-back" onClick={() => setSpecPath(null)}>
            {fileNameOf(specPath)}
          </button>
          <input
            className="picker-filter"
            placeholder="Filter"
            aria-label="Filter"
            autoFocus
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
          <div className="picker-list">
            {operations.slice(0, MAX_LISTED_OPERATIONS).map((operation) => (
              <button
                key={`${operation.method} ${operation.path}`}
                type="button"
                className="picker-item"
                title={`${operation.method} ${operation.path}`}
                onClick={() => onChoose({ spec: specPath, method: operation.method, path: operation.path })}
              >
                <span className="op-method">{operation.method}</span>
                {operation.summary ? `${operation.path} — ${operation.summary}` : operation.path}
              </button>
            ))}
            {operations.length > MAX_LISTED_OPERATIONS && (
              <div className="picker-empty">{`Showing the first ${MAX_LISTED_OPERATIONS} of ${operations.length}. Type to narrow the list.`}</div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

// `context` is the pane the bar sits in: 'body' (above the JSON body editor) or 'params' (above the query params).
const SpecBindingBar = ({ item, collection, context = 'body' }) => {
  const dispatch = useDispatch();
  const slice = useSelector((state) => state.specLint.byCollection[collection.uid]);
  const data = slice ? slice.data : null;
  const broken = Boolean(slice && slice.error);
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const { binding, summary } = useSpecLint({ collection, item, enabled: true, requireJsonBody: false });
  const summaries = useSpecSummaries({ collectionPath: collection.pathname, specs: data ? data.specs : [], enabled: open });

  const requestUrl = item.draft ? get(item, 'draft.request.url', '') : get(item, 'request.url', '');
  const key = bindingKey(collection.pathname, item.pathname);
  const operationKnown = Boolean(binding && summary && summary.ok && summary.operations.some((op) => op.method === binding.method && op.path === binding.path));

  const [urlCheck, setUrlCheck] = useState(null);
  useEffect(() => {
    if (!operationKnown) {
      return undefined;
    }
    let alive = true;
    Promise.resolve(urlDiffersFromSpec({ requestUrl, specOperationPath: binding.path }))
      .then((differs) => {
        if (alive) {
          setUrlCheck({ requestUrl, path: binding.path, differs: differs === true });
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [operationKnown, requestUrl, binding]);
  // The operation exists but the spec gives it no JSON request body, so there is nothing to check a body against.
  const [bodyCheck, setBodyCheck] = useState(null);
  const checkBody = operationKnown && context === 'body';
  useEffect(() => {
    if (!checkBody) {
      return undefined;
    }
    let alive = true;
    const target = { collectionPath: collection.pathname, specPath: binding.spec, method: binding.method, path: binding.path };
    Promise.resolve(operationHasJsonBody(target))
      .then((hasBody) => {
        if (alive) {
          setBodyCheck({ ...target, hasBody });
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [checkBody, collection.pathname, binding]);
  const noJsonBody = Boolean(
    checkBody
    && bodyCheck
    && bodyCheck.collectionPath === collection.pathname
    && bodyCheck.specPath === binding.spec
    && bodyCheck.method === binding.method
    && bodyCheck.path === binding.path
    && bodyCheck.hasBody === false
  );

  const urlDiffers = Boolean(operationKnown && urlCheck && urlCheck.requestUrl === requestUrl && urlCheck.path === binding.path && urlCheck.differs);

  const save = async (op) => {
    try {
      await dispatch(saveSpecBindings(collection.uid, op));
    } catch (err) {
      toastError(err, 'Could not save spec-bindings.json');
      dispatch(loadSpecBindings(collection.uid));
    }
  };

  const onChoose = (nextBinding) => {
    setOpen(false);
    save({ type: 'setBinding', key, binding: nextBinding });
  };
  const onUnbind = () => save({ type: 'setBinding', key, binding: null });

  // A request outside the collection folder (an unsaved transient request) cannot be bound.
  if (key === null) {
    return null;
  }

  if (broken) {
    return (
      <StyledWrapper data-testid="spec-binding-bar">
        <div className="bar-line">
          <button type="button" className="bar-link" disabled title={BROKEN_FILE_TITLE}>
            Choose API
          </button>
        </div>
      </StyledWrapper>
    );
  }

  const picker = open && data
    ? <SpecPicker specs={data.specs} summaries={summaries} onChoose={onChoose} onClose={() => setOpen(false)} triggerRef={triggerRef} />
    : null;

  if (!binding) {
    return (
      <StyledWrapper data-testid="spec-binding-bar">
        <div className="bar-line">
          <button type="button" className="bar-link" ref={triggerRef} disabled={!data} onClick={() => setOpen(!open)}>
            Choose API
          </button>
        </div>
        {picker}
      </StyledWrapper>
    );
  }

  const fileProblem = Boolean(summary && !summary.ok);
  const gone = Boolean(summary && summary.ok && !operationKnown);
  return (
    <StyledWrapper data-testid="spec-binding-bar">
      <div className="bar-line">
        {fileProblem ? (
          <span className="bar-muted" title={summary.error}>{fileProblemText(summary.error, binding.spec)}</span>
        ) : gone ? (
          <span className="bar-muted">Binding not found in spec</span>
        ) : (
          <span className="bar-label" title={binding.spec}>{`${binding.method} ${binding.path} · ${fileNameOf(binding.spec)}`}</span>
        )}
        <button type="button" className="bar-link" ref={triggerRef} onClick={() => setOpen(!open)}>
          Change
        </button>
        <button type="button" className="bar-link" onClick={onUnbind}>
          Unbind
        </button>
      </div>
      {noJsonBody && <div className="bar-hint">This API has no JSON body in the spec</div>}
      {urlDiffers && <div className="bar-hint">{`URL path differs from spec: ${binding.path}`}</div>}
      {picker}
    </StyledWrapper>
  );
};

export default SpecBindingBar;
