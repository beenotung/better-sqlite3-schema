export function toCamelCase(table: string): string {
  return table
    .split('_')
    .map(word => word[0].toUpperCase() + word.substring(1))
    .join('')
}
