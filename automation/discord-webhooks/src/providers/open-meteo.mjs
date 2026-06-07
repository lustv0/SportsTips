const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';

async function fetchJson(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Open-Meteo request failed (${response.status}).`);
  }

  return response.json();
}

function toNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function parseForecastTimeMs(value, utcOffsetSeconds = 0) {
  const raw = String(value || '').trim();

  if (!raw) {
    return Number.NaN;
  }

  if (/[zZ]|[+-]\d{2}:\d{2}$/u.test(raw)) {
    return new Date(raw).getTime();
  }

  const withSeconds = raw.length === 16 ? `${raw}:00` : raw;
  const parsed = new Date(`${withSeconds}Z`).getTime();

  return Number.isFinite(parsed) ? parsed - Number(utcOffsetSeconds || 0) * 1000 : Number.NaN;
}

function findClosestHourlyIndex(times, targetIso, utcOffsetSeconds = 0) {
  const targetMs = new Date(targetIso).getTime();

  if (!Number.isFinite(targetMs) || !Array.isArray(times) || !times.length) {
    return -1;
  }

  let bestIndex = -1;
  let bestDiff = Number.POSITIVE_INFINITY;

  for (const [index, value] of times.entries()) {
    const diff = Math.abs(parseForecastTimeMs(value, utcOffsetSeconds) - targetMs);

    if (diff < bestDiff) {
      bestDiff = diff;
      bestIndex = index;
    }
  }

  return bestIndex;
}

export function buildOpenMeteoEventWeatherSnapshot(forecast, startTime) {
  const times = forecast?.hourly?.time || [];
  const index = findClosestHourlyIndex(times, startTime, forecast?.utc_offset_seconds || 0);

  if (index === -1) {
    return null;
  }

  return {
    forecastTime: times[index],
    temperatureC: toNumber(forecast.hourly?.temperature_2m?.[index]),
    precipitationProbability: toNumber(forecast.hourly?.precipitation_probability?.[index]),
    precipitationMm: toNumber(forecast.hourly?.precipitation?.[index]),
    windSpeedKmh: toNumber(forecast.hourly?.wind_speed_10m?.[index]),
    windGustsKmh: toNumber(forecast.hourly?.wind_gusts_10m?.[index]),
    weatherCode: toNumber(forecast.hourly?.weather_code?.[index])
  };
}

export async function geocodeOpenMeteoLocation(query, options = {}) {
  const url = new URL(GEOCODING_URL);
  url.searchParams.set('name', String(query || ''));
  url.searchParams.set('count', String(options.count || 5));
  url.searchParams.set('language', options.language || 'en');
  url.searchParams.set('format', 'json');

  if (options.countryCode) {
    url.searchParams.set('countryCode', options.countryCode);
  }

  const payload = await fetchJson(url);
  return Array.isArray(payload?.results) ? payload.results : [];
}

export async function fetchOpenMeteoForecast(location, options = {}) {
  if (toNumber(location?.latitude) === null || toNumber(location?.longitude) === null) {
    return {
      status: 'invalid_request',
      sourceUrl: '',
      forecast: null
    };
  }

  const url = new URL(FORECAST_URL);
  url.searchParams.set('latitude', String(location.latitude));
  url.searchParams.set('longitude', String(location.longitude));
  url.searchParams.set('hourly', [
    'temperature_2m',
    'precipitation_probability',
    'precipitation',
    'wind_speed_10m',
    'wind_gusts_10m',
    'weather_code'
  ].join(','));
  url.searchParams.set('timezone', options.timezone || 'auto');

  if (options.startHour) {
    url.searchParams.set('start_hour', options.startHour);
  }

  if (options.endHour) {
    url.searchParams.set('end_hour', options.endHour);
  }

  const forecast = await fetchJson(url);

  return {
    status: 'ok',
    sourceUrl: url.toString(),
    forecast
  };
}