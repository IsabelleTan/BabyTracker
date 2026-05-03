export function cn(...inputs: unknown[]): string {
  return inputs.filter((x): x is string => typeof x === 'string').join(' ')
}
