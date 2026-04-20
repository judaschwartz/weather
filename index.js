const WMO = {
  0:  ['Clear Sky',      '☀️'],
  1:  ['Mainly Clear',   '🌤️'],
  2:  ['Partly Cloudy',  '⛅'],
  3:  ['Overcast',       '☁️'],
  45: ['Fog',            '🌫️'],
  48: ['Icy Fog',        '🌫️'],
  51: ['Light Drizzle',  '🌦️'],
  53: ['Drizzle',        '🌦️'],
  55: ['Heavy Drizzle',  '🌧️'],
  61: ['Light Rain',     '🌧️'],
  63: ['Rain',           '🌧️'],
  65: ['Heavy Rain',     '🌧️'],
  71: ['Light Snow',     '🌨️'],
  73: ['Snow',           '❄️'],
  75: ['Heavy Snow',     '❄️'],
  77: ['Snow Grains',    '🌨️'],
  80: ['Showers',        '🌦️'],
  81: ['Showers',        '🌦️'],
  82: ['Heavy Showers',  '⛈️'],
  85: ['Snow Showers',   '🌨️'],
  86: ['Snow Showers',   '❄️'],
  95: ['Thunderstorm',   '⛈️'],
  96: ['T-storm + Hail', '⛈️'],
  99: ['T-storm + Hail', '⛈️'],
}
const wmo = code => WMO[code] || [`Unknown: ${code}`, '🌡️']
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
const fPrecip = mm => isFahrenheit ? `${(mm / 25.4).toFixed(2)}"` : `${mm.toFixed(1)} mm`
const addMinutes = (date, minutes) => new Date(date.getTime() + (minutes * 60 * 1000))
const formatClock = date => date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

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
    await setCurrentLocation(window.localStorage.getItem('lastPostalCode'))
  } else {
    const { lat, lon, name } = await lookupPostalCode(locInput)
    cachedLat = lat
    cachedLon = lon
    locName = name
  }
}

