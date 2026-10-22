const toSegments = (value) => value.split('/').filter((segment) => segment !== '');

// Reduces a request URL or spec path to its path segments, without query, fragment, host or leading variable.
const normalize = (url) => {
  let rest = url.split(/[?#]/)[0];
  if (/^\{\{[^}]*\}\}/.test(rest)) {
    rest = rest.replace(/^\{\{[^}]*\}\}/, '');
  } else {
    rest = rest.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, '');
  }
  return toSegments(rest);
};

const isWildcardRequestSegment = (segment) => segment.startsWith(':') || segment.includes('{{');

const segmentMatches = (requestSegment, specSegment) => {
  if (/^\{.*\}$/.test(specSegment) || isWildcardRequestSegment(requestSegment)) {
    return true;
  }
  return requestSegment === specSegment;
};

/**
 * Tells whether a request URL clearly points somewhere other than the bound spec path.
 * Unsure cases (empty URL, variables that may hold several segments) answer false.
 */
const urlDiffers = (requestUrl, specPath) => {
  if (!requestUrl) {
    return false;
  }
  const requestSegments = normalize(requestUrl);
  if (!requestSegments.length) {
    return false;
  }
  const specSegments = toSegments(specPath);

  if (requestSegments.length >= specSegments.length) {
    const tail = requestSegments.slice(requestSegments.length - specSegments.length);
    return !specSegments.every((specSegment, i) => segmentMatches(tail[i], specSegment));
  }
  return !requestSegments.some((segment) => segment.includes('{{'));
};

module.exports = { urlDiffers };
