/**
 * weather.ts (TE-126)
 *
 * Kompakte Wettervorhersage fürs Dashboard – heute & morgen, Temperatur und
 * Windgeschwindigkeit, fest für die Postleitzahl 01139 (Dresden).
 *
 * Datenquelle: Open-Meteo (https://open-meteo.com) – kostenlos, ohne API-Key.
 * Koordinaten für PLZ 01139 Dresden: 51.083° N, 13.672° O.
 */

const LATITUDE = 51.083;
const LONGITUDE = 13.672;

export interface DailyWeather {
  /** ISO-Datum (YYYY-MM-DD) */
  date: string;
  tempMax: number;
  tempMin: number;
  windSpeedMax: number;
  /** WMO Weather-Code – Basis für Icon/Beschreibung */
  weatherCode: number;
}

export interface WeatherForecast {
  today: DailyWeather;
  tomorrow: DailyWeather;
}

/**
 * Lädt die Vorhersage für heute & morgen von Open-Meteo.
 * Gibt `null` zurück, wenn die Anfrage fehlschlägt (z. B. kein Netz) –
 * der Aufrufer blendet die Karte dann einfach aus, statt ewig zu laden.
 */
export async function fetchWeatherForecast(): Promise<WeatherForecast | null> {
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${LATITUDE}&longitude=${LONGITUDE}` +
      `&daily=temperature_2m_max,temperature_2m_min,wind_speed_10m_max,weather_code` +
      `&timezone=Europe%2FBerlin&forecast_days=2`;

    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const d = data?.daily;
    if (!d?.time?.length || d.time.length < 2) return null;

    const toDay = (i: number): DailyWeather => ({
      date: d.time[i],
      tempMax: Math.round(d.temperature_2m_max[i]),
      tempMin: Math.round(d.temperature_2m_min[i]),
      windSpeedMax: Math.round(d.wind_speed_10m_max[i]),
      weatherCode: d.weather_code[i],
    });

    return { today: toDay(0), tomorrow: toDay(1) };
  } catch (error) {
    console.warn('fetchWeatherForecast fehlgeschlagen', error);
    return null;
  }
}

/** Grobe Zuordnung WMO-Wettercode → Ionicons-Name + kurze Beschreibung (deutsch). */
export function weatherIconAndLabel(code: number): { icon: string; label: string } {
  if (code === 0) return { icon: 'sunny-outline', label: 'Klar' };
  if (code <= 2) return { icon: 'partly-sunny-outline', label: 'Leicht bewölkt' };
  if (code === 3) return { icon: 'cloud-outline', label: 'Bewölkt' };
  if (code === 45 || code === 48) return { icon: 'cloud-outline', label: 'Nebel' };
  if (code >= 51 && code <= 57) return { icon: 'rainy-outline', label: 'Nieselregen' };
  if (code >= 61 && code <= 67) return { icon: 'rainy-outline', label: 'Regen' };
  if (code >= 71 && code <= 77) return { icon: 'snow-outline', label: 'Schnee' };
  if (code >= 80 && code <= 82) return { icon: 'rainy-outline', label: 'Schauer' };
  if (code >= 85 && code <= 86) return { icon: 'snow-outline', label: 'Schneeschauer' };
  if (code >= 95) return { icon: 'thunderstorm-outline', label: 'Gewitter' };
  return { icon: 'partly-sunny-outline', label: 'Wechselhaft' };
}
