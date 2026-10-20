/** Pure date helpers of the calendar screen (local calendar days, weeks start on Monday as in Turkey). */

export const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
export const WEEKDAYS = ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz']

export const pad = (n: number) => String(n).padStart(2, '0')
export const monthKey = (year: number, month: number) => `${year}-${pad(month)}`
export const dayKey = (year: number, month: number, day: number) => `${year}-${pad(month)}-${pad(day)}`

export function parseMonth(key: string | null | undefined): { year: number; month: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(key ?? '')
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  return month >= 1 && month <= 12 && year >= 1900 && year <= 2100 ? { year, month } : null
}

export function parseDay(key: string | null | undefined): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key ?? '')
  if (!m) return null
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])]
  return month >= 1 && month <= 12 && day >= 1 && day <= daysIn(year, month) ? { year, month, day } : null
}

export function daysIn(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** 0 = Monday ... 6 = Sunday */
export function weekdayOf(year: number, month: number, day: number): number {
  return (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7
}

/** The month as weeks of 7 cells; null for the cells before the 1st and after the last day. */
export function monthGrid(year: number, month: number): (number | null)[][] {
  const cells: (number | null)[] = Array(weekdayOf(year, month, 1)).fill(null)
  for (let d = 1; d <= daysIn(year, month); d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)
  const weeks: (number | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

export function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const index = year * 12 + (month - 1) + delta
  return { year: Math.floor(index / 12), month: (index % 12) + 1 }
}

/** The nearest month with photos before / after the given one, from the list of months that have photos. */
export function nearestMonth(months: readonly string[], current: string, dir: -1 | 1): string | null {
  const sorted = [...months].sort()
  if (dir < 0) return [...sorted].reverse().find((m) => m < current) ?? null
  return sorted.find((m) => m > current) ?? null
}

/** 0..4 strength of a day in the year view, relative to the busiest day of that year. */
export function intensity(count: number, max: number): number {
  if (count <= 0 || max <= 0) return 0
  return Math.min(4, Math.max(1, Math.ceil((count / max) * 4)))
}

export function longDate(key: string): string {
  const d = parseDay(key)
  if (!d) return key
  const names = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar']
  return `${d.day} ${MONTHS[d.month - 1]} ${d.year}, ${names[weekdayOf(d.year, d.month, d.day)]}`
}

/** "1 yıl önce bugün" */
export function yearsAgoLabel(n: number): string {
  return `${n} yıl önce bugün`
}

/** "Tanışma günümüz · 3. yıl" */
export function occurrenceLabel(title: string, yearly: boolean, years: number): string {
  return yearly && years > 0 ? `${title} · ${years}. yıl` : title
}

/** Today as YYYY-MM-DD in the device's time zone. */
export function todayKey(now: Date = new Date()): string {
  return dayKey(now.getFullYear(), now.getMonth() + 1, now.getDate())
}

/** Local date + time inputs -> ISO instant (the device's time zone). */
export function toInstant(date: string, time: string): string | null {
  const d = parseDay(date)
  const t = /^(\d{2}):(\d{2})$/.exec(time)
  if (!d || !t) return null
  return new Date(d.year, d.month - 1, d.day, Number(t[1]), Number(t[2])).toISOString()
}

/** ISO instant -> local date and time inputs */
export function fromInstant(iso: string): { date: string; time: string } {
  const d = new Date(iso)
  return { date: dayKey(d.getFullYear(), d.getMonth() + 1, d.getDate()), time: `${pad(d.getHours())}:${pad(d.getMinutes())}` }
}
