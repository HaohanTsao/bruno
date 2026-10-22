import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import get from 'lodash/get';
import InfoTip from 'components/InfoTip';
import { useDispatch, useSelector } from 'react-redux';
import { useTheme } from 'providers/Theme';
import {
  moveQueryParam,
  updatePathParam,
  setQueryParams
} from 'providers/ReduxStore/slices/collections';
import { saveRequest, sendRequest } from 'providers/ReduxStore/slices/collections/actions';
import { updateTableColumnWidths } from 'providers/ReduxStore/slices/tabs';
import MultiLineEditor from 'components/MultiLineEditor';
import SingleLineEditor from 'components/SingleLineEditor';
import EditableTable from 'components/EditableTable';
import { createDescriptionColumn } from 'components/EditableTable/descriptionColumn';
import StyledWrapper from './StyledWrapper';
import BulkEditor from '../../BulkEditor';
import { usePersistedState } from 'hooks/usePersistedState';
import { useTrackScroll } from 'hooks/useTrackScroll';
import { loadSpecBindings } from 'providers/ReduxStore/slices/spec-lint';
import { BETA_FEATURES, useBetaFeature } from 'utils/beta-features';
import { useSpecQueryParams } from 'utils/spec-lint/use-spec-query-params';
import { missingRequired, unusedParams, valueChoices, withRequiredAdded } from 'utils/spec-lint/query-params';
import { openCellHintsOnEmpty } from 'utils/codemirror/cell-hints';
import { renderSpecFieldHint } from 'utils/codemirror/spec-key-hints';
import SpecBindingBar from 'components/RequestPane/SpecBindingBar';
import SpecParamInfo from './SpecParamInfo';

