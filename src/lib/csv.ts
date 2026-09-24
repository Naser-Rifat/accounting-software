/** RFC 4180 CSV: wrap in quotes and double any quote inside. Pure. */
export type CsvRow = (string | number | null | undefined)[]

export function toCsv(rows: CsvRow[]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const value = cell === null || cell === undefined ? '' : String(cell)
          return /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
        })
        .join(','),
    )
    .join('\r\n')
}
