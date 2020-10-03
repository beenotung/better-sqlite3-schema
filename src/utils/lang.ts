export function toSingular(word: string): string {
  if (word.endsWith('ies')) {
    return word.replace(/ies$/, 'y')
  }
  const last = word.length - 1
  if (word[last] === 's') {
    return word.substring(0, last)
  }
  return word
}
