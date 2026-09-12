import type { Locale } from './schema'

/**
 * Wall-clock time in a named zone, without a library (N-69, N-72).
 *
 * A premiere is set as "14 November, seven in the evening, where the couple is". Turning that
 * into an instant needs the zone's offset *at that wall time*, which `Intl` can report even
 * though it cannot convert directly: format a guess in the zone, measure how far the zone's
 * clock is from UTC, and correct. Two passes settle the hour either side of a DST change.
 */

/** Zones offered in the console: where Indian weddings and their diaspora guests are. */
export const TIMEZONES: readonly { id: string; label: string }[] = [
  { id: 'Asia/Kolkata', label: 'India (IST)' },
  { id: 'Asia/Dubai', label: 'Dubai (GST)' },
  { id: 'Asia/Singapore', label: 'Singapore (SGT)' },
  { id: 'Asia/Kathmandu', label: 'Nepal (NPT)' },
  { id: 'Asia/Dhaka', label: 'Bangladesh (BST)' },
  { id: 'Asia/Colombo', label: 'Sri Lanka (IST)' },
  { id: 'Europe/London', label: 'London (GMT/BST)' },
  { id: 'Europe/Paris', label: 'Paris, Berlin (CET)' },
  { id: 'America/New_York', label: 'New York, Toronto (ET)' },
  { id: 'America/Chicago', label: 'Chicago, Dallas (CT)' },
  { id: 'America/Los_Angeles', label: 'San Francisco, Vancouver (PT)' },
  { id: 'Australia/Sydney', label: 'Sydney, Melbourne (AET)' },
]

export const DEFAULT_TIMEZONE = 'Asia/Kolkata'

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone })
    return true
  } catch {
    return false
  }
}

function partsIn(timeZone: string, at: number): Record<string, number> {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(at))
  const out: Record<string, number> = {}
  for (const part of parts) if (part.type !== 'literal') out[part.type] = Number(part.value)
  return out
}

/** Milliseconds the zone's clock is ahead of UTC at `at`. */
function offsetAt(timeZone: string, at: number): number {
  const p = partsIn(timeZone, at)
  const wall = Date.UTC(p.year!, p.month! - 1, p.day!, p.hour! % 24, p.minute!, p.second!)
  return wall - at
}

/** `2026-11-14` + `19:00` in `Asia/Kolkata` → `2026-11-14T13:30:00.000Z`. */
export function zonedTimeToUtc(date: string, time: string, timeZone: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const [hh = 0, mm = 0] = time.split(':').map(Number)
  const wall = Date.UTC(y!, m! - 1, d!, hh, mm)
  let utc = wall - offsetAt(timeZone, wall)
  utc = wall - offsetAt(timeZone, utc)
  return new Date(utc).toISOString()
}

/** The wall-clock date and time an instant has in a zone, for a form's two inputs. */
export function wallTimeIn(iso: string, timeZone: string): { date: string; time: string } {
  const p = partsIn(timeZone, Date.parse(iso))
  const pad = (n: number) => String(n).padStart(2, '0')
  return { date: `${p.year}-${pad(p.month!)}-${pad(p.day!)}`, time: `${pad(p.hour! % 24)}:${pad(p.minute!)}` }
}

/** "Saturday, 14 November 2026 at 7:00 pm IST", in the guest's language and the couple's zone. */
export function formatInZone(iso: string, timeZone: string, locale: Locale): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(locale === 'hi' ? 'hi-IN' : 'en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
    timeZoneName: 'short',
  }).format(date)
}
