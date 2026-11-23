// City centres. Prayer times shift about a minute per ~25 km, so a city centre is close enough
// for anywhere in that city; pick "custom" for exact coordinates.
import { ZONES } from './zones.mjs'

export const CITIES = {
  'banda-aceh': ['Banda Aceh', 5.5483, 95.3238],
  medan: ['Medan', 3.5952, 98.6722],
  padang: ['Padang', -0.9471, 100.4172],
  pekanbaru: ['Pekanbaru', 0.5071, 101.4478],
  palembang: ['Palembang', -2.9761, 104.7754],
  'bandar-lampung': ['Bandar Lampung', -5.3971, 105.2668],
  jakarta: ['Jakarta', -6.1754, 106.8272],
  bogor: ['Bogor', -6.5971, 106.806],
  depok: ['Depok', -6.4025, 106.7942],
  tangerang: ['Tangerang', -6.1783, 106.6319],
  bekasi: ['Bekasi', -6.2383, 106.9756],
  bandung: ['Bandung', -6.9175, 107.6191],
  semarang: ['Semarang', -6.9667, 110.4167],
  yogyakarta: ['Yogyakarta', -7.7956, 110.3695],
  solo: ['Surakarta (Solo)', -7.5755, 110.8243],
  surabaya: ['Surabaya', -7.2575, 112.7521],
  malang: ['Malang', -7.9666, 112.6326],
  denpasar: ['Denpasar', -8.6705, 115.2126],
  mataram: ['Mataram', -8.5833, 116.1167],
  kupang: ['Kupang', -10.1772, 123.607],
  pontianak: ['Pontianak', -0.0263, 109.3425],
  banjarmasin: ['Banjarmasin', -3.3186, 114.5944],
  balikpapan: ['Balikpapan', -1.2379, 116.8529],
  samarinda: ['Samarinda', -0.5022, 117.1536],
  makassar: ['Makassar', -5.1477, 119.4327],
  kendari: ['Kendari', -3.9985, 122.5129],
  manado: ['Manado', 1.4748, 124.8421],
  ambon: ['Ambon', -3.6954, 128.1814],
  jayapura: ['Jayapura', -2.5337, 140.7181],
  'kuala-lumpur': ['Kuala Lumpur', 3.139, 101.6869],
  singapura: ['Singapore', 1.3521, 103.8198]
}


// Curated cities are all Indonesian except these two.
const CITY_COUNTRY = { 'kuala-lumpur': 'MY', singapura: 'SG' }

// Each curated city's time zone: WIB unless listed.
const WITA = ['denpasar', 'mataram', 'kupang', 'banjarmasin', 'balikpapan', 'samarinda', 'makassar', 'kendari', 'manado']
const CITY_TZ = {
  ...Object.fromEntries(WITA.map((c) => [c, 'Asia/Makassar'])),
  ambon: 'Asia/Jayapura',
  jayapura: 'Asia/Jayapura',
  pontianak: 'Asia/Pontianak',
  'kuala-lumpur': 'Asia/Kuala_Lumpur',
  singapura: 'Asia/Singapore'
}

// Where a curated city is better than the time zone's own principal city.
export const TZ_CITY = {
  'Asia/Jakarta': 'jakarta',
  'Asia/Pontianak': 'pontianak',
  'Asia/Makassar': 'makassar',
  'Asia/Jayapura': 'jayapura',
  'Asia/Kuala_Lumpur': 'kuala-lumpur',
  'Asia/Singapore': 'singapura'
}

// Old names some systems still report, mapped to the names in zone.tab.
const TZ_ALIAS = {
  'Asia/Ujung_Pandang': 'Asia/Makassar',
  Singapore: 'Asia/Singapore',
  'Asia/Calcutta': 'Asia/Kolkata',
  'Asia/Saigon': 'Asia/Ho_Chi_Minh',
  'Asia/Katmandu': 'Asia/Kathmandu',
  'Asia/Rangoon': 'Asia/Yangon',
  'Asia/Dacca': 'Asia/Dhaka',
  'Europe/Kiev': 'Europe/Kyiv',
  'America/Buenos_Aires': 'America/Argentina/Buenos_Aires'
}

export const localTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

// "America/Argentina/Buenos_Aires" -> "Buenos Aires"
export const zoneName = (tz) => tz.split('/').pop().replace(/_/g, ' ')

// Each country's own authority where Waqt has its method; Muslim World League elsewhere.
const METHOD_BY_COUNTRY = { ID: 'kemenag', MY: 'jakim', SG: 'muis', SA: 'makkah', EG: 'egypt', US: 'isna', CA: 'isna' }
export const methodFor = (country) => METHOD_BY_COUNTRY[country] ?? 'mwl'

/**
 * Where to compute prayer times for, from the plugin settings.
 * city: "auto" (or unset) | a curated key | "zone" (s.zone, picked in the panel) | "custom" (s.latitude/s.longitude)
 * tz is the place's own time zone, so times read as they do on a clock there.
 * @returns {{ name: string, lat: number, lng: number, country: string|null, tz: string, auto: boolean }}
 */
export function resolvePlace(s = {}, tz = localTimeZone()) {
  const here = TZ_ALIAS[tz] ?? tz
  const hereCountry = ZONES[here]?.[0] ?? null
  const curated = (key, auto) => {
    const [name, lat, lng] = CITIES[key]
    return { name, lat, lng, country: CITY_COUNTRY[key] ?? 'ID', tz: CITY_TZ[key] ?? 'Asia/Jakarta', auto }
  }
  const zone = (id, auto) => {
    const [country, lat, lng] = ZONES[id]
    return { name: zoneName(id), lat, lng, country, tz: id, auto }
  }

  if (s.city === 'custom') {
    const lat = Number(s.latitude)
    const lng = Number(s.longitude)
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 66 && Math.abs(lng) <= 180) {
      return { name: `${lat.toFixed(3)}, ${lng.toFixed(3)}`, lat, lng, country: hereCountry, tz, auto: false }
    }
  }
  if (s.city === 'zone' && ZONES[s.zone]) return zone(s.zone, false)
  if (CITIES[s.city]) return curated(s.city, false)
  // Automatic, or a choice that no longer resolves: guess from this computer's time zone.
  if (TZ_CITY[here]) return curated(TZ_CITY[here], true)
  if (ZONES[here]) return zone(here, true)
  return curated('jakarta', true)
}

/** Everything the panel's city search offers: curated cities, then every time zone city. */
export function placeList() {
  const covered = new Set(Object.keys(TZ_CITY))
  return [
    ...Object.entries(CITIES).map(([id, [name]]) => ({ id, name, country: CITY_COUNTRY[id] ?? 'ID' })),
    ...Object.entries(ZONES)
      .filter(([tz]) => !covered.has(tz))
      .map(([tz, [country]]) => ({ id: `zone:${tz}`, name: zoneName(tz), country }))
  ]
}
