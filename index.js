/* ── WMO weather-code map ── */
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

/* ── state ── */
let weatherData = null, locName = ''
let isFahrenheit = true
let cachedLat = null, cachedLon = null

/* ── unit helpers ── */
const c2f = c => (c * 9 / 5) + 32
const mm2in = mm => mm / 25.4
const kmh2mph = kmh => kmh * 0.621371

function fTemp(c) {
  const v = isFahrenheit ? Math.round(c2f(c)) : Math.round(c)
  return `${v}°${isFahrenheit ? 'F' : 'C'}`
}

function fPrecip(mm) {
  if (!mm) return '—'
  return isFahrenheit ? `${mm2in(mm).toFixed(2)}"` : `${mm.toFixed(1)} mm`
}

function fWind(kmh) {
  if (kmh == null) return '—'
  const v = isFahrenheit ? Math.round(kmh2mph(kmh)) : Math.round(kmh)
  return `${v} ${isFahrenheit ? 'mph' : 'km/h'}`
}

function toggleUnits() {
  isFahrenheit = !isFahrenheit
  if (weatherData) render()
}

function setZipMessage(message) {
  document.getElementById('zip-msg').textContent = message
}

function setZipLoading(isLoading) {
  const input = document.getElementById('zip-input')
  const button = document.getElementById('zip-btn')
  input.disabled = isLoading
  button.disabled = isLoading
  button.textContent = isLoading ? 'Updating...' : 'Change Location'
}

function getSavedLocationParam() {
  const params = new URLSearchParams(window.location.search)
  return params.get('location')?.trim() || ''
}

function setSavedLocationParam(postalCode) {
  const url = new URL(window.location.href)
  if (postalCode) {
    url.searchParams.set('location', postalCode)
  } else {
    url.searchParams.delete('location')
  }
  window.history.replaceState({}, '', url)
}

async function loadPostalLocation(postalCode) {
  const { lat, lon, name } = await lookupPostalCode(postalCode)
  cachedLat = lat
  cachedLon = lon
  const nextWeather = await fetchWeather()
  locName = name
  weatherData = nextWeather
  document.getElementById('zip-input').value = postalCode
  setSavedLocationParam(postalCode)
  return name
}

async function loadCurrentLocation(keepInput = true) {
  const pos = await getPosition()
  const { latitude, longitude } = pos.coords
  cachedLat = latitude
  cachedLon = longitude
  weatherData = await fetchWeather()
  locName = await revGeocode(latitude, longitude)
  if (!keepInput) document.getElementById('zip-input').value = ''
}

/* ── screen helper ── */
function show(id) {
  document.getElementById('loading').style.display = id === 'loading' ? 'flex' : 'none'
  document.getElementById('error').style.display = id === 'error' ? 'flex' : 'none'
  document.getElementById('main').style.display = id === 'main' ? 'block': 'none'
}

async function init() {
  show('loading')
  try {
    const savedPostalCode = getSavedLocationParam()
    if (savedPostalCode) {
      try {
        await loadPostalLocation(savedPostalCode)
        setZipMessage(`Showing forecast for ${locName}.`)
      } catch {
        setSavedLocationParam('')
        await loadCurrentLocation()
        setZipMessage('Saved location was invalid, using current location.')
      }
    } else {
      await loadCurrentLocation()
      setZipMessage('')
    }
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
    render()
  } catch { console.log('Failed to refresh weather data, data stayed as-is') }
}

setInterval(refresh, 30 * 60 * 1000)

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

async function changeLocation(event) {
  event.preventDefault()
  const input = document.getElementById('zip-input')
  const postalCode = input.value.trim()
  if (!postalCode) {
    setZipMessage('Trying to use current location.')
    try {
      await loadCurrentLocation()
      setSavedLocationParam('')
      render()
      show('main')
      setZipMessage('Showing forecast for current location.')
    } catch (error) {
      setZipMessage('Unable to use current location. Please enter a ZIP code.')
    }
    return
  }

  setZipLoading(true)
  setZipMessage('')

  try {
    const name = await loadPostalLocation(postalCode)
    render()
    show('main')
    setZipMessage(`Showing forecast for ${name}.`)
  } catch (error) {
    setZipMessage(error.message || 'Unable to change location.')
  } finally {
    setZipLoading(false)
  }
}

/* ── reverse geocode via Nominatim ── */
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

