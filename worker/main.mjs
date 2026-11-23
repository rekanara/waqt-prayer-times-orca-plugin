// Waqt worker. Orca keeps it running while the plugin is enabled because the plugin
// has a status bar item, so it can tick on its own. Everything is computed offline.
import { prayerTimes, METHODS, qibla } from './praytimes.mjs'
import { CITIES, resolvePlace, methodFor, placeList } from './cities.mjs'
import { ZONES } from './zones.mjs'

const TICK_MS = 20_000
const WINDOW_MIN = 15 // how long "Waktu X" stays in the status bar after a prayer begins
const LATE_GRACE_MS = 3 * 60_000 // a missed notification older than this is skipped, not sent late
const REPORT_AFTER_MS = 20 * 60_000 // the after-prayer agent report comes this long after a prayer begins
const WARN_BEFORE_MS = 10 * 60_000 // the status bar turns urgent this close to a prayer

const T = {
  id: {
    names: { imsak: 'Imsak', fajr: 'Subuh', sunrise: 'Terbit', dhuha: 'Dhuha', dhuhr: 'Dzuhur', asr: 'Ashar', maghrib: 'Maghrib', isha: 'Isya' },
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
    agentsWaiting: (n, names) => `${n} workspace menunggu izinmu: ${names}.`,
    agentsWorking: (n) => `Agent masih bekerja di ${n} workspace.`,
    more: (n) => `+${n} lagi`,
    dhuhaTitle: 'Waktu Dhuha',
    dhuhaBody: (t) => `Sholat Dhuha bisa dimulai sejak ${t}.`,
    fastTitle: 'Besok puasa sunnah',
    fastBody: (why) => `Besok ${why}. Jangan lupa niat dan sahur.`,
    fast: { monday: 'Senin', thursday: 'Kamis', bidh: (d) => `Ayyamul Bidh (${d})`, arafah: 'hari Arafah', ashura: 'hari Asyura', tasua: "hari Tasu'a" },
    and: 'dan',
    reportTitle: (p) => `Selama ${p}`,
    reportDone: (n, names) => `${n} workspace selesai: ${names}.`,
    reportWorking: (n) => `${n} workspace masih bekerja.`,
    statusWaiting: (n) => `${n} agent menunggu`,
    heading: (place, date) => `Jadwal sholat ${place}, ${date}`,
    next: (p, t, x) => `Berikutnya: ${p} ${t} (${x} lagi)`,
    locale: 'id-ID'
  },
  en: {
    names: { imsak: 'Imsak', fajr: 'Fajr', sunrise: 'Sunrise', dhuha: 'Duha', dhuhr: 'Dhuhr', asr: 'Asr', maghrib: 'Maghrib', isha: 'Isha' },
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
    agentsWaiting: (n, names) => `${n} ${n === 1 ? 'workspace is' : 'workspaces are'} waiting for your approval: ${names}.`,
    agentsWorking: (n) => `Agents are still working in ${n} ${n === 1 ? 'workspace' : 'workspaces'}.`,
    more: (n) => `${n} more`,
    dhuhaTitle: 'Duha time',
    dhuhaBody: (t) => `Duha prayer can be offered from ${t}.`,
    fastTitle: 'Sunnah fast tomorrow',
    fastBody: (why) => `Tomorrow is ${why}. Remember your intention and suhoor.`,
    fast: { monday: 'Monday', thursday: 'Thursday', bidh: (d) => `one of the White Days (${d})`, arafah: 'the Day of Arafah', ashura: 'Ashura', tasua: "Tasu'a" },
    and: 'and',
    reportTitle: (p) => `While you prayed ${p}`,
    reportDone: (n, names) => `Finished in ${n} ${n === 1 ? 'workspace' : 'workspaces'}: ${names}.`,
    reportWorking: (n) => `Still working in ${n} ${n === 1 ? 'workspace' : 'workspaces'}.`,
    statusWaiting: (n) => `${n} agent${n === 1 ? '' : 's'} waiting`,
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
const ORDER = ['imsak', 'fajr', 'sunrise', 'dhuha', 'dhuhr', 'asr', 'maghrib', 'isha']

const pad = (n) => String(n).padStart(2, '0')
const TIME_FMT = new Map()
// "05:23" on a clock in `tz` (this computer's zone when tz is not given).
const hhmm = (d, tz) => {
  if (!TIME_FMT.has(tz)) TIME_FMT.set(tz, new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }))
  return TIME_FMT.get(tz).format(d)
}
const DAY_FMT = new Map()
/**
 * The calendar day it is in `tz` at `instant` (plus `add` days), as local noon on that date.
 * Everything day-based (prayerTimes, weekday, Hijri date, notification ids) reads a Date's
 * local fields, so this is how a city in another zone gets its own today.
 */
