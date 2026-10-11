"use client";

import { useId, type ReactNode } from "react";
import styles from "./table.module.css";

export interface StTableColumn<T> {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
}

/** Dense comparisons stay open on paper; phone scrolling is bounded to the table. */
export function StTable<T>({ label, columns, rows, rowKey }: {
  label: string;
  columns: readonly StTableColumn<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string;
}) {
  const id = useId();
  return <div className={styles.scroll} role="region" aria-labelledby={id} tabIndex={0}>
    <table className={styles.table}>
      <caption id={id} className="sr-only">{label}</caption>
      <thead><tr>{columns.map(column => <th key={column.key} scope="col">{column.label}</th>)}</tr></thead>
      <tbody>{rows.map(row => <tr key={rowKey(row)}>{columns.map((column, index) => index === 0
        ? <th key={column.key} scope="row">{column.render(row)}</th>
        : <td key={column.key}>{column.render(row)}</td>)}</tr>)}</tbody>
    </table>
  </div>;
}
