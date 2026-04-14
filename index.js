const WMO = {
  0:  ['Clear Sky',           '☀️'],
  1:  ['Mainly Clear',        '🌤️'],
  2:  ['Partly Cloudy',       '⛅'],
  3:  ['Overcast',            '☁️'],
  45: ['Fog',                 '🌫️'],
  48: ['Icy Fog',             '🌫️'],
  51: ['Light Drizzle',       '🌦️'],
  53: ['Drizzle',             '🌦️'],
  55: ['Heavy Drizzle',       '🌧️'],
  61: ['Light Rain',          '🌧️'],
  63: ['Rain',                '🌧️'],
  65: ['Heavy Rain',          '🌧️'],
  71: ['Light Snow',          '🌨️'],
  73: ['Snow',                '❄️'],
  75: ['Heavy Snow',          '❄️'],
  77: ['Snow Grains',         '🌨️'],
  80: ['Showers',             '🌦️'],
  81: ['Showers',             '🌦️'],
  82: ['Heavy Showers',       '⛈️'],
  85: ['Snow Showers',        '🌨️'],
  86: ['Heavy Snow Showers',  '❄️'],
  95: ['Thunderstorm',        '⛈️'],
  96: ['T-storm + Hail',      '⛈️'],
  99: ['T-storm + Hail',      '⛈️'],
}
const wmo = code => WMO[code] || ['Unknown', '🌡️']
const currentUrl = new URL(window.location.href)

let weatherData = null, locName = ''
let isFahrenheit = currentUrl.searchParams.get('cel') !== '1'
let cachedLat = null, cachedLon = null
let selectedDayIndex = 0
let selectedHourlyData = null
let resetToCurrentDayTimer = -1

const HOURLY_FIELDS = 'temperature_2m,precipitation,precipitation_probability,weathercode,wind_speed_10m'
const hourlyByDayCache = new Map()

const fTemp = c => Math.round(isFahrenheit ? (c * 9 / 5) + 32 : c) + '°'

function fPrecip(mm) {
  if (!mm) return '—'
  return isFahrenheit ? `${(mm / 25.4).toFixed(2)}"` : `${mm.toFixed(1)} mm`
}

function fWind(kmh) {
  if (kmh == null) return '—'
  if (typeof kmh === 'string') {
    const [max, min] = kmh.split('/').map(Number)
    const vMax = Math.round(isFahrenheit ? max * 0.621371 : max)
    const vMin = Math.round(isFahrenheit ? min * 0.621371 : min)
    return `${vMin}-${vMax} ${isFahrenheit ? 'mph' : 'km/h'}`
  }
  return `${Math.round(isFahrenheit ? kmh * 0.621371 : kmh)} ${isFahrenheit ? 'mph' : 'km/h'}`
}

function toggleUnits() {
  isFahrenheit = !isFahrenheit
  if (weatherData) render()
  currentUrl.searchParams.set('cel', !isFahrenheit ? '1' : '0')
  window.history.replaceState({}, '', currentUrl)
}

async function loadLocation() {
  const locInput = currentUrl.searchParams.get('location')?.trim() || ''
  if (!locInput) {
    await setCurrentLocation()
  } else {
    const { lat, lon, name } = await lookupPostalCode(locInput)
    cachedLat = lat
    cachedLon = lon
    locName = name
  }
}

async function setCurrentLocation() {
  const pos = await getPosition()
  const { latitude, longitude } = pos.coords
  locName = await revGeocode(latitude, longitude)
  currentUrl.searchParams.set('location', locName)
  window.history.replaceState({}, '', currentUrl)
  location.reload()
}

function show(id) {
  document.getElementById('loading').style.display = id === 'loading' ? 'flex' : 'none'
  document.getElementById('error').style.display = id === 'error' ? 'flex' : 'none'
  document.getElementById('main').style.display = id === 'main' ? 'block': 'none'
}

async function init() {
  show('loading')
  try {
    await loadLocation()
    weatherData = await fetchWeather()
    render()
    show('main')
  } catch (e) {
    console.error(e)
    document.getElementById('err-msg').textContent = e.message || 'Failed to load weather data.'
    show('error')
  }
}

async function refresh() {
  try {
    weatherData = await fetchWeather()
    if (selectedDayIndex === 0) selectedHourlyData = null
    render()
  } catch { console.log('Failed to refresh weather data, data stayed as-is') }
}

function getPosition() {
  return new Promise((res, rej) => {
    if (!navigator.geolocation)
      return rej(new Error('Geolocation is not supported by this browser.'))
    navigator.geolocation.getCurrentPosition(res,
      () => rej(new Error('Location access denied. Please allow location access and try again.')),
      { timeout: 12000 })
  })
}

async function lookupUsZipCode(postalCode) {
  const normalized = postalCode.match(/^\d{5}/)?.[0]
  if (!normalized) return null

  const response = await fetch(`https://api.zippopotam.us/us/${normalized}`)
  if (!response.ok) return null

  const data = await response.json()
  const place = data.places?.[0]
  if (!place) return null

  return {
    lat: Number(place.latitude),
    lon: Number(place.longitude),
    name: `${place['place name']}, ${place['state abbreviation']}`,
  }
}