export function cityDay(instant, tz, add = 0) {
  if (!DAY_FMT.has(tz)) DAY_FMT.set(tz, new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric' }))
  const p = Object.fromEntries(DAY_FMT.get(tz).formatToParts(instant).map((x) => [x.type, x.value]))
  return new Date(Number(p.year), Number(p.month) - 1, Number(p.day) + add, 12)
}
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const label = (t, key, date) => (key === 'dhuhr' && date.getDay() === 5 ? t.friday : t.names[key])

const HIJRI_NUM = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', { day: 'numeric', month: 'numeric', year: 'numeric' })

/**
 * Hijri date of a calendar day (Umm al-Qura), shifted by `offset` days to follow a local
 * moon sighting such as Indonesia's isbat. `at` is the shifted Gregorian day, for formatting.
 */
export function hijriDate(date, offset = 0) {
  const at = new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset, 12)
  const n = Object.fromEntries(HIJRI_NUM.formatToParts(at).filter((p) => p.type !== 'literal').map((p) => [p.type, Number(p.value)]))
  return { day: n.day, month: n.month, year: n.year, at }
}

function untilText(t, ms) {
  const min = Math.max(0, Math.ceil(ms / 60_000))
  return min < 60 ? t.min(min) : t.hr(Math.floor(min / 60), min % 60)
}

const stateOf = (w) => w.status?.state
const BUSY = new Set(['working', 'permission'])

// "a, b, c, +2 lagi"
function nameList(L, names) {
  const shown = names.slice(0, 3)
  if (names.length > 3) shown.push(L.more(names.length - 3))
  return shown.join(', ')
}

/** Workspaces whose agents need a look, waiting for approval first: [{ id, name, state }]. */
export function activeAgents(workspaces) {
  const pick = (state) => workspaces.filter((w) => stateOf(w) === state).map((w) => ({ id: w.id, name: w.name, state }))
  return [...pick('permission'), ...pick('working')]
}

/**
 * One line about the user's Orca agents for a reminder, or '' when nothing is running.
 * Waiting for approval comes first: that is what to answer before stepping away to pray.
 * @param {{ id?: string, name: string, status?: { state: string } }[]} workspaces  from workspace.list
 */
export function agentSummary(L, workspaces) {
  const waiting = workspaces.filter((w) => stateOf(w) === 'permission').map((w) => w.name)
  const working = workspaces.filter((w) => stateOf(w) === 'working')
  return [
    waiting.length ? L.agentsWaiting(waiting.length, nameList(L, waiting)) : '',
    working.length ? L.agentsWorking(working.length) : ''
  ].filter(Boolean).join(' ')
}

/**
 * What happened to the user's agents while they prayed, or null when nothing ran.
 * @param {Set<string>} everWorking  ids of workspaces seen working since the prayer began
 */
