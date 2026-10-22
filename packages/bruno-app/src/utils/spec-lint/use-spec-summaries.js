import { useEffect, useState } from 'react';
import { getSpecSummary } from './ipc';

/**
 * Summaries of every registered spec of a collection, keyed by stored spec path. A spec whose summary has not
 * arrived yet has no entry. Bump `reloadKey` to fetch them all again.
 */
export const useSpecSummaries = ({ collectionPath, specs, enabled = true, reloadKey = 0 }) => {
  const [loaded, setLoaded] = useState({ collectionPath: null, summaries: {} });

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    let alive = true;
    specs.forEach((specPath) => {
      Promise.resolve(getSpecSummary({ collectionPath, specPath }))
        .catch((err) => ({ ok: false, error: err.message }))
        .then((result) => {
          if (alive) {
            setLoaded((previous) => ({
              collectionPath,
              summaries: { ...(previous.collectionPath === collectionPath ? previous.summaries : {}), [specPath]: result }
            }));
          }
        });
    });
    return () => {
      alive = false;
    };
  }, [enabled, collectionPath, specs, reloadKey]);

  return loaded.collectionPath === collectionPath ? loaded.summaries : {};
};