async function setCurrentLocation(locName) {
  if (!locName) {
    const pos = await getPosition()
    const { latitude, longitude } = pos.coords
    locName = await revGeocode(latitude, longitude)
  }
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
    selectedDayIndex = 0
    selectedHourlyData = null
    hourlyByDayCache.clear()
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
  const postalCode = e.target.querySelector('input').value
  window.localStorage.setItem('lastPostalCode', postalCode)
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
    daily: 'weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_speed_10m_min,sunrise,sunset',
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

async function onDayClick(index) {
  const dayIso = weatherData?.daily?.time?.[index]
  if (index === 0 || !dayIso) {
    selectedDayIndex = 0
    selectedHourlyData = null
    render()
  } else {
    try {
      if (!hourlyByDayCache.has(dayIso)) {
        const hourly = await fetchHourlyForDay(dayIso)
        hourlyByDayCache.set(dayIso, hourly)
      }
      selectedDayIndex = index
      selectedHourlyData = hourlyByDayCache.get(dayIso)
      render()
      clearTimeout(resetToCurrentDayTimer)
      resetToCurrentDayTimer = setTimeout(() => {
        selectedDayIndex = 0
        selectedHourlyData = null
        render()
      }, 2 * 60 * 1000)
    } catch (e) {
      console.error(e)
    }
  }
}

function hebDate(date = new Date()) {
  const letters = { 1: 'א', 2: 'ב', 3: 'ג', 4: 'ד', 5: 'ה', 6: 'ו', 7: 'ז', 8: 'ח', 9: 'ט', 10: 'י', 11: 'יא', 12: 'יב', 13: 'יג', 14: 'יד', 15: 'טו', 16: 'טז', 17: 'יז', 18: 'יח', 19: 'יט', 20: 'כ', 21: 'כא', 22: 'כב', 23: 'כג', 24: 'כד', 25: 'כה', 26: 'כו', 27: 'כז', 28: 'כח', 29: 'כט', 30: 'ל' }
  const month = date.toLocaleDateString('he-u-ca-hebrew', { month: 'long' })
  const day = letters[date.toLocaleDateString('he-u-ca-hebrew', { day: 'numeric' })]
  const sunset = date.toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' }).replace('PM', '')
  return `${day} ${month} <span>${sunset}</span>`
}

function render() {
  document.getElementById('loc').textContent = locName
  document.getElementById('zip-input').value = currentUrl.searchParams.get('location')?.trim() || ''
  const [cwDesc, cwIcon] = wmo(weatherData.current.weathercode)
  document.getElementById('cur-temp').textContent = fTemp(weatherData.current.temperature)
  document.getElementById('cur-icon').textContent = cwIcon
  document.getElementById('cur-desc').textContent = cwDesc
  document.getElementById('cur-feels').textContent = `Feels like ${fTemp(weatherData.current.apparent_temperature)}`
  renderDaily()
  renderHourly()
  renderZmanim()
}

function clearRow(id) {
  const row = document.getElementById(id)
  while (row.children.length > 0) row.removeChild(row.lastChild)
}

function buildSmoothPath(points) {
  if (!points.length) return ''
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`

  let path = `M ${points[0].x} ${points[0].y}`

  for (let i = 0; i < points.length - 1; i++) {
    const prev = points[i - 1] || points[i]
    const curr = points[i]
    const next = points[i + 1]
    const after = points[i + 2] || next
    const tension = 0.18
    const control1X = curr.x + (next.x - prev.x) * tension
    const control1Y = curr.y + (next.y - prev.y) * tension
    const control2X = next.x - (after.x - curr.x) * tension
    const control2Y = next.y - (after.y - curr.y) * tension

    path += ` C ${control1X} ${control1Y}, ${control2X} ${control2Y}, ${next.x} ${next.y}`
  }

  return path
}

function buildHourlyGraph(temps, dayFactors) {
  const graph = document.createElement('div')
  graph.className = 'hourly-graph'

  const count = temps.length
  const minTemp = Math.min(...temps)
  const maxTemp = Math.max(...temps)
  const actualRange = maxTemp - minTemp
  const minVisualRange = isFahrenheit ? (15 * 5 / 9) : 15
  const spread = Math.max(actualRange, minVisualRange)
  const midTemp = (minTemp + maxTemp) / 2
  const visualMinTemp = midTemp - (spread / 2)
  const pad = 14

  const points = temps.map((temp, index) => {
    const x = count === 1 ? 50 : (index / (count - 1)) * 100
    const y = 100 - (((temp - visualMinTemp) / spread) * (100 - (pad * 2)) + pad)
    return { x, y, temp }
  })

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('class', 'hourly-graph-svg')
  svg.setAttribute('viewBox', '0 0 100 100')
  svg.setAttribute('preserveAspectRatio', 'none')

  const smoothPath = buildSmoothPath(points)

  // Day/night gradient background
  if (dayFactors && dayFactors.length === count) {
    const gradId = 'dn-grad-' + Math.random().toString(36).slice(2, 8)
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs')
    const grad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient')
    grad.setAttribute('id', gradId)
    grad.setAttribute('x1', '0%'); grad.setAttribute('x2', '100%')
    grad.setAttribute('y1', '0%'); grad.setAttribute('y2', '0%')
    // night: dark navy, day: soft sky blue
    const nightR = 10, nightG = 22, nightB = 40, nightA = 0.25
    const dayR = 135, dayG = 206, dayB = 235, dayA = 0.12
    dayFactors.forEach((f, i) => {
      const pct = count === 1 ? 50 : (i / (count - 1)) * 100
      const r = Math.round(nightR + (dayR - nightR) * f)
      const g = Math.round(nightG + (dayG - nightG) * f)
      const b = Math.round(nightB + (dayB - nightB) * f)
      const a = +(nightA + (dayA - nightA) * f).toFixed(3)
      const stop = document.createElementNS('http://www.w3.org/2000/svg', 'stop')
      stop.setAttribute('offset', `${pct}%`)
      stop.setAttribute('stop-color', `rgba(${r},${g},${b},${a})`)
      grad.appendChild(stop)
    })
    defs.appendChild(grad)
    svg.appendChild(defs)
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    rect.setAttribute('x', 0); rect.setAttribute('y', 0)
    rect.setAttribute('width', 100); rect.setAttribute('height', 100)
    rect.setAttribute('fill', `url(#${gradId})`)
    svg.appendChild(rect)
  }

  const area = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  area.setAttribute('class', 'hourly-graph-area')
  area.setAttribute('d', [
    `M ${points[0].x} 100`,
    smoothPath.replace(/^M [^ ]+ [^ ]+/, `L ${points[0].x} ${points[0].y}`),
    `L ${points[points.length - 1].x} 100`,
    'Z',
  ].join(' '))

  const line = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  line.setAttribute('class', 'hourly-graph-line')
  line.setAttribute('d', smoothPath)

  svg.append(area, line)
  graph.appendChild(svg)

  const pointsLayer = document.createElement('div')
  pointsLayer.className = 'hourly-graph-points'
  pointsLayer.style.gridTemplateColumns = `repeat(${count}, minmax(0, 1fr))`

  points.forEach(point => {
    const item = document.createElement('div')
    item.className = 'hourly-point'
    item.style.setProperty('--point-y', `${point.y}%`)
    item.innerHTML = `
      <div class="hourly-point-temp">${fTemp(point.temp)}</div>
      <div class="hourly-point-dot"></div>`
    pointsLayer.appendChild(item)
  })

  graph.appendChild(pointsLayer)
  return graph
}

function renderZmanim() {
  const d = weatherData?.daily
  const grid = document.getElementById('zmanim-grid')
  grid.innerHTML = ''

  const sunrise = new Date(d.sunrise?.[selectedDayIndex])
  const sunset = new Date(d.sunset?.[selectedDayIndex])
  const daylightMs = sunset.getTime() - sunrise.getTime()
  const zmanim = [
    ['Alos', addMinutes(sunrise, -72)],
    ['Netz', sunrise],
    ['S"Z Krias Shema', new Date(sunrise.getTime() + (daylightMs / 4))],
    ['S"Z Tefillah', new Date(sunrise.getTime() + (daylightMs / 3))],
    ['Chatzos', new Date(sunrise.getTime() + (daylightMs / 2))],
  ]
  if (sunrise.getDay() === 5) {
    zmanim.push(['Candle Lighting', addMinutes(sunset, -18)])
  }
  zmanim.push(['Shkia', sunset], ['Tzteis', addMinutes(sunset, 60)])

  for (const [name, time] of zmanim) {
    const item = document.createElement('div')
    item.className = 'zman-item'
    item.innerHTML = `<div class="zman-name">${name}</div><div class="zman-time">${formatClock(time)}</div>`
    grid.appendChild(item)
  }
}

function renderDaily() {
  ['d-hdr','d-temp','d-precip','d-wind'].forEach(clearRow)
  const d = weatherData.daily

  for (let i = 0; i < d.time.length; i++) {
    const sunset = new Date(d.sunset[i])
    let date = sunset.toLocaleDateString('en-US', { weekday:'short' })
    date += `, <span>${sunset.toLocaleDateString('en-US', { month:'short', day:'numeric' })}</span>`
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
  const hourCount = Math.min(24, h.time.length)

  const dayLabel = (() => {
    if (isCurrentDayView) return 'Today'
    const iso = weatherData.daily.time[selectedDayIndex]
    const [y, m, d] = iso.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
  })()
  document.getElementById('hourly-day-label').textContent = dayLabel

  const temps = h.temperature_2m.slice(0, hourCount)

  // Compute continuous daylight factor (0=night, 1=day) with 30-min fade
  const sunriseStr = weatherData.daily.sunrise?.[selectedDayIndex]
  const sunsetStr = weatherData.daily.sunset?.[selectedDayIndex]
  let dayFactors = null
  if (sunriseStr && sunsetStr) {
    const rise = new Date(sunriseStr).getTime()
    const set = new Date(sunsetStr).getTime()
    const FADE = 30 * 60 * 1000
    const DAY_MS = 24 * 60 * 60 * 1000
    dayFactors = h.time.slice(0, hourCount).map(t => {
      const ts = new Date(t).getTime()
      const dayFactor = (rise, set) => {
        const riseF = Math.min(1, Math.max(0, (ts - rise) / FADE))
        const setF  = Math.min(1, Math.max(0, (set  - ts) / FADE))
        return Math.min(riseF, setF)
      }
      return Math.max(dayFactor(rise, set), dayFactor(rise + DAY_MS, set + DAY_MS))
    })
  }

  const tempCell = document.createElement('td')
  tempCell.colSpan = hourCount || 1
  tempCell.className = 'h-temp-graph-cell'
  if (temps.length) {
    tempCell.appendChild(buildHourlyGraph(temps, dayFactors))
  }
  document.getElementById('h-temp').appendChild(tempCell)

  for (let i = 0; i < hourCount; i++) {
    const t = new Date(h.time[i])
    const label = t.toLocaleTimeString('en-US', { hour:'numeric', hour12:true })
    let [, icon] = wmo(h.weathercode[i])
    if (h.weathercode[i] < 2 && dayFactors && dayFactors[i] < 0.5) icon = '🌙'
    const temp = h.temperature_2m[i]
    const prob = h.precipitation_probability[i] ?? 0
    const amt = h.precipitation[i] ?? 0
    const wind = h.wind_speed_10m[i]

    /* header */
    const th = document.createElement('th')
    th.className = 'hr'
    th.innerHTML = `<div class="hr-time">${label}</div><span class="hr-icon">${icon}</span>`
    document.getElementById('h-hdr').appendChild(th)

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
setInterval(refresh, 14 * 60 * 1000)
setInterval(() => {
  const now = new Date()
  document.getElementById('hdr-time').textContent = now.toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' }).replace('PM', '') .replace('AM', '')
  document.getElementById('hdr-seconds').textContent = now.toLocaleTimeString('en-US', { second:'2-digit' }).padStart(2, '0')
  document.getElementById('hdr-date').textContent = now.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' })
}, 1 * 333)
