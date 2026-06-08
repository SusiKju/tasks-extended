/**
 * weather.ts (TE-126/TE-127/TE-129)
 *
 * Wettervorhersage fürs Dashboard – heute kompakt, im Modal heute + die
 * nächsten 3 Tage (Temperatur & Windgeschwindigkeit), fest für die
 * Postleitzahl 01139 (Dresden).
 *
 * TE-129: Statt der Tages-Extremwerte (die auch nachts auftreten können)
 * zählt nur das Zeitfenster, in dem die Kinder unterwegs/in der Schule sind:
 * 07:00–15:00 Uhr. So zeigt die Karte genau das Wetter, das morgens beim
 * Loslaufen und nachmittags beim Heimkommen tatsächlich relevant ist.
 *
 * Datenquelle: Open-Meteo (https://open-meteo.com) – kostenlos, ohne API-Key.
 * Koordinaten für PLZ 01139 Dresden: 51.083° N, 13.672° O.
 */

const LATITUDE = 51.083;
const LONGITUDE = 13.672;

/** Heute + 3 weitere Tage = 4 Tage Vorhersage (TE-127). */
const FORECAST_DAYS = 4;

/** Schulzeit-Fenster der Kinder: 07:00 (Hausverlassen) bis 15:00 (Heimkommen) – TE-129. */
const WINDOW_START_HOUR = 7;
const WINDOW_END_HOUR = 15;

export interface DailyWeather {
  /** ISO-Datum (YYYY-MM-DD) */
  date: string;
  /** Min/Max-Temperatur NUR im Schulzeit-Fenster 07–15 Uhr (TE-129). */
  tempMax: number;
  tempMin: number;
  /** Höchste Windgeschwindigkeit im Schulzeit-Fenster 07–15 Uhr (TE-129). */
  windSpeedMax: number;
  /** Repräsentativer WMO-Wettercode fürs Fenster (Wert um die Mittagszeit). */
  weatherCode: number;
}

export interface WeatherForecast {
  /** [heute, morgen, übermorgen, in 3 Tagen] – chronologisch aufsteigend. */
  days: DailyWeather[];
}

/**
 * Lädt die Vorhersage für heute + die nächsten 3 Tage von Open-Meteo und
 * verdichtet sie auf das Schulzeit-Fenster 07:00–15:00 Uhr (TE-129).
 *
 * Gibt `null` zurück, wenn die Anfrage fehlschlägt (z. B. kein Netz) –
 * der Aufrufer blendet die Karte dann einfach aus, statt ewig zu laden.
 */
