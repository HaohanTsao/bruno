import React from 'react';
import { IconInfoCircle } from '@tabler/icons';
import { Tooltip } from 'react-tooltip';
import { valueChoices } from 'utils/spec-lint/query-params';
import StyledWrapper from './StyledWrapper';

const metaText = (param) => [param.type, param.required ? 'required' : 'optional', param.deprecated && 'deprecated'].filter(Boolean).join(' · ');

// What the spec says about one query parameter. React renders every spec string as text.
export const SpecParamDetails = ({ param }) => {
  const choices = valueChoices(param);
  return (
    <div className="spec-param-details">
      <div className="spec-param-name">{param.name}</div>
      <div className="spec-param-meta">{metaText(param)}</div>
      {choices.length > 0 && <div>{`Allowed: ${choices.join(', ')}`}</div>}
      {param.default !== undefined && <div>{`Default: ${param.default === null ? 'null' : String(param.default)}`}</div>}
      {param.description && <div className="spec-param-description">{param.description}</div>}
    </div>
  );
};

const SpecParamInfo = ({ param, id }) => (
  <StyledWrapper>
    <IconInfoCircle data-tooltip-id={id} className="spec-param-icon" size={16} strokeWidth={1.5} data-testid="spec-param-info" />
    <Tooltip id={id} className="tooltip-mod spec-param-tooltip" place="bottom-start" clickable>
      <SpecParamDetails param={param} />
    </Tooltip>
  </StyledWrapper>
);

export default SpecParamInfo;
