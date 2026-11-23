// Prayer time calculation (the praytimes.org method), no dependencies.
// Returns absolute instants, so the computer's own time zone only affects display.

const rad = (d) => (d * Math.PI) / 180
const deg = (r) => (r * 180) / Math.PI
const sin = (d) => Math.sin(rad(d))
const cos = (d) => Math.cos(rad(d))
const tan = (d) => Math.tan(rad(d))
const asin = (x) => deg(Math.asin(x))
const acos = (x) => deg(Math.acos(x))
const atan2 = (y, x) => deg(Math.atan2(y, x))
const acot = (x) => deg(Math.atan(1 / x))
const fix = (a, b) => { a = a - b * Math.floor(a / b); return a < 0 ? a + b : a }

// Twilight angles per method. isha may instead be minutes after maghrib.
export const METHODS = {
  // Kemenag's published tables sit about a minute later at dhuhr and maghrib (checked against Jakarta 2026).
  kemenag: { name: 'Kemenag (Indonesia)', fajr: 20, isha: 18, dhuhrExtra: 1, maghribExtra: 1 },
  jakim: { name: 'JAKIM (Malaysia)', fajr: 20, isha: 18 },
  muis: { name: 'MUIS (Singapore)', fajr: 20, isha: 18 },
  mwl: { name: 'Muslim World League', fajr: 18, isha: 17 },
  egypt: { name: 'Egyptian General Authority', fajr: 19.5, isha: 17.5 },
  isna: { name: 'ISNA (North America)', fajr: 15, isha: 15 },
  makkah: { name: 'Umm al-Qura (Makkah)', fajr: 18.5, ishaMinutes: 90 }
}

function julian(y, m, d) {
  if (m <= 2) { y -= 1; m += 12 }
  const A = Math.floor(y / 100)
  const B = 2 - A + Math.floor(A / 4)
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5
}

function sunPosition(jd) {
  const D = jd - 2451545.0
  const g = fix(357.529 + 0.98560028 * D, 360)
  const q = fix(280.459 + 0.98564736 * D, 360)
  const L = fix(q + 1.915 * sin(g) + 0.02 * sin(2 * g), 360)
  const e = 23.439 - 0.00000036 * D
  const RA = atan2(cos(e) * sin(L), cos(L)) / 15
  return { decl: asin(sin(e) * sin(L)), eqt: q / 15 - fix(RA, 24) }
}

/**
 * @param {Date} date  any instant on the wanted calendar day (local date is used)
 * @param {{lat:number,lng:number,method?:string,asr?:'shafii'|'hanafi',ihtiyat?:number,imsakMinutes?:number}} o
 * @returns {Record<'imsak'|'fajr'|'sunrise'|'dhuhr'|'asr'|'maghrib'|'isha', Date>}
 */
export function prayerTimes(date, o) {
  const { lat, lng } = o
  const m = METHODS[o.method] ?? METHODS.kemenag
  const shadow = o.asr === 'hanafi' ? 2 : 1
  const ihtiyat = o.ihtiyat ?? 2
  const jDate = julian(date.getFullYear(), date.getMonth() + 1, date.getDate()) - lng / (15 * 24)

  const midDay = (t) => fix(12 - sunPosition(jDate + t).eqt, 24)
  const angleTime = (angle, t, ccw) => {
    const { decl } = sunPosition(jDate + t)
    const noon = midDay(t)
    const T = acos((-sin(angle) - sin(decl) * sin(lat)) / (cos(decl) * cos(lat))) / 15
    return noon + (ccw ? -T : T)
  }
  const asrTime = (t) => {
    const { decl } = sunPosition(jDate + t)
    return angleTime(-acot(shadow + tan(Math.abs(lat - decl))), t, false)
  }

  // Two passes: estimate, then recompute the sun's position at each estimate.
  let h = { fajr: 5, sunrise: 6, dhuhr: 12, asr: 13, sunset: 18, isha: 18 }
  for (let i = 0; i < 2; i++) {
    const p = Object.fromEntries(Object.entries(h).map(([k, v]) => [k, v / 24]))
    h = {
      fajr: angleTime(m.fajr, p.fajr, true),
      sunrise: angleTime(0.833, p.sunrise, true),
      dhuhr: midDay(p.dhuhr),
      asr: asrTime(p.asr),
      sunset: angleTime(0.833, p.sunset, false),
      isha: m.ishaMinutes ? h.sunset : angleTime(m.isha, p.isha, false)
    }
    // High latitudes (e.g. Europe in summer): the sun never gets 18-20° below the horizon, so
    // fajr/isha are NaN or absurdly far from sunrise/sunset. Cap them at angle/60 of the night
    // (praytimes.org "AngleBased"); never triggers in the tropics.
    const night = 24 - (h.sunset - h.sunrise)
    const fajrMax = (m.fajr / 60) * night
    if (!(h.sunrise - h.fajr <= fajrMax)) h.fajr = h.sunrise - fajrMax
    if (!m.ishaMinutes) {
      const ishaMax = (m.isha / 60) * night
      if (!(h.isha - h.sunset <= ishaMax)) h.isha = h.sunset + ishaMax
    }
  }
  if (m.ishaMinutes) h.isha = h.sunset + m.ishaMinutes / 60
  for (const [k, v] of Object.entries(h)) if (!Number.isFinite(v)) throw new Error(`Cannot compute ${k} at latitude ${lat}`)

  // Hours above are UTC-based local solar hours of the given day, shifted by longitude.
  const base = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  const at = (hours, addMin, round) => {
    const ms = base + (hours - lng / 15) * 3600e3 + addMin * 60e3
    const minute = 60e3
    return new Date(round === 'down' ? Math.floor(ms / minute) * minute : Math.ceil(ms / minute) * minute)
  }
  const fajr = at(h.fajr, ihtiyat)
  return {
    imsak: new Date(fajr.getTime() - (o.imsakMinutes ?? 10) * 60e3),
    fajr,
    sunrise: at(h.sunrise, -ihtiyat, 'down'),
    dhuhr: at(h.dhuhr, ihtiyat + (m.dhuhrExtra ?? 0)),
    asr: at(h.asr, ihtiyat),
    maghrib: at(h.sunset, ihtiyat + (m.maghribExtra ?? 0)),
    isha: at(h.isha, ihtiyat + (m.ishaMinutes ? m.maghribExtra ?? 0 : 0))
  }
}
