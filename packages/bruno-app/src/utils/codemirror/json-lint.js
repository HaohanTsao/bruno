import stripJsonComments from 'strip-json-comments';
import { lintWithSpec } from 'utils/spec-lint/ipc';

// Syntax check of a JSON body (comments allowed, `{{var}}` placeholders tolerated).
const findSyntaxErrors = (text) => {
  const found = [];
  if (!window.jsonlint) {
    if (window.console) {
      window.console.error('Error: window.jsonlint not defined, CodeMirror JSON linting cannot run.');
    }
    return found;
  }
  const parser = window.jsonlint.parser || window.jsonlint;
  try {
    parser.parse(stripJsonComments(text.replace(/(?<!"[^":{]*){{[^}]*}}(?![^"},]*")/g, '1')));
  } catch (error) {
    const { message, location } = error;
    const line = location?.start?.line;
    const column = location?.start?.column;
    if (line && column) {
      found.push({
        from: { line: line - 1, ch: column },
        to: { line: line - 1, ch: column },
        message
      });
    }
  }
  return found;
};

/**
 * CodeMirror async lint helper for JSON. Reports syntax errors; when the editor carries a `specCtx` and the
 * syntax is valid, it adds the errors the spec check finds through the main process.
 */
export const jsonLintHelper = (text, updateLinting, options, cm) => {
  const found = findSyntaxErrors(text);
  if (found.length > 0 || !cm || !cm.specCtx) {
    updateLinting(found);
    return;
  }

  cm.state.specLintSeq = (cm.state.specLintSeq || 0) + 1;
  const seq = cm.state.specLintSeq;
  const isCurrent = () => cm.state.specLintSeq === seq;

  lintWithSpec({ ...cm.specCtx, text }).then(
    (errors) => {
      if (!isCurrent()) {
        return;
      }
      for (const e of errors) {
        found.push({ from: cm.posFromIndex(e.from), to: cm.posFromIndex(e.to), message: e.message, severity: 'error' });
      }
      updateLinting(found);
    },
    (err) => {
      console.warn('Spec lint failed', err);
      if (isCurrent()) {
        updateLinting(found);
      }
    }
  );
};

jsonLintHelper.async = true;
