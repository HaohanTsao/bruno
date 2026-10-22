import styled from 'styled-components';

const StyledWrapper = styled.span`
  display: inline-flex;
  flex: none;

  .spec-param-icon {
    margin-left: 4px;
    color: ${(props) => props.theme.colors.text.muted};
    cursor: pointer;
  }

  .spec-param-tooltip {
    max-width: 420px;
    z-index: 20;
  }

  .spec-param-details .spec-param-name {
    font-family: monospace;
    font-weight: 500;
  }

  .spec-param-details .spec-param-meta {
    opacity: 0.75;
    margin-bottom: 0.25rem;
  }

  .spec-param-details .spec-param-description {
    white-space: pre-wrap;
    margin-top: 0.25rem;
  }
`;

export default StyledWrapper;
