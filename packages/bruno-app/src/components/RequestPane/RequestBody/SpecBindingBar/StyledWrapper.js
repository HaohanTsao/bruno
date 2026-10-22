import styled from 'styled-components';

const StyledWrapper = styled.div`
  position: relative;
  flex: none;
  font-size: ${(props) => props.theme.font.size.sm};
  padding: 0.25rem 0 0.375rem 0;

  .bar-line {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-height: 1.5rem;
  }

  .bar-muted {
    color: ${(props) => props.theme.colors.text.muted};
  }

  .bar-label {
    color: ${(props) => props.theme.text};
  }

  .bar-hint {
    color: ${(props) => props.theme.colors.text.muted};
    font-size: ${(props) => props.theme.font.size.xs};
    padding-top: 0.125rem;
  }

  .bar-link {
    background: transparent;
    border: none;
    padding: 0;
    cursor: pointer;
    color: ${(props) => props.theme.colors.text.muted};

    &:hover:not(:disabled) {
      color: ${(props) => props.theme.textLink};
      text-decoration: underline;
    }

    &:disabled {
      cursor: not-allowed;
      opacity: 0.6;
    }
  }

  .picker {
    position: absolute;
    top: 100%;
    left: 0;
    z-index: 30;
    width: 480px;
    max-width: 100%;
    max-height: 340px;
    display: flex;
    flex-direction: column;
    padding: 0.25rem;
    color: ${(props) => props.theme.dropdown.color};
    background-color: ${(props) => props.theme.dropdown.bg};
    border-radius: ${(props) => props.theme.border.radius.base};
    box-shadow: ${(props) => props.theme.dropdown.shadow};
    border: 1px solid ${(props) => props.theme.border.border1};
  }

  .picker-empty {
    padding: 0.5rem 0.625rem;
    color: ${(props) => props.theme.colors.text.muted};
  }

  .picker-back {
    text-align: left;
    padding: 0.25rem 0.625rem;
  }

  .picker-filter {
    margin: 0.25rem 0.375rem;
    padding: 0.25rem 0.5rem;
    background: ${(props) => props.theme.input.bg};
    border: 1px solid ${(props) => props.theme.input.border};
    border-radius: ${(props) => props.theme.border.radius.sm};
    color: ${(props) => props.theme.text};
    outline: none;

    &:focus {
      border-color: ${(props) => props.theme.input.focusBorder};
    }
  }

  .picker-list {
    overflow-y: auto;
    min-height: 0;
  }

  .picker-item {
    display: block;
    width: 100%;
    text-align: left;
    padding: 0.25rem 0.625rem;
    background: transparent;
    border: none;
    color: inherit;
    cursor: pointer;
    border-radius: ${(props) => props.theme.border.radius.sm};
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;

    &:hover:not(:disabled) {
      background-color: ${(props) => props.theme.dropdown.hoverBg};
    }

    &:disabled {
      cursor: not-allowed;
      color: ${(props) => props.theme.colors.text.muted};
      opacity: 0.7;
    }
  }

  .picker-item.picker-spec {
    white-space: normal;
    overflow: visible;
    text-overflow: clip;
  }

  .picker-spec-title {
    display: block;
    overflow-wrap: anywhere;
  }

  .picker-spec-file {
    display: block;
    font-family: monospace;
    font-size: ${(props) => props.theme.font.size.xs};
    color: ${(props) => props.theme.colors.text.muted};
    overflow-wrap: anywhere;
  }

  .op-method {
    font-weight: 600;
    margin-right: 0.375rem;
  }
`;

export default StyledWrapper;
