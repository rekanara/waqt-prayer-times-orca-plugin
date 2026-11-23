// Waqt worker. Orca keeps it running while the plugin is enabled because the plugin
// has a status bar item, so it can tick on its own. Everything is computed offline.
import { prayerTimes, METHODS } from './praytimes.mjs'
import { CITIES } from './cities.mjs'

const TICK_MS = 20_000
const WINDOW_MIN = 15 // how long "Waktu X" stays in the status bar after a prayer begins
const LATE_GRACE_MS = 3 * 60_000 // a missed notification older than this is skipped, not sent late

const T = {
  id: {
    names: { imsak: 'Imsak', fajr: 'Subuh', sunrise: 'Terbit', dhuhr: 'Dzuhur', asr: 'Ashar', maghrib: 'Maghrib', isha: 'Isya' },
    friday: 'Jumat',
    min: (n) => `${n} mnt`, hr: (h, m) => (m ? `${h} j ${m} mnt` : `${h} jam`),
    left: (x) => `${x} lagi`,
    timeOf: (p) => `Waktu ${p}`,
    atTitle: (p) => `Waktu ${p}`,
    atBody: (p, t, place) => `Sudah masuk waktu ${p} (${t}) untuk ${place}.`,
    preTitle: (n, p) => `${n} menit lagi ${p}`,
    preBody: (p, t, place) => `${p} pukul ${t} untuk ${place}.`,
    imsakTitle: 'Waktu imsak',
    imsakBody: (i, f) => `Imsak pukul ${i}, Subuh ${f}.`,
    sunriseTitle: (n) => `Subuh berakhir ${n} menit lagi`,
    sunriseBody: (t, place) => `Matahari terbit pukul ${t} di ${place}.`,
    fridayTitle: (n) => `Jumatan ${n} menit lagi`,
    fridayBody: (t, place) => `Jumat pukul ${t} di ${place}. Saatnya bersiap ke masjid.`,
    heading: (place, date) => `Jadwal sholat ${place}, ${date}`,
    next: (p, t, x) => `Berikutnya: ${p} ${t} (${x} lagi)`,
    locale: 'id-ID'
  },
  en: {
    names: { imsak: 'Imsak', fajr: 'Fajr', sunrise: 'Sunrise', dhuhr: 'Dhuhr', asr: 'Asr', maghrib: 'Maghrib', isha: 'Isha' },
    friday: "Jumu'ah",
    min: (n) => `${n} min`, hr: (h, m) => (m ? `${h} h ${m} min` : `${h} h`),
    left: (x) => `${x} left`,
    timeOf: (p) => `${p} time`,
    atTitle: (p) => `It's time for ${p}`,
    atBody: (p, t, place) => `${p} began at ${t} in ${place}.`,
    preTitle: (n, p) => `${p} in ${n} minutes`,
    preBody: (p, t, place) => `${p} at ${t} in ${place}.`,
    imsakTitle: 'Imsak',
    imsakBody: (i, f) => `Imsak at ${i}, Fajr at ${f}.`,
    sunriseTitle: (n) => `Fajr ends in ${n} minutes`,
    sunriseBody: (t, place) => `Sunrise is at ${t} in ${place}.`,
    fridayTitle: (n) => `Jumu'ah in ${n} minutes`,
    fridayBody: (t, place) => `Jumu'ah at ${t} in ${place}. Time to get ready for the mosque.`,
    heading: (place, date) => `Prayer times for ${place}, ${date}`,
    next: (p, t, x) => `Next: ${p} at ${t} (${x} left)`,
    locale: 'en-GB'
  }
}

function pickLanguage(setting) {
  if (setting === 'id' || setting === 'en') return setting
  const locale = (Intl.DateTimeFormat().resolvedOptions().locale || process.env.LANG || '').toLowerCase()
  return /^(id|ms|in)\b/.test(locale) ? 'id' : 'en'
}
const PRAYERS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha']
const ORDER = ['imsak', 'fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha']

const pad = (n) => String(n).padStart(2, '0')
const hhmm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const label = (t, key, date) => (key === 'dhuhr' && date.getDay() === 5 ? t.friday : t.names[key])

function untilText(t, ms) {
  const min = Math.max(0, Math.ceil(ms / 60_000))
  return min < 60 ? t.min(min) : t.hr(Math.floor(min / 60), min % 60)
}

