import styled from 'styled-components';

const Wrapper = styled.div`
  div.title {
    color: ${(props) => props.theme.colors.text.subtext0};
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-weight: 500;
    table-layout: fixed;

    thead,
    td {
      border: 1px solid ${(props) => props.theme.table.border};
    }

    thead {
      color: ${(props) => props.theme.table.thead.color};
      font-size: ${(props) => props.theme.font.size.base};
      user-select: none;
    }
    td {
      padding: 6px 10px;
    }
  }

  td {
    &:nth-child(1) {
      padding: 0 0 0 8px;
    }
  }

  .btn-action {
    font-size: ${(props) => props.theme.font.size.base};
    &:hover span {
      text-decoration: underline;
    }
  }

  .spec-param-cell {
    display: flex;
    align-items: center;
    flex: 1 1 auto;
    min-width: 0;
  }

  .spec-param-icon {
    flex: none;
    margin-left: 4px;
    color: ${(props) => props.theme.colors.text.muted};
    cursor: pointer;
  }

  .spec-missing-required {
    color: ${(props) => props.theme.colors.text.muted};
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

  .bulk-edit-bar {
    position: sticky;
    bottom: 0;
    background: ${(props) => props.theme.bg};
    padding-top: 8px;
    padding-bottom: 4px;
  }

  input[type='text'] {
    width: 100%;
    border: solid 1px transparent;
    outline: none !important;
    background-color: inherit;

    &:focus {
      outline: none !important;
      border: solid 1px transparent;
    }
  }

  input[type='checkbox'] {
    cursor: pointer;
    position: relative;
    top: 1px;
  }
`;

export default Wrapper;