export function prayerReport(L, prayerLabel, everWorking, workspaces) {
  const finished = workspaces.filter((w) => everWorking.has(w.id) && !BUSY.has(stateOf(w))).map((w) => w.name)
  const waiting = workspaces.filter((w) => stateOf(w) === 'permission').map((w) => w.name)
  const working = workspaces.filter((w) => stateOf(w) === 'working')
  if (!finished.length && !waiting.length && !working.length) return null
  const body = [
    finished.length ? L.reportDone(finished.length, nameList(L, finished)) : '',
    waiting.length ? L.agentsWaiting(waiting.length, nameList(L, waiting)) : '',
    working.length ? L.reportWorking(working.length) : ''
  ].filter(Boolean).join(' ')
  return { title: L.reportTitle(prayerLabel), body }
}

/**
 * Why `date` is a recommended (sunnah) fasting day, as labels; [] when it is not, or when
 * fasting is obligatory (Ramadan) or forbidden (Eid al-Fitr, Eid al-Adha and the tashriq days).
 */
export function sunnahFastReasons(L, date, hijriOffset = 0) {
  const h = hijriDate(date, hijriOffset)
  const forbidden = (h.month === 10 && h.day === 1) || (h.month === 12 && h.day >= 10 && h.day <= 13)
  if (h.month === 9 || forbidden) return []
  const why = []
  if (h.month === 12 && h.day === 9) why.push(L.fast.arafah)
  if (h.month === 1 && h.day === 9) why.push(L.fast.tasua)
  if (h.month === 1 && h.day === 10) why.push(L.fast.ashura)
  if (h.day >= 13 && h.day <= 15) {
    why.push(L.fast.bidh(new Intl.DateTimeFormat(`${L.locale}-u-ca-islamic-umalqura`, { day: 'numeric', month: 'long' }).format(h.at)))
  }
  if (date.getDay() === 1) why.push(L.fast.monday)
  if (date.getDay() === 4) why.push(L.fast.thursday)
  return why
}

/**
 * Every notification Waqt could send for the given days, as { id, at: Date, title, body }.
 * Ids are stable per day, so the caller can remember which ones it already sent.
 * @param {Array<[Record<string, Date>, Date]>} days  [prayer times, a Date on that day]
 */
export function notificationEvents(cfg, days) {
  const L = T[cfg.lang]
  const place = cfg.place.name
  const at = (d) => hhmm(d, cfg.place.tz)
  const events = []
  const add = (id, at, title, body) => events.push({ id, at, title, body })
  for (const [t, d] of days) {
    const day = dayKey(d)
    const friday = d.getDay() === 5 && cfg.fridayRemind > 0
    for (const key of PRAYERS) {
      if (!cfg.prayers[key]) continue
      const name = label(L, key, d)
      if (cfg.notifyAtTime) add(`${day}-${key}-at`, t[key], L.atTitle(name), L.atBody(name, at(t[key]), place))
      // On Friday the Jumu'ah reminder below takes the place of the regular Dhuhr one.
      if (cfg.remindBefore > 0 && !(friday && key === 'dhuhr')) {
        add(`${day}-${key}-pre`, new Date(t[key] - cfg.remindBefore * 60_000), L.preTitle(cfg.remindBefore, name), L.preBody(name, at(t[key]), place))
      }
    }
    if (friday) add(`${day}-jumuah-pre`, new Date(t.dhuhr - cfg.fridayRemind * 60_000), L.fridayTitle(cfg.fridayRemind), L.fridayBody(at(t.dhuhr), place))
    if (cfg.remindSunrise > 0) add(`${day}-sunrise-pre`, new Date(t.sunrise - cfg.remindSunrise * 60_000), L.sunriseTitle(cfg.remindSunrise), L.sunriseBody(at(t.sunrise), place))
    const ramadan = hijriDate(d, cfg.hijriOffset).month === 9
    if (cfg.imsak === 'always' || (cfg.imsak === 'ramadan' && ramadan)) {
      add(`${day}-imsak-at`, t.imsak, L.imsakTitle, L.imsakBody(at(t.imsak), at(t.fajr)))
    }
    if (cfg.remindDhuha) add(`${day}-dhuha-at`, t.dhuha, L.dhuhaTitle, L.dhuhaBody(at(t.dhuha)))
    // The evening before a sunnah fast, an hour after Isha: time to plan suhoor.
    if (cfg.sunnahFast) {
      const why = sunnahFastReasons(L, new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 12), cfg.hijriOffset)
      if (why.length) {
        const text = why.length > 1 ? `${why.slice(0, -1).join(', ')} ${L.and} ${why.at(-1)}` : why[0]
        add(`${day}-fast-eve`, new Date(t.isha.getTime() + 60 * 60_000), L.fastTitle, L.fastBody(text))
      }
    }
  }
  return events
}

