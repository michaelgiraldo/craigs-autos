export function createTextElement<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  text: string,
  className?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tagName);
  element.textContent = text;
  if (className) {
    element.className = className;
  }
  return element;
}

export function createButton(label: string, className: string | null = null): HTMLButtonElement {
  const button = document.createElement('button');
  button.textContent = label;
  if (className) {
    button.className = className;
  }
  return button;
}

export function appendTextCell(row: HTMLTableRowElement, text: string): HTMLTableCellElement {
  const cell = document.createElement('td');
  cell.textContent = text;
  row.appendChild(cell);
  return cell;
}

export function appendStackedTextCell(
  row: HTMLTableRowElement,
  primary: string,
  secondary?: string,
): HTMLTableCellElement {
  const cell = document.createElement('td');
  cell.append(primary);

  if (secondary) {
    cell.appendChild(document.createElement('br'));
    cell.appendChild(createTextElement('span', secondary, 'muted'));
  }

  row.appendChild(cell);
  return cell;
}

export function createBadge(label: string, positive: boolean): HTMLSpanElement {
  return createTextElement('span', label, `badge ${positive ? 'badge--yes' : 'badge--no'}`);
}

export function createEmptyRow(columns: number, message: string): HTMLTableRowElement {
  const row = document.createElement('tr');
  const cell = createTextElement('td', message, 'muted');
  cell.colSpan = columns;
  row.appendChild(cell);
  return row;
}

export function createTable(headers: string[]): HTMLTableElement {
  const table = document.createElement('table');
  table.className = 'admin-table';

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  for (const label of headers) {
    headerRow.appendChild(createTextElement('th', label));
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);

  return table;
}
