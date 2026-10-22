import styled from 'styled-components';

const StyledWrapper = styled.div`
  font-size: ${(props) => props.theme.font.size.sm};

  .specs-error {
    color: ${(props) => props.theme.colors.text.danger};
    margin-bottom: 0.75rem;
  }

  .specs-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.75rem;
  }

  .specs-actions {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .specs-link {
    background: transparent;
    border: none;
    padding: 0;
    cursor: pointer;
    color: ${(props) => props.theme.textLink};

    &:hover:not(:disabled) {
      text-decoration: underline;
    }

    &:disabled {
      cursor: not-allowed;
      opacity: 0.5;
    }
  }

  table {
    width: 100%;
    border-collapse: collapse;

    td {
      border: 1px solid ${(props) => props.theme.table.border};
      padding: 0.5rem 0.75rem;
      vertical-align: top;
    }

    td.actions {
      text-align: right;
      white-space: nowrap;
      width: 1%;

      .specs-link + .specs-link {
        margin-left: 0.75rem;
      }
    }
  }

  .spec-title {
    font-weight: 500;
    color: ${(props) => props.theme.text};
  }

  .spec-title {
    word-break: break-word;
  }

  .spec-file {
    font-family: monospace;
    font-size: ${(props) => props.theme.font.size.xs};
    color: ${(props) => props.theme.text};
    word-break: break-all;
  }

  .spec-meta,
  .spec-path {
    color: ${(props) => props.theme.colors.text.muted};
  }

  .spec-path {
    font-family: monospace;
    font-size: ${(props) => props.theme.font.size.xs};
    word-break: break-all;
  }

  .spec-load-error {
    color: ${(props) => props.theme.colors.text.danger};
  }

  .empty-state {
    color: ${(props) => props.theme.colors.text.muted};
    text-align: center;
  }
`;

export default StyledWrapper;