export default function activate(orca) {
  const fired = new Set()
  let timer = null
  let lastStatus = ''
  let session = null // the prayer being watched for the after-prayer report
  let agentsLogged = false

  async function readConfig() {
    let s = {}
    try {
      s = (await orca.host.call('settings.get', {})).settings ?? {}
    } catch {}
    const p = resolvePlace(s)
    return {
      // "(auto)" tells the user this is a guess they can correct from the panel.
      place: { ...p, name: p.auto ? `${p.name} (auto)` : p.name },
      // Unset or "auto" follows the country's own authority.
      method: METHODS[s.method] ? s.method : methodFor(p.country),
      asr: s.asr === 'hanafi' ? 'hanafi' : 'shafii',
      // "auto" (or unset) leaves it to the method: 2 for Kemenag, JAKIM and MUIS, 0 elsewhere.
      ihtiyat: /^\d+$/.test(String(s.ihtiyat)) ? Number(s.ihtiyat) : undefined,
      lang: pickLanguage(s.language),
      remindBefore: Number.isInteger(s.remindBefore) ? s.remindBefore : 10,
      notifyAtTime: s.notifyAtTime !== false,
      // "ramadan" (default): only while fasting; an old showImsak: true meant always.
      imsak: ['always', 'ramadan', 'off'].includes(s.imsak) ? s.imsak : s.showImsak === true ? 'always' : 'ramadan',
      remindDhuha: s.remindDhuha === true,
      sunnahFast: s.sunnahFast === true,
      prayers: {
        fajr: s.notifyFajr !== false,
        dhuhr: s.notifyDhuhr !== false,
        asr: s.notifyAsr !== false,
        maghrib: s.notifyMaghrib !== false,
        isha: s.notifyIsha !== false
      },
      remindSunrise: Number.isInteger(s.remindSunrise) ? s.remindSunrise : 15,
      fridayRemind: Number.isInteger(s.fridayRemind) ? s.fridayRemind : 30,
      agentSummary: s.agentSummary !== false,
      hijriOffset: Number.isInteger(s.hijriOffset) ? Math.max(-2, Math.min(2, s.hijriOffset)) : 0
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
    const tz = cfg.place.tz
    const todayDate = cityDay(now, tz) // the place's own today, not necessarily this computer's
    const tomorrowDate = cityDay(now, tz, 1)
    const today = dayTimes(cfg, todayDate)
    const tomorrow = dayTimes(cfg, tomorrowDate)
    const rows = (x, d) => ORDER.map((key) => ({ key, label: label(t, key, d), time: hhmm(x[key], tz), at: x[key].getTime() }))

    const upcoming = [...PRAYERS.map((k) => ({ key: k, at: today[k], date: todayDate })), ...PRAYERS.map((k) => ({ key: k, at: tomorrow[k], date: tomorrowDate }))]
    const next = upcoming.find((p) => p.at > now)
    const current = [...PRAYERS].reverse().map((k) => ({ key: k, at: today[k] })).find((p) => p.at <= now) ?? null
    return {
      place: cfg.place.name,
      method: METHODS[cfg.method].name,
      now: now.getTime(),
      tz,
      today: rows(today, todayDate),
      tomorrow: rows(tomorrow, tomorrowDate),
      next: next && { key: next.key, label: label(t, next.key, next.date), time: hhmm(next.at, tz), at: next.at.getTime() },
      current: current && { key: current.key, label: label(t, current.key, todayDate), at: current.at.getTime() },
      lang: cfg.lang,
      qibla: Math.round(qibla(cfg.place.lat, cfg.place.lng)),
      hijri: new Intl.DateTimeFormat(`${t.locale}-u-ca-islamic-umalqura`, { day: 'numeric', month: 'long', year: 'numeric' }).format(hijriDate(todayDate, cfg.hijriOffset).at),
      _today: today,
      _tomorrow: tomorrow,
      _days: [[today, todayDate], [tomorrow, tomorrowDate]]
    }
  }

  async function notify(title, body) {
    try {
      await orca.host.call('notifications.show', { title, body })
    } catch (e) {
      orca.log(`notification failed: ${e.message}`)
    }
  }

  async function checkNotifications(cfg, sched, now, workspaces) {
    const events = notificationEvents(cfg, sched._days)
    for (const ev of events) {
      const late = now - ev.at
      if (late < 0 || fired.has(ev.id)) continue
      fired.add(ev.id)
      if (late > LATE_GRACE_MS) continue
      // Reminders before a prayer mention the user's agents, so they can unblock them first.
      const before = ev.id.endsWith('-pre') && !ev.id.endsWith('sunrise-pre')
      await notify(ev.title, before && workspaces ? `${ev.body} ${agentSummary(T[cfg.lang], workspaces)}`.trim() : ev.body)
    }
    if (fired.size > 200) for (const id of [...fired].slice(0, 100)) fired.delete(id)
  }

  // The user's workspaces with agent status, or null when agent features are off or Orca says no.
  async function readWorkspaces(cfg) {
    if (!cfg.agentSummary) return null
    try {
      return (await orca.host.call('workspace.list', { includeStatus: true })).workspaces ?? []
    } catch (e) {
      if (!agentsLogged) orca.log(`agent status unavailable: ${e.message}`) // older Orca or access not granted
      agentsLogged = true
      return null
    }
  }

  // Watch each enabled prayer from when it begins; REPORT_AFTER_MS later, say what the agents did.
  async function trackPrayer(cfg, sched, now, workspaces) {
    const cur = sched.current
    if (cur && cfg.prayers[cur.key] && now - cur.at < REPORT_AFTER_MS) {
      const id = `${cur.key}-${cur.at}`
      if (session?.id !== id) session = { id, label: cur.label, reportAt: cur.at + REPORT_AFTER_MS, everWorking: new Set() }
    }
    if (!session) return
    for (const w of workspaces) if (stateOf(w) === 'working') session.everWorking.add(w.id)
    if (now < session.reportAt) return
    const done = session
    session = null
    if (now - done.reportAt > LATE_GRACE_MS) return // the computer slept through it
    const report = prayerReport(T[cfg.lang], done.label, done.everWorking, workspaces)
    if (report) await notify(report.title, report.body)
  }

  async function updateStatusBar(sched, now, workspaces) {
    const t = T[sched.lang]
    let text, tone
    const cur = sched.current
    if (cur && now - cur.at < WINDOW_MIN * 60_000) {
      text = t.timeOf(cur.label)
      tone = 'success'
    } else if (sched.next) {
      const left = sched.next.at - now
      text = left <= 60 * 60_000 ? `${sched.next.label} ${sched.next.time}, ${t.left(untilText(t, left))}` : `${sched.next.label} ${sched.next.time}`
      tone = left <= WARN_BEFORE_MS ? 'warning' : 'neutral'
      // A prayer is close and an agent is stuck on the user: say so, loudly.
      const waiting = workspaces ? workspaces.filter((w) => stateOf(w) === 'permission').length : 0
      if (left <= WARN_BEFORE_MS && waiting) {
        text += `, ${t.statusWaiting(waiting)}`
        tone = 'danger'
      }
    } else {
      text = 'Waqt'
      tone = 'neutral'
    }
    const agents = workspaces ? agentSummary(t, workspaces) : ''
    const tooltip = `${sched.place}: ` + sched.today.filter((r) => PRAYERS.includes(r.key)).map((r) => `${r.label} ${r.time}`).join(', ') + (agents ? `\n${agents}` : '')
    const key = `${text}|${tone}|${tooltip}`
    if (key === lastStatus) return
    lastStatus = key
    try {
      await orca.host.call('statusBar.update', { id: 'next-prayer', text, tone, tooltip, visible: true })
    } catch (e) {
      orca.log(`status bar update failed: ${e.message}`)
    }
  }

  const publicView = ({ _today, _tomorrow, _days, ...rest }, workspaces) => ({ ...rest, agents: workspaces ? activeAgents(workspaces) : null })

  async function tick() {
    try {
      const now = new Date()
      const cfg = await readConfig()
      const sched = buildSchedule(cfg, now)
      const workspaces = await readWorkspaces(cfg)
      await updateStatusBar(sched, now.getTime(), workspaces)
      await checkNotifications(cfg, sched, now.getTime(), workspaces)
      if (workspaces) await trackPrayer(cfg, sched, now.getTime(), workspaces)
      orca.panels.post('waqt.tick', publicView(sched, workspaces))
    } catch (e) {
      orca.log(`tick failed: ${e.stack || e.message}`)
    }
  }

  async function currentView() {
    const cfg = await readConfig()
    return publicView(buildSchedule(cfg), await readWorkspaces(cfg))
  }

  orca.panels.handle('waqt.schedule', currentView)

  // The panel's agent list: open a workspace, but only one Orca actually lists.
  orca.panels.handle('waqt.openWorkspace', async ({ id } = {}) => {
    const workspaces = await readWorkspaces(await readConfig())
    if (typeof id !== 'string' || !workspaces?.some((w) => w.id === id)) {
      throw Object.assign(new Error('Unknown workspace'), { code: 'invalid_params' })
    }
    await orca.host.call('workspace.open', { workspaceId: id })
    return { opened: true }
  })

  // The panel's city search. Only ids from placeList() are accepted.
  orca.panels.handle('waqt.places', async () => placeList())
  orca.panels.handle('waqt.setPlace', async ({ id } = {}) => {
    const set = (key, value) => orca.host.call('settings.set', { key, value })
    if (id === 'auto' || CITIES[id]) {
      await set('city', id)
    } else if (typeof id === 'string' && id.startsWith('zone:') && ZONES[id.slice(5)]) {
      await set('zone', id.slice(5))
      await set('city', 'zone')
    } else {
      throw Object.assign(new Error(`Unknown place "${id}"`), { code: 'invalid_params' })
    }
    await tick() // status bar and open panels follow right away
    return currentView()
  })

  orca.commands.register('waqt.today', async () => {
    const cfg = await readConfig()
    const t = T[cfg.lang]
    const sched = buildSchedule(cfg)
    const lines = sched.today.map((r) => `${r.label.padEnd(8)} ${r.time}`)
    const head = t.heading(sched.place, new Date().toLocaleDateString(t.locale, { timeZone: sched.tz, weekday: 'long', day: 'numeric', month: 'long' }))
    const next = sched.next ? `\n${t.next(sched.next.label, sched.next.time, untilText(t, sched.next.at - Date.now()))}` : ''
    return `${head}\n\n${lines.join('\n')}${next}`
  })

  // Mark everything already past as sent, so enabling the plugin never fires a burst.
  readConfig().then((cfg) => {
    const now = Date.now()
    const sched = buildSchedule(cfg)
    for (const ev of notificationEvents(cfg, sched._days.slice(0, 1))) {
      if (now - ev.at > LATE_GRACE_MS) fired.add(ev.id)
    }
    tick()
    timer = setInterval(tick, TICK_MS)
  })

  return { dispose: () => timer && clearInterval(timer) }
}