/* ── Open-Meteo forecast ── */
async function fetchWeather() {
  const params = new URLSearchParams({
    latitude: cachedLat, longitude: cachedLon,
    daily: 'weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,sunset',
    hourly: 'temperature_2m,precipitation,precipitation_probability,weathercode,wind_speed_10m',
    current: 'weathercode,temperature,apparent_temperature',
    forecast_days: '12',
    forecast_hours: '30',
    timezone: 'auto',
  })
  const r = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`)
  if (!r.ok) throw new Error('Weather service unavailable. Please try again.')
  return r.json()
}

function hebDate(date = new Date()) {
  const letters = { 1: 'א', 2: 'ב', 3: 'ג', 4: 'ד', 5: 'ה', 6: 'ו', 7: 'ז', 8: 'ח', 9: 'ט', 10: 'י', 11: 'יא', 12: 'יב', 13: 'יג', 14: 'יד', 15: 'טו', 16: 'טז', 17: 'יז', 18: 'יח', 19: 'יט', 20: 'כ', 21: 'כא', 22: 'כב', 23: 'כג', 24: 'כד', 25: 'כה', 26: 'כו', 27: 'כז', 28: 'כח', 29: 'כט', 30: 'ל' }
  const month = date.toLocaleDateString('he-u-ca-hebrew', { month:'long' })
  const day = letters[date.toLocaleDateString('he-u-ca-hebrew', { day:'numeric' })]
  const sunset = date.toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' }).replace('PM', '')
  return `${day} ${month} ${sunset}`
}

function render() {
  const now = new Date()
  const pad = n => String(n).padStart(2, '0')
  const todayStr = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`
  const curHourStr = `${todayStr}T${pad(now.getHours())}:00`

  /* header */
  document.getElementById('loc').textContent = locName
  document.getElementById('hdr-date').textContent = now.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' })
  document.getElementById('hdr-time').textContent = now.toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' })

  const [cwDesc, cwIcon] = wmo(weatherData.current.weathercode)
  document.getElementById('cur-temp').textContent = fTemp(weatherData.current.temperature)
  document.getElementById('cur-icon').textContent = cwIcon
  document.getElementById('cur-desc').textContent = cwDesc
  document.getElementById('cur-feels').textContent =
      `Feels like ${fTemp(weatherData.current.apparent_temperature)}`
  renderDaily()
  renderHourly(now, curHourStr)
}

/* ── clear row columns (keep label cell) ── */
function clearRow(id) {
  const row = document.getElementById(id)
  while (row.children.length > 0) row.removeChild(row.lastChild)
}

/* ── 10-day table ── */
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
    const wind = d.wind_speed_10m_max[i]

    /* day header cell */
    const th = document.createElement('th')
    th.className = 'day'
    th.innerHTML = `
      <div class="day-name${i === 0 ? ' today' : ''}">${date}</div>
      <div class="day-date">${hebDate(sunset)}</div>
      <span class="day-icon">${icon}</span>
      <div class="day-cond">${cond}</div>`
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
    ptd.innerHTML = `<div class="p-prob${hasP ? '' : ' dim'}">${prob}%</div><div class="p-amt">${fPrecip(amt)}</div>`
    document.getElementById('d-precip').appendChild(ptd)

    /* wind cell */
    const wtd = document.createElement('td')
    wtd.innerHTML = `<div class="wspd">${fWind(wind)}</div>`
    document.getElementById('d-wind').appendChild(wtd)
  }
}

/* ── hourly table (24 h from current hour) ── */
function renderHourly(now, curHourStr) {
  ['h-hdr','h-temp','h-precip','h-wind'].forEach(clearRow)

  const h = weatherData.hourly
  let start = h.time.indexOf(curHourStr)
  if (start < 0) start = h.time.findIndex(t => new Date(t) > now)
  if (start < 0) start = 0
  const end = Math.min(start + 25, h.time.length)

  for (let i = start; i < end; i++) {
    const isCur = i === start
    const t = new Date(h.time[i])
    const label = t.toLocaleTimeString('en-US', { hour:'numeric', hour12:true })
    const [, icon] = wmo(h.weathercode[i])
    const temp = h.temperature_2m[i]
    const prob = h.precipitation_probability[i] ?? 0
    const amt = h.precipitation[i] ?? 0
    const wind = h.wind_speed_10m[i]

    /* header */
    const th = document.createElement('th')
    th.className = `hr${isCur ? ' cur-col' : ''}`
    th.innerHTML = `<div class="hr-time">${label}</div><span class="hr-icon">${icon}</span>`
    document.getElementById('h-hdr').appendChild(th)

    /* temp */
    const ttd = document.createElement('td')
    if (isCur) ttd.className = 'cur-col'
    ttd.innerHTML = `<div class="hr-temp">${fTemp(temp)}</div>`
    document.getElementById('h-temp').appendChild(ttd)

    /* precip */
    const ptd = document.createElement('td')
    if (isCur) ptd.className = 'cur-col'
    const hasP = prob > 0
    ptd.innerHTML = `
      <div class="hr-prob${hasP ? '' : ' dim'}">${prob}%</div>
      <div class="hr-amt">${fPrecip(amt)}</div>`
    document.getElementById('h-precip').appendChild(ptd)

    /* wind */
    const wtd = document.createElement('td')
    if (isCur) wtd.className = 'cur-col'
    wtd.innerHTML = `<div class="wspd">${fWind(wind)}</div>`
    document.getElementById('h-wind').appendChild(wtd)
  }
}
init()