/**
 * Every notification Waqt could send for the given days, as { id, at: Date, title, body }.
 * Ids are stable per day, so the caller can remember which ones it already sent.
 * @param {Array<[Record<string, Date>, Date]>} days  [prayer times, a Date on that day]
 */
export function notificationEvents(cfg, days) {
  const L = T[cfg.lang]
  const place = cfg.place.name
  const events = []
  const add = (id, at, title, body) => events.push({ id, at, title, body })
  for (const [t, d] of days) {
    const day = dayKey(d)
    const friday = d.getDay() === 5 && cfg.fridayRemind > 0
    for (const key of PRAYERS) {
      if (!cfg.prayers[key]) continue
      const name = label(L, key, d)
      if (cfg.notifyAtTime) add(`${day}-${key}-at`, t[key], L.atTitle(name), L.atBody(name, hhmm(t[key]), place))
      // On Friday the Jumu'ah reminder below takes the place of the regular Dhuhr one.
      if (cfg.remindBefore > 0 && !(friday && key === 'dhuhr')) {
        add(`${day}-${key}-pre`, new Date(t[key] - cfg.remindBefore * 60_000), L.preTitle(cfg.remindBefore, name), L.preBody(name, hhmm(t[key]), place))
      }
    }
    if (friday) add(`${day}-jumuah-pre`, new Date(t.dhuhr - cfg.fridayRemind * 60_000), L.fridayTitle(cfg.fridayRemind), L.fridayBody(hhmm(t.dhuhr), place))
    if (cfg.remindSunrise > 0) add(`${day}-sunrise-pre`, new Date(t.sunrise - cfg.remindSunrise * 60_000), L.sunriseTitle(cfg.remindSunrise), L.sunriseBody(hhmm(t.sunrise), place))
    if (cfg.showImsak) add(`${day}-imsak-at`, t.imsak, L.imsakTitle, L.imsakBody(hhmm(t.imsak), hhmm(t.fajr)))
  }
  return events
}