const QueryParams = ({ item, collection }) => {
  const dispatch = useDispatch();
  const { storedTheme } = useTheme();
  const tabs = useSelector((state) => state.tabs.tabs);
  const activeTabUid = useSelector((state) => state.tabs.activeTabUid);
  const params = item.draft ? get(item, 'draft.request.params') : get(item, 'request.params');
  const queryParams = params.filter((param) => param.type === 'query');
  const pathParams = params.filter((param) => param.type === 'path');

  const [isBulkEditMode, setIsBulkEditMode] = useState(false);
  const wrapperRef = useRef(null);
  const [scroll, setScroll] = usePersistedState({ key: `request-params-scroll-${item.uid}`, default: 0 });
  useTrackScroll({ ref: wrapperRef, selector: '.flex-boundary', onChange: setScroll, initialValue: scroll });

  const specLintEnabled = useBetaFeature(BETA_FEATURES.SPEC_LINT);
  const specParams = useSpecQueryParams({ collection, item, enabled: specLintEnabled });
  const specParamsByName = useMemo(() => new Map((specParams || []).map((param) => [param.name, param])), [specParams]);
  const hasSpecParams = Boolean(specParams && specParams.length);
  const missing = hasSpecParams ? missingRequired(specParams, queryParams) : [];

  // The file can change outside Bruno (git pull, a hand edit), so it is read again whenever the params are shown.
  useEffect(() => {
    if (specLintEnabled) {
      dispatch(loadSpecBindings(collection.uid));
    }
  }, [specLintEnabled, item.uid, collection.uid, dispatch]);

  // Name cells offer the spec parameters no other row uses yet; an empty cell lists them on click.
  const nameEntries = (ownName) =>
    unusedParams(specParams || [], queryParams, ownName).map((param) => ({ text: param.name, item: param, render: renderSpecFieldHint }));

  // Get column widths from Redux
  const focusedTab = tabs?.find((t) => t.uid === activeTabUid);
  const queryParamsWidths = focusedTab?.tableColumnWidths?.['query-params'] || {};
  const pathParamsWidths = focusedTab?.tableColumnWidths?.['path-params'] || {};

  const handleColumnWidthsChange = (tableId, widths) => {
    dispatch(updateTableColumnWidths({ uid: activeTabUid, tableId, widths }));
  };

  const onSave = () => dispatch(saveRequest(item.uid, collection.uid));
  const handleRun = () => dispatch(sendRequest(item, collection.uid));

  const handleQueryParamsChange = useCallback((updatedParams) => {
    const paramsWithType = updatedParams.map((p) => ({ ...p, type: 'query' }));
    dispatch(setQueryParams({
      collectionUid: collection.uid,
      itemUid: item.uid,
      params: paramsWithType
    }));
  }, [dispatch, collection.uid, item.uid]);

  const handlePathParamChange = useCallback(
    (rowUid, key, value) => {
      const pathParam = pathParams.find((p) => p.uid === rowUid);
      if (pathParam) {
        dispatch(
          updatePathParam({
            pathParam: { ...pathParam, [key]: value },
            itemUid: item.uid,
            collectionUid: collection.uid
          })
        );
      }
    },
    [dispatch, pathParams, item.uid, collection.uid]
  );

  const handleQueryParamDrag = useCallback(({ updateReorderedItem }) => {
    dispatch(moveQueryParam({
      collectionUid: collection.uid,
      itemUid: item.uid,
      updateReorderedItem
    }));
  }, [dispatch, collection.uid, item.uid]);

  const toggleBulkEditMode = () => {
    setIsBulkEditMode(!isBulkEditMode);
  };

  const descriptionColumnQuery = createDescriptionColumn({
    theme: storedTheme,
    onSave,
    onRun: handleRun,
    collection,
    item
  });

  const descriptionColumnPath = createDescriptionColumn({
    theme: storedTheme,
    onSave,
    onRun: handleRun,
    collection,
    item,
    onDescriptionChange: (newValue, { row }) => handlePathParamChange(row.uid, 'description', newValue)
  });

  const addMissingRequired = () => handleQueryParamsChange(withRequiredAdded(specParams, queryParams));

  const queryColumns = [
    {
      key: 'name',
      name: 'Name',
      isKeyField: true,
      placeholder: 'Name',
      width: '20%',
      // Without spec query parameters the name stays a plain input, as in Bruno.
      render: hasSpecParams
        ? ({ row, value, onChange }) => {
            const param = specParamsByName.get(value);
            const entries = nameEntries(value || '');
            return (
              <div className="spec-param-cell" onMouseUp={(event) => openCellHintsOnEmpty(event, entries)}>
                <SingleLineEditor
                  value={value || ''}
                  theme={storedTheme}
                  onSave={onSave}
                  onChange={(newValue) => onChange(newValue.replace(/[\r\n]/g, ''))}
                  autocomplete={entries.map((entry) => entry.text)}
                  onRun={handleRun}
                  collection={collection}
                  item={item}
                  placeholder={!value ? 'Name' : ''}
                />
                {param && <SpecParamInfo param={param} id={`spec-param-${row.uid}`} />}
              </div>
            );
          }
        : undefined
    },
    {
      key: 'value',
      name: 'Value',
      placeholder: 'Value',
      render: ({ row, value, onChange }) => {
        const choices = valueChoices(specParamsByName.get(row.name));
        const editor = (
          <MultiLineEditor
            value={value || ''}
            theme={storedTheme}
            onSave={onSave}
            onChange={onChange}
            onRun={handleRun}
            collection={collection}
            item={item}
            variablesAutocomplete={true}
            autocomplete={choices.length ? choices : undefined}
            placeholder={!value ? 'Value' : ''}
          />
        );
        // An empty value cell of a parameter with fixed values lists them on click.
        return choices.length ? (
          <div className="spec-param-cell" onMouseUp={(event) => openCellHintsOnEmpty(event, choices.map((text) => ({ text })))}>
            {editor}
          </div>
        ) : editor;
      }
    },
    descriptionColumnQuery
  ];

  const pathColumns = [
    {
      key: 'name',
      name: 'Name',
      isKeyField: true,
      width: '20%',
      readOnly: true
    },
    {
      key: 'value',
      name: 'Value',
      placeholder: 'Value',
      render: ({ row, value, onChange }) => (
        <MultiLineEditor
          value={value || ''}
          theme={storedTheme}
          onSave={onSave}
          onChange={(newValue) => handlePathParamChange(row.uid, 'value', newValue)}
          onRun={handleRun}
          collection={collection}
          item={item}
        />
      )
    },
    descriptionColumnPath
  ];

  const defaultQueryRow = {
    name: '',
    value: '',
    description: '',
    type: 'query'
  };

  if (isBulkEditMode) {
    return (
      <StyledWrapper className="w-full mt-3">
        <BulkEditor
          params={queryParams}
          onChange={handleQueryParamsChange}
          onToggle={toggleBulkEditMode}
          onSave={onSave}
          onRun={handleRun}
        />
      </StyledWrapper>
    );
  }

  return (
    <StyledWrapper className="w-full flex flex-col" ref={wrapperRef}>
      <div className="flex-1">
        {specLintEnabled && <SpecBindingBar item={item} collection={collection} context="params" />}
        <EditableTable
          tableId="query-params"
          testId="query-params-table"
          columns={queryColumns}
          rows={queryParams || []}
          onChange={handleQueryParamsChange}
          defaultRow={defaultQueryRow}
          reorderable={true}
          onReorder={handleQueryParamDrag}
          columnWidths={queryParamsWidths}
          onColumnWidthsChange={(widths) => handleColumnWidthsChange('query-params', widths)}
          initialScroll={scroll}
        />
        {missing.length > 0 && (
          <div className="spec-missing-required mt-2 text-xs" data-testid="spec-missing-required">
            <span>{`Spec requires: ${missing.map((param) => param.name).join(', ')}`}</span>
            <button type="button" className="text-link ml-2" onClick={addMissingRequired}>
              Add
            </button>
          </div>
        )}
        <div className="bulk-edit-bar flex justify-end mt-2">
          <button className="btn-action text-link select-none" onClick={toggleBulkEditMode}>
            Bulk Edit
          </button>
        </div>

        <div className="mb-3 title text-xs flex items-stretch">
          <span>Path</span>
          <InfoTip className="tooltip-mod" infotipId="path-param-InfoTip">
            <div>
              Path variables are automatically added whenever the
              <code className="font-mono mx-2">:name</code>
              template is used in the URL. <br /> For example:
              <code className="font-mono mx-2">
                https://example.com/v1/users/<span>:id</span>
              </code>
            </div>
          </InfoTip>
        </div>
        {pathParams && pathParams.length > 0 ? (
          <EditableTable
            tableId="path-params"
            testId="path-params-table"
            columns={pathColumns}
            rows={pathParams}
            onChange={() => {}}
            defaultRow={{}}
            showCheckbox={false}
            showDelete={false}
            showAddRow={false}
            columnWidths={pathParamsWidths}
            onColumnWidthsChange={(widths) => handleColumnWidthsChange('path-params', widths)}
            initialScroll={scroll}
          />
        ) : (
          <div className="title pr-2 py-3 mt-2 text-xs"></div>
        )}
      </div>
    </StyledWrapper>
  );
};

export default QueryParams;
