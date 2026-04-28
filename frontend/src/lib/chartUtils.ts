export function niceStep(max: number): number {
  if (max === 0) return 1
  if (max <= 5) return 1
  if (max <= 10) return 2
  const rough = max / 4
  const exp = Math.floor(Math.log10(rough))
  const pow = Math.pow(10, exp)
  const n = rough / pow
  if (n < 1.5) return pow
  if (n < 3.5) return 2 * pow
  if (n < 7.5) return 5 * pow
  return 10 * pow
}

export function computeYTicksMulti(
  data: Record<string, unknown>[],
  dataKeys: string[],
  tickStep?: number,
): { ticks: number[]; domain: [number, number] } {
  const values = data
    .flatMap((d) => dataKeys.map((k) => d[k] as number | null | undefined))
    .filter((v): v is number => v != null && !isNaN(v))
  const max = values.length > 0 ? Math.max(...values) : 0
  const step = tickStep ?? niceStep(max)
  const domainMax = Math.ceil(max / step) * step || step
  const ticks: number[] = []
  for (let t = 0; t <= domainMax; t += step) ticks.push(t)
  return { ticks, domain: [0, domainMax] }
}

export function computeXTicks(data: Record<string, unknown>[], maxLabels = 7): string[] {
  const n = data.length
  if (n === 0) return []
  const dates = data.map((d) => d.date as string)
  if (n <= maxLabels + 1) return dates
  const indices = new Set<number>()
  for (let i = 0; i < maxLabels; i++) indices.add(Math.round((i * (n - 1)) / (maxLabels - 1)))
  return [...indices].sort((a, b) => a - b).map((i) => dates[i])
}

export function computeYTicks(
  data: Record<string, unknown>[],
  dataKey: string,
  tickStep?: number,
): { ticks: number[]; domain: [number, number] } {
  const values = data
    .map((d) => d[dataKey] as number | null | undefined)
    .filter((v): v is number => v != null && !isNaN(v))
  const max = values.length > 0 ? Math.max(...values) : 0
  const step = tickStep ?? niceStep(max)
  const domainMax = Math.ceil(max / step) * step || step
  const ticks: number[] = []
  for (let t = 0; t <= domainMax; t += step) ticks.push(t)
  return { ticks, domain: [0, domainMax] }
}

