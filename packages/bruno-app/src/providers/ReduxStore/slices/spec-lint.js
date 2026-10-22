import { createSlice } from '@reduxjs/toolkit';
import { findCollectionByUid } from 'utils/collections';
import { readBindings, updateBindings } from 'utils/spec-lint/ipc';

const initialState = {
  // collectionUid -> { data: { specs, bindings }, loaded, error }
  byCollection: {}
};

export const specLintSlice = createSlice({
  name: 'specLint',
  initialState,
  reducers: {
    setCollectionSpecData: (state, action) => {
      const { collectionUid, data, error } = action.payload;
      state.byCollection[collectionUid] = { data, loaded: true, error: error || null };
    }
  }
});

export const { setCollectionSpecData } = specLintSlice.actions;

export const loadSpecBindings = (collectionUid) => async (dispatch, getState) => {
  const collection = findCollectionByUid(getState().collections.collections, collectionUid);
  if (!collection) {
    return;
  }
  const { data, error } = await readBindings({ collectionPath: collection.pathname });
  dispatch(setCollectionSpecData({ collectionUid, data, error }));
};

/**
 * Changes the bindings of a collection through the main process, which applies `op` to the file as it is on disk
 * (see updateBindings) and returns the new data, which is stored here. Returns false (and writes nothing) while
 * spec-bindings.json could not be read, so a file the user can fix by hand is never overwritten. Throws when the
 * change could not be made.
 */
export const saveSpecBindings = (collectionUid, op) => async (dispatch, getState) => {
  if (getState().specLint.byCollection[collectionUid]?.error) {
    return false;
  }
  const collection = findCollectionByUid(getState().collections.collections, collectionUid);
  if (!collection) {
    return false;
  }
  const data = await updateBindings({ collectionPath: collection.pathname, op });
  dispatch(setCollectionSpecData({ collectionUid, data, error: null }));
  return true;
};

export default specLintSlice.reducer;