async function lookupPostalCode(postalCode) {
  const query = postalCode.trim()
  if (!query) throw new Error('Enter a ZIP code first.')
  if (/^\d{5}(?:-\d{4})?$/.test(query)) { // is usa zip
    const usZipResult = await lookupUsZipCode(query)
    if (usZipResult) return usZipResult
    const usUrl = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&countrycodes=us&postalcode=${encodeURIComponent(query)}`
    const usResponse = await fetch(usUrl, { headers: { 'Accept-Language': 'en-US,en' } })
    if (usResponse.ok) {
      const usResults = await usResponse.json()
      if (usResults.length) {
        const result = usResults[0]
        const name = result.address?.city || result.address?.town || result.address?.village || result.address?.county || result.display_name.split(',')[0] || query
        return {
          lat: Number(result.lat),
          lon: Number(result.lon),
          name,
        }
      }
    }
  }
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&q=${encodeURIComponent(query)}`
  const response = await fetch(url, { headers: { 'Accept-Language': 'en-US,en' } })
  if (!response.ok) throw new Error('Could not look up that ZIP code.')
  const results = await response.json()
  if (!results.length) throw new Error('No location found for that ZIP code.')
  const result = results[0]
  const name = result.address?.city || result.address?.town || result.address?.village || result.address?.county || result.display_name.split(',')[0] || query
  return {
    lat: Number(result.lat),
    lon: Number(result.lon),
    name,
  }
}

function changeLocation(e) {
  e?.preventDefault()
  const postalCode = document.getElementById('zip-input').value
  currentUrl.searchParams.set('location', postalCode.trim())
  window.history.replaceState({}, '', currentUrl)
  location.reload()
}

async function revGeocode(lat, lon) {
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&format=json`,
      { headers: { 'Accept-Language': 'en-US,en' } }
    )
    const d = await r.json()
    return d.address?.city || d.address?.town || d.address?.village || d.address?.county || 'My Location'
  } catch { return 'My Location' }
}

async function fetchWeather() {
  const params = new URLSearchParams({
    latitude: cachedLat, longitude: cachedLon,
    daily: 'weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_speed_10m_min,sunset',
    hourly: HOURLY_FIELDS,
    current: 'weathercode,temperature,apparent_temperature',
    forecast_days: '12',
    forecast_hours: '24',
    timezone: 'auto',
  })
  const r = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`)
  if (!r.ok) throw new Error('Weather service unavailable. Please try again.')
  return r.json()
}

