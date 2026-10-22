import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Modal from 'components/Modal';
import { browseFiles } from 'providers/ReduxStore/slices/collections/actions';
import { loadSpecBindings, saveSpecBindings } from 'providers/ReduxStore/slices/spec-lint';
import { toStoredPath } from 'utils/spec-lint/ipc';
import { countBindingsOf } from 'utils/spec-lint/bindings';
import { useSpecSummaries } from 'utils/spec-lint/use-spec-summaries';
import { toastError } from 'utils/common/error';
import StyledWrapper from './StyledWrapper';

const SPEC_FILTERS = [{ name: 'OpenAPI', extensions: ['yaml', 'yml', 'json'] }];
const INSIDE_YML_COLLECTION_MESSAGE = 'Bruno reads every .yml file in this folder as a request. Add it anyway?';

const fileNameOf = (storedPath) => storedPath.split('/').pop();

const removeMessage = (storedPath, count) => {
  const name = `Remove ${fileNameOf(storedPath)}?`;
  if (count === 0) {
    return name;
  }
  return `${name} ${count} bound ${count === 1 ? 'request' : 'requests'} will be unbound.`;
};

const ApiSpecs = ({ collection }) => {
  const dispatch = useDispatch();
  const slice = useSelector((state) => state.specLint.byCollection[collection.uid]);
  const data = slice ? slice.data : null;
  const error = slice ? slice.error : null;
  const specs = data ? data.specs : [];
  const [reloadKey, setReloadKey] = useState(0);
  // A chosen file waiting for the user's answer about the .yml warning: { storedPath, replacing } (replacing is the old path or null).
  const [pending, setPending] = useState(null);
  const [removing, setRemoving] = useState(null);
  const summaries = useSpecSummaries({ collectionPath: collection.pathname, specs, reloadKey });

  // The file can change outside Bruno (git pull, a hand edit), so it is read again every time the tab is shown.
  useEffect(() => {
    dispatch(loadSpecBindings(collection.uid));
  }, [collection.uid, dispatch]);

  const save = async (op) => {
    try {
      await dispatch(saveSpecBindings(collection.uid, op));
    } catch (err) {
      toastError(err, 'Could not save spec-bindings.json');
      dispatch(loadSpecBindings(collection.uid));
    }
  };

  const apply = async ({ storedPath, replacing }) => {
    await save(replacing ? { type: 'replaceSpec', storedPath: replacing, newStoredPath: storedPath } : { type: 'addSpec', storedPath });
  };

  // Browses for a spec file; `replacing` is the stored path of the spec the file takes over, or null to add a new one.
  const choose = async (replacing) => {
    try {
      const files = await dispatch(browseFiles(SPEC_FILTERS, ['openFile']));
      if (!Array.isArray(files) || files.length === 0) {
        return;
      }
      const { storedPath, insideYmlCollection } = await toStoredPath({ collectionPath: collection.pathname, absolutePath: files[0] });
      if (insideYmlCollection) {
        setPending({ storedPath, replacing });
        return;
      }
      await apply({ storedPath, replacing });
    } catch (err) {
      toastError(err, replacing ? 'Could not replace the spec' : 'Could not add the spec');
    }
  };

  const onConfirmInside = async () => {
    const choice = pending;
    setPending(null);
    await apply(choice);
  };

  const onConfirmRemove = async () => {
    const storedPath = removing;
    setRemoving(null);
    await save({ type: 'removeSpec', storedPath });
  };

  return (
    <StyledWrapper className="h-full w-full" data-testid="api-specs">
      {error && <div className="specs-error" data-testid="api-specs-error">{error}</div>}
      <div className="specs-header">
        <button type="button" className="specs-link" disabled={Boolean(error) || !data} onClick={() => choose(null)} data-testid="api-specs-add">
          Add spec
        </button>
        <div className="specs-actions">
          <button
            type="button"
            className="specs-link"
            onClick={() => {
              dispatch(loadSpecBindings(collection.uid));
              setReloadKey((key) => key + 1);
            }}
          >
            Reload
          </button>
        </div>
      </div>
      <table>
        <tbody>
          {specs.length === 0 && (
            <tr>
              <td className="empty-state">No API specs registered</td>
            </tr>
          )}
          {specs.map((specPath) => {
            const summary = summaries[specPath];
            return (
              <tr key={specPath} data-testid="api-specs-row">
                <td>
                  {summary && summary.ok && (
                    <div>
                      <span className="spec-title">{summary.title || fileNameOf(specPath)}</span>
                      <span className="spec-meta">{` ${summary.specVersion} · ${summary.operations.length} APIs`}</span>
                    </div>
                  )}
                  {summary && !summary.ok && <div className="spec-load-error">{summary.error}</div>}
                  <div className="spec-file">{fileNameOf(specPath)}</div>
                  {fileNameOf(specPath) !== specPath && <div className="spec-path">{specPath}</div>}
                </td>
                <td className="actions">
                  <button type="button" className="specs-link" disabled={Boolean(error)} onClick={() => choose(specPath)}>
                    Replace file…
                  </button>
                  <button type="button" className="specs-link" disabled={Boolean(error)} onClick={() => setRemoving(specPath)}>
                    Remove
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {pending && (
        <Modal
          size="sm"
          title={pending.replacing ? 'Replace spec' : 'Add spec'}
          confirmText="Add anyway"
          cancelText="Cancel"
          handleConfirm={onConfirmInside}
          handleCancel={() => setPending(null)}
        >
          <div>{INSIDE_YML_COLLECTION_MESSAGE}</div>
          <div className="mt-2 text-xs break-all">{pending.storedPath}</div>
        </Modal>
      )}
      {removing && (
        <Modal size="sm" title="Remove spec" confirmText="Remove" cancelText="Cancel" handleConfirm={onConfirmRemove} handleCancel={() => setRemoving(null)}>
          <div>{removeMessage(removing, countBindingsOf(data, removing))}</div>
        </Modal>
      )}
    </StyledWrapper>
  );
};

export default ApiSpecs;
