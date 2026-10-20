import type { MediaDto } from './albums'
import { api } from './client'

export type SpecialIcon = 'heart' | 'ring' | 'cake' | 'plane' | 'star' | 'home'

export interface SpecialDay {
  id: string
  title: string
  /** YYYY-MM-DD, the first (or only) occurrence */
  day: string
  icon: SpecialIcon
  yearly: boolean
}

export interface Occurrence {
  id: string
  title: string
  icon: SpecialIcon
  date: string
  yearly: boolean
  /** years since the first occurrence (0 on the day itself) */
  years: number
}

export interface DayNote {
  authorId: string
  authorName: string
  body: string
  updatedAt: string
  /** written by me (editable); the partner's note is read-only */
  mine: boolean
}

export interface DaySummary {
  date: string
  /** photos / videos (a day can have only notes) */
  count: number
  notes: number
  uncertain: boolean
  cover: { id: string; type: 'IMAGE' | 'VIDEO'; thumbUrl: string | null } | null
}

export interface MonthView {
  month: string
  days: DaySummary[]
  specialDays: Occurrence[]
}

export interface YearView {
  year: number
  days: Record<string, number>
  specialDays: Occurrence[]
  noteDays: string[]
}

export interface DayMedia {
  media: MediaDto
  albumTitle: string | null
}

export interface DayView {
  date: string
  media: DayMedia[]
  specialDays: Occurrence[]
  notes: DayNote[]
}

export interface PastDay {
  yearsAgo: number
  date: string
  count: number
  media: DayMedia[]
  notes: DayNote[]
}

export interface OnThisDay {
  date: string
  past: PastDay[]
  specialDays: Occurrence[]
}

const q = (albumId?: string | null) => (albumId ? `&albumId=${albumId}` : '')

export const calendarMonths = (albumId?: string | null) =>
  api<{ month: string; count: number }[]>(`/api/calendar/months?${albumId ? `albumId=${albumId}` : ''}`)
export const calendarMonth = (month: string, albumId?: string | null) => api<MonthView>(`/api/calendar/month?month=${month}${q(albumId)}`)
export const calendarYear = (year: number, albumId?: string | null) => api<YearView>(`/api/calendar/year?year=${year}${q(albumId)}`)
export const calendarDay = (date: string, albumId?: string | null) => api<DayView>(`/api/calendar/day?date=${date}${q(albumId)}`)
export const onThisDay = (albumId?: string | null) => api<OnThisDay>(`/api/calendar/on-this-day?${albumId ? `albumId=${albumId}` : ''}`)

export const listSpecialDays = () => api<SpecialDay[]>('/api/special-days')
export const createSpecialDay = (d: Omit<SpecialDay, 'id'>) => api<SpecialDay>('/api/special-days', { method: 'POST', body: d })
export const updateSpecialDay = (id: string, d: Omit<SpecialDay, 'id'>) => api<SpecialDay>(`/api/special-days/${id}`, { method: 'PUT', body: d })
export const deleteSpecialDay = (id: string) => api<void>(`/api/special-days/${id}`, { method: 'DELETE' })

/** Saves my note of that day; an empty text removes it (then null comes back). */
export const saveDayNote = (date: string, body: string) =>
  api<DayNote | undefined>(`/api/day-notes/${date}`, { method: 'PUT', body: { body } }).then((n) => n ?? null)