async function fetchHourlyForDay(dayIso) {
  const params = new URLSearchParams({
    latitude: cachedLat,
    longitude: cachedLon,
    hourly: HOURLY_FIELDS,
    start_date: dayIso,
    end_date: dayIso,
    timezone: 'auto',
  })
  const r = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`)
  if (!r.ok) throw new Error('Could not load hourly forecast for selected day.')
  const data = await r.json()
  return data.hourly
}

function scheduleResetToCurrentTimer() {
  clearTimeout(resetToCurrentDayTimer)
  resetToCurrentDayTimer = setTimeout(() => {
    selectedDayIndex = 0
    selectedHourlyData = null
    render()
  }, 2 * 60 * 1000)
}

async function onDayClick(index) {
  if (!weatherData?.daily?.time?.[index]) return

  if (index === 0) {
    clearTimeout(resetToCurrentDayTimer)
    selectedDayIndex = 0
    selectedHourlyData = null
    render()
    return
  }

  const dayIso = weatherData.daily.time[index]
  try {
    if (!hourlyByDayCache.has(dayIso)) {
      const hourly = await fetchHourlyForDay(dayIso)
      hourlyByDayCache.set(dayIso, hourly)
    }
    selectedDayIndex = index
    selectedHourlyData = hourlyByDayCache.get(dayIso)
    render()
    scheduleResetToCurrentTimer()
  } catch (e) {
    console.error(e)
  }
}

function hebDate(date = new Date()) {
  const letters = { 1: 'א', 2: 'ב', 3: 'ג', 4: 'ד', 5: 'ה', 6: 'ו', 7: 'ז', 8: 'ח', 9: 'ט', 10: 'י', 11: 'יא', 12: 'יב', 13: 'יג', 14: 'יד', 15: 'טו', 16: 'טז', 17: 'יז', 18: 'יח', 19: 'יט', 20: 'כ', 21: 'כא', 22: 'כב', 23: 'כג', 24: 'כד', 25: 'כה', 26: 'כו', 27: 'כז', 28: 'כח', 29: 'כט', 30: 'ל' }
  const month = date.toLocaleDateString('he-u-ca-hebrew', { month:'long' })
  const day = letters[date.toLocaleDateString('he-u-ca-hebrew', { day:'numeric' })]
  const sunset = date.toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' }).replace('PM', '')
  return `${day} ${month} ${sunset}`
}

function render() {
  /* header */
  document.getElementById('loc').textContent = locName
  document.getElementById('zip-input').value = currentUrl.searchParams.get('location')?.trim() || ''

  const [cwDesc, cwIcon] = wmo(weatherData.current.weathercode)
  document.getElementById('cur-temp').textContent = fTemp(weatherData.current.temperature)
  document.getElementById('cur-icon').textContent = cwIcon
  document.getElementById('cur-desc').textContent = cwDesc
  document.getElementById('cur-feels').textContent =
      `Feels like ${fTemp(weatherData.current.apparent_temperature)}`
  renderDaily()
  renderHourly()
}

function clearRow(id) {
  const row = document.getElementById(id)
  while (row.children.length > 0) row.removeChild(row.lastChild)
}

function renderDaily() {
  ['d-hdr','d-temp','d-precip','d-wind'].forEach(clearRow)
  const d = weatherData.daily

  for (let i = 0; i < d.time.length; i++) {
    const sunset = new Date(d.sunset[i])
    const date = sunset.toLocaleDateString('en-US', { month:'short', day:'numeric',  weekday:'short' })
    const [cond, icon] = wmo(d.weathercode[i])
    const hi = d.temperature_2m_max[i]
    const lo = d.temperature_2m_min[i]
    const prob = d.precipitation_probability_max[i] ?? 0
    const amt = d.precipitation_sum[i] ?? 0
    const wind = d.wind_speed_10m_max[i] + '/' + d.wind_speed_10m_min[i]

    /* day header cell */
    const th = document.createElement('th')
    th.className = i === selectedDayIndex ? 'day active' : 'day'
    th.style.cursor = 'pointer'
    th.innerHTML = `
      <div class="day-name">${!i ? 'Today' : date}</div>
      <div class="day-date">${hebDate(sunset)}</div>
      <span class="day-icon">${icon}</span>
      <div class="day-cond">${cond}</div>`
    th.addEventListener('click', () => { onDayClick(i) })
    document.getElementById('d-hdr').appendChild(th)

    /* temperature cell */
    const ttd = document.createElement('td')
    ttd.innerHTML = `
      <div class="t-hi">${fTemp(hi)}</div>
      <div class="t-lo">${fTemp(lo)}</div>`
    document.getElementById('d-temp').appendChild(ttd)

    /* precipitation cell */
    const ptd = document.createElement('td')
    const hasP = prob > 0
    ptd.innerHTML = `<div class="p-prob${hasP ? '' : ' dim'}">${Math.round(prob / 10) * 10}%</div><div class="p-amt">${fPrecip(amt)}</div>`
    document.getElementById('d-precip').appendChild(ptd)

    /* wind cell */
    const wtd = document.createElement('td')
    wtd.innerHTML = `<div class="wspd">${fWind(wind)}</div>`
    document.getElementById('d-wind').appendChild(wtd)
  }
}

function renderHourly() {
  ['h-hdr','h-temp','h-precip','h-wind'].forEach(clearRow)
  const isCurrentDayView = selectedDayIndex === 0 || !selectedHourlyData
  const h = isCurrentDayView ? weatherData.hourly : selectedHourlyData

  const dayLabel = (() => {
    if (isCurrentDayView) return 'Today'
    const iso = weatherData.daily.time[selectedDayIndex]
    const [y, m, d] = iso.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
  })()
  document.getElementById('hourly-day-label').textContent = dayLabel

  for (let i = 0; i < Math.min(24, h.time.length); i++) {
    const t = new Date(h.time[i])
    const label = t.toLocaleTimeString('en-US', { hour:'numeric', hour12:true })
    const [, icon] = wmo(h.weathercode[i])
    const temp = h.temperature_2m[i]
    const prob = h.precipitation_probability[i] ?? 0
    const amt = h.precipitation[i] ?? 0
    const wind = h.wind_speed_10m[i]

    /* header */
    const th = document.createElement('th')
    th.className = 'hr'
    th.innerHTML = `<div class="hr-time">${label}</div><span class="hr-icon">${icon}</span>`
    document.getElementById('h-hdr').appendChild(th)

    /* temp */
    const ttd = document.createElement('td')
    ttd.innerHTML = `<div class="hr-temp">${fTemp(temp)}</div>`
    document.getElementById('h-temp').appendChild(ttd)

    /* precip */
    const ptd = document.createElement('td')
    const hasP = prob > 0
    ptd.innerHTML = `
      <div class="hr-prob${hasP ? '' : ' dim'}">${Math.round(prob / 10) * 10}%</div>
      <div class="hr-amt">${fPrecip(amt)}</div>`
    document.getElementById('h-precip').appendChild(ptd)

    /* wind */
    const wtd = document.createElement('td')
    wtd.innerHTML = `<div class="wspd">${fWind(wind)}</div>`
    document.getElementById('h-wind').appendChild(wtd)
  }
}

init()
setInterval(refresh, 10 * 60 * 1000)
setInterval(() => {
  const now = new Date()
  document.getElementById('hdr-time').textContent = now.toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' }).replace('PM', '') .replace('AM', '')
  document.getElementById('hdr-seconds').textContent = now.toLocaleTimeString('en-US', { second:'2-digit' }).padStart(2, '0')
  document.getElementById('hdr-date').textContent = now.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' })
}, 1 * 240)