export default function activate(orca) {
  const fired = new Set()
  let timer = null
  let lastStatus = ''

  async function readConfig() {
    let s = {}
    try {
      s = (await orca.host.call('settings.get', {})).settings ?? {}
    } catch {}
    const city = CITIES[s.city] ? s.city : s.city === 'custom' ? 'custom' : 'jakarta'
    let place
    if (city === 'custom') {
      const lat = Number(s.latitude)
      const lng = Number(s.longitude)
      const ok = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 66 && Math.abs(lng) <= 180
      place = ok ? { name: `${lat.toFixed(3)}, ${lng.toFixed(3)}`, lat, lng } : { name: 'Jakarta', lat: CITIES.jakarta[1], lng: CITIES.jakarta[2] }
    } else {
      const [name, lat, lng] = CITIES[city]
      place = { name, lat, lng }
    }
    return {
      place,
      method: METHODS[s.method] ? s.method : 'kemenag',
      asr: s.asr === 'hanafi' ? 'hanafi' : 'shafii',
      ihtiyat: Number.isInteger(s.ihtiyat) ? s.ihtiyat : 2,
      lang: pickLanguage(s.language),
      remindBefore: Number.isInteger(s.remindBefore) ? s.remindBefore : 10,
      notifyAtTime: s.notifyAtTime !== false,
      showImsak: s.showImsak === true,
      prayers: {
        fajr: s.notifyFajr !== false,
        dhuhr: s.notifyDhuhr !== false,
        asr: s.notifyAsr !== false,
        maghrib: s.notifyMaghrib !== false,
        isha: s.notifyIsha !== false
      },
      remindSunrise: Number.isInteger(s.remindSunrise) ? s.remindSunrise : 15,
      fridayRemind: Number.isInteger(s.fridayRemind) ? s.fridayRemind : 30
    }
  }

  function dayTimes(cfg, date) {
    return prayerTimes(date, {
      lat: cfg.place.lat,
      lng: cfg.place.lng,
      method: cfg.method,
      asr: cfg.asr,
      ihtiyat: cfg.ihtiyat
    })
  }

  function buildSchedule(cfg, now = new Date()) {
    const t = T[cfg.lang]
    const tomorrowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 12)
    const today = dayTimes(cfg, now)
    const tomorrow = dayTimes(cfg, tomorrowDate)
    const rows = (x, d) => ORDER.map((key) => ({ key, label: label(t, key, d), time: hhmm(x[key]), at: x[key].getTime() }))

    const upcoming = [...PRAYERS.map((k) => ({ key: k, at: today[k], date: now })), ...PRAYERS.map((k) => ({ key: k, at: tomorrow[k], date: tomorrowDate }))]
    const next = upcoming.find((p) => p.at > now)
    const current = [...PRAYERS].reverse().map((k) => ({ key: k, at: today[k] })).find((p) => p.at <= now) ?? null
    return {
      place: cfg.place.name,
      method: METHODS[cfg.method].name,
      now: now.getTime(),
      today: rows(today, now),
      tomorrow: rows(tomorrow, tomorrowDate),
      next: next && { key: next.key, label: label(t, next.key, next.date), time: hhmm(next.at), at: next.at.getTime() },
      current: current && { key: current.key, label: label(t, current.key, now), at: current.at.getTime() },
      lang: cfg.lang,
      _today: today,
      _tomorrow: tomorrow
    }
  }

  async function notify(title, body) {
    try {
      await orca.host.call('notifications.show', { title, body })
    } catch (e) {
      orca.log(`notification failed: ${e.message}`)
    }
  }

  async function checkNotifications(cfg, sched, now) {
    const events = notificationEvents(cfg, [[sched._today, new Date(now)], [sched._tomorrow, new Date(now + 86_400_000)]])
    for (const ev of events) {
      const late = now - ev.at
      if (late < 0 || fired.has(ev.id)) continue
      fired.add(ev.id)
      if (late <= LATE_GRACE_MS) await notify(ev.title, ev.body)
    }
    if (fired.size > 200) for (const id of [...fired].slice(0, 100)) fired.delete(id)
  }

  async function updateStatusBar(sched, now) {
    const t = T[sched.lang]
    let text, tone
    const cur = sched.current
    if (cur && now - cur.at < WINDOW_MIN * 60_000) {
      text = t.timeOf(cur.label)
      tone = 'success'
    } else if (sched.next) {
      const left = sched.next.at - now
      text = left <= 60 * 60_000 ? `${sched.next.label} ${sched.next.time}, ${t.left(untilText(t, left))}` : `${sched.next.label} ${sched.next.time}`
      tone = left <= 10 * 60_000 ? 'warning' : 'neutral'
    } else {
      text = 'Waqt'
      tone = 'neutral'
    }
    const tooltip = `${sched.place}: ` + sched.today.filter((r) => PRAYERS.includes(r.key)).map((r) => `${r.label} ${r.time}`).join(', ')
    const key = `${text}|${tone}|${tooltip}`
    if (key === lastStatus) return
    lastStatus = key
    try {
      await orca.host.call('statusBar.update', { id: 'next-prayer', text, tone, tooltip, visible: true })
    } catch (e) {
      orca.log(`status bar update failed: ${e.message}`)
    }
  }

  const publicView = ({ _today, _tomorrow, ...rest }) => rest

  async function tick() {
    try {
      const now = new Date()
      const cfg = await readConfig()
      const sched = buildSchedule(cfg, now)
      await updateStatusBar(sched, now.getTime())
      await checkNotifications(cfg, sched, now.getTime())
      orca.panels.post('waqt.tick', publicView(sched))
    } catch (e) {
      orca.log(`tick failed: ${e.stack || e.message}`)
    }
  }

  orca.panels.handle('waqt.schedule', async () => publicView(buildSchedule(await readConfig())))

  orca.commands.register('waqt.today', async () => {
    const cfg = await readConfig()
    const t = T[cfg.lang]
    const sched = buildSchedule(cfg)
    const lines = sched.today.map((r) => `${r.label.padEnd(8)} ${r.time}`)
    const head = t.heading(sched.place, new Date().toLocaleDateString(t.locale, { weekday: 'long', day: 'numeric', month: 'long' }))
    const next = sched.next ? `\n${t.next(sched.next.label, sched.next.time, untilText(t, sched.next.at - Date.now()))}` : ''
    return `${head}\n\n${lines.join('\n')}${next}`
  })

  // Mark everything already past as sent, so enabling the plugin never fires a burst.
  readConfig().then((cfg) => {
    const now = Date.now()
    const sched = buildSchedule(cfg)
    for (const ev of notificationEvents(cfg, [[sched._today, new Date(now)]])) {
      if (now - ev.at > LATE_GRACE_MS) fired.add(ev.id)
    }
    tick()
    timer = setInterval(tick, TICK_MS)
  })

  return { dispose: () => timer && clearInterval(timer) }
}
