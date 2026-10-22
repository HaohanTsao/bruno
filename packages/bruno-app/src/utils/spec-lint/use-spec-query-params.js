import { useEffect, useState } from 'react';
import { useSpecLint } from './use-spec-lint';
import { getQueryParamsFromSpec } from './ipc';

/**
 * The query parameters the spec declares for the operation a request is bound to, or null while there is no
 * binding, the spec or operation cannot be found, or the answer has not arrived.
 */
export const useSpecQueryParams = ({ collection, item, enabled }) => {
  const { specCtx } = useSpecLint({ collection, item, enabled, requireJsonBody: false });

  // Tagged with the target it was loaded for, so a binding change never shows the previous operation's parameters.
  const [loaded, setLoaded] = useState(null);
  useEffect(() => {
    if (!specCtx) {
      return undefined;
    }
    let alive = true;
    getQueryParamsFromSpec(specCtx).then(
      (params) => {
        if (alive) {
          setLoaded({ specCtx, params });
        }
      },
      () => {}
    );
    return () => {
      alive = false;
    };
  }, [specCtx]);

  return specCtx && loaded && loaded.specCtx === specCtx ? loaded.params : null;
};