export async function fetchWeatherForecast(): Promise<WeatherForecast | null> {
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${LATITUDE}&longitude=${LONGITUDE}` +
      `&hourly=temperature_2m,wind_speed_10m,weather_code` +
      `&timezone=Europe%2FBerlin&forecast_days=${FORECAST_DAYS}`;

    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const h = data?.hourly;
    if (!h?.time?.length) return null;

    // Stunden nach Kalendertag (YYYY-MM-DD) gruppieren und dabei nur das
    // Schulzeit-Fenster 07–15 Uhr berücksichtigen (TE-129).
    const byDay = new Map<string, { temps: number[]; winds: number[]; codes: number[] }>();
    for (let i = 0; i < h.time.length; i++) {
      const iso: string = h.time[i]; // z. B. "2026-06-08T07:00"
      const [date, time] = iso.split('T');
      const hour = parseInt(time.slice(0, 2), 10);
      if (hour < WINDOW_START_HOUR || hour > WINDOW_END_HOUR) continue;

      if (!byDay.has(date)) byDay.set(date, { temps: [], winds: [], codes: [] });
      const bucket = byDay.get(date)!;
      bucket.temps.push(h.temperature_2m[i]);
      bucket.winds.push(h.wind_speed_10m[i]);
      bucket.codes.push(h.weather_code[i]);
    }

    const days: DailyWeather[] = Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(0, FORECAST_DAYS)
      .map(([date, bucket]) => {
        if (!bucket.temps.length) return null;
        // Repräsentativer Code: die mittlere Stunde des Fensters (≈ Mittag).
        const midIndex = Math.floor(bucket.codes.length / 2);
        return {
          date,
          tempMax: Math.round(Math.max(...bucket.temps)),
          tempMin: Math.round(Math.min(...bucket.temps)),
          windSpeedMax: Math.round(Math.max(...bucket.winds)),
          weatherCode: bucket.codes[midIndex],
        };
      })
      .filter((d): d is DailyWeather => d !== null);

    if (!days.length) return null;
    return { days };
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

/** Wandelt ein ISO-Datum in eine deutsche Kurzform um, z. B. "Heute", "Morgen", "Mi., 11.06.". */
export function weatherDayLabel(isoDate: string, index: number): string {
  if (index === 0) return 'Heute';
  if (index === 1) return 'Morgen';
  const d = new Date(isoDate + 'T00:00:00');
  const weekday = d.toLocaleDateString('de-DE', { weekday: 'short' });
  const dayMonth = d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
  return `${weekday}, ${dayMonth}.`;
}

/** Ein einzelnes Kleidungsstück/Utensil zum Anziehen – groß bebildert per Emoji. */
export interface ClothingItem {
  /** Großes Emoji als visuelles Symbol – auf einen Blick erkennbar, auch für Kinder. */
  emoji: string;
  /** Kurzer Name des Kleidungsstücks, z. B. "T-Shirt", "Mütze". */
  label: string;
}

/**
 * Liefert eine Liste konkreter, bebilderter Kleidungsstücke für einen Tag –
 * basierend auf Höchst-/Tiefsttemperatur, Wettercode und Wind im
 * Schulzeit-Fenster. Bewusst als Symbol+Wort-Paare (statt Sätze) aufbereitet,
 * damit Kinder auf den ersten Blick erkennen, was sie anziehen sollen.
 * Wird im Dialog angezeigt, der beim Antippen der Temperatur erscheint.
 */
export function clothingItems(day: DailyWeather): ClothingItem[] {
  const { tempMax, tempMin, weatherCode, windSpeedMax } = day;
  const items: ClothingItem[] = [];

  const isSunny = weatherCode <= 2;
  const isRainy = (weatherCode >= 51 && weatherCode <= 67) || (weatherCode >= 80 && weatherCode <= 82);
  const isSnowy = (weatherCode >= 71 && weatherCode <= 77) || (weatherCode >= 85 && weatherCode <= 86);

  // Oberteil – die Hauptempfehlung nach Temperatur
  if (tempMax >= 24) {
    items.push({ emoji: '👕', label: 'Kurzärmeliges T-Shirt' });
  } else if (tempMax >= 17) {
    items.push({ emoji: '👕', label: 'T-Shirt' });
    items.push({ emoji: '🧥', label: 'Dünne Jacke zum Drüberziehen' });
  } else if (tempMax >= 10) {
    items.push({ emoji: '🥼', label: 'Langärmeliges Shirt' });
    items.push({ emoji: '🧶', label: 'Pullover' });
  } else if (tempMax >= 2) {
    items.push({ emoji: '🧶', label: 'Warmer Pullover' });
    items.push({ emoji: '🧥', label: 'Winterjacke' });
  } else {
    items.push({ emoji: '🧥', label: 'Dicke Winterjacke' });
    items.push({ emoji: '🧣', label: 'Schal' });
  }

  // Hose
  if (tempMax >= 22) {
    items.push({ emoji: '🩳', label: 'Kurze Hose' });
  } else {
    items.push({ emoji: '👖', label: 'Lange Hose' });
  }

  // Kopf: Mütze bei Kälte, Sonnenkappe bei Hitze + Sonne
  if (tempMax <= 5) {
    items.push({ emoji: '🧢', label: 'Mütze' });
  } else if (tempMax >= 23 && isSunny) {
    items.push({ emoji: '🧢', label: 'Mütze gegen die Sonne' });
  }

  // Hände: Handschuhe bei Frost
  if (tempMax <= 0) {
    items.push({ emoji: '🧤', label: 'Handschuhe' });
  }

  // Sonnenschutz bei Hitze und viel Sonne
  if (tempMax >= 22 && isSunny) {
    items.push({ emoji: '🧴', label: 'Sonnencreme' });
    items.push({ emoji: '🕶️', label: 'Sonnenbrille' });
  }

  // Regen- bzw. Schneeschutz
  if (isRainy) {
    items.push({ emoji: '☂️', label: 'Regenschirm oder Regenjacke' });
    items.push({ emoji: '🥾', label: 'Gummistiefel' });
  } else if (isSnowy) {
    items.push({ emoji: '🥾', label: 'Warme, wasserfeste Schuhe' });
  }

  // Wind: zusätzlich winddichte Jacke, falls noch keine Jacke vorgeschlagen wurde
  if (windSpeedMax >= 35 && !items.some((i) => i.label.toLowerCase().includes('jacke'))) {
    items.push({ emoji: '🧥', label: 'Winddichte Jacke' });
  }

  // Großer Unterschied zwischen Morgen und Mittag: etwas zum Drüberziehen
  if (tempMax - tempMin >= 8 && !items.some((i) => i.label.toLowerCase().includes('drüberziehen'))) {
    items.push({ emoji: '🧥', label: 'Etwas zum Drüberziehen für den Morgen' });
  }

  return items;
}

/** Anzeigetext für das berücksichtigte Zeitfenster, z. B. in Untertiteln (TE-129). */
export const SCHOOL_WINDOW_LABEL = `${WINDOW_START_HOUR}–${WINDOW_END_HOUR} Uhr (Schulzeit der Kinder)`;
