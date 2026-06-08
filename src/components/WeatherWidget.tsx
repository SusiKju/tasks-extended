/**
 * WeatherWidget.tsx (TE-126)
 *
 * Kompakte Wettervorhersage oben auf dem Dashboard, links neben dem
 * Sync-Button: heute & morgen, Temperatur (Min/Max) und Windgeschwindigkeit,
 * für PLZ 01139 (Dresden) – siehe services/weather.ts.
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemeColors } from '../utils/theme';
import {
  fetchWeatherForecast,
  weatherIconAndLabel,
  DailyWeather,
  WeatherForecast,
} from '../services/weather';

function DayChip({ label, day, colors }: { label: string; day: DailyWeather; colors: ThemeColors }) {
  const { icon } = weatherIconAndLabel(day.weatherCode);
  return (
    <View style={[styles.chip, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      <Text style={[styles.chipLabel, { color: colors.textMuted }]}>{label}</Text>
      <Ionicons name={icon as any} size={16} color={colors.textSecondary} />
      <Text style={[styles.chipTemp, { color: colors.text }]}>
        {day.tempMax}° <Text style={{ color: colors.textMuted }}>/ {day.tempMin}°</Text>
      </Text>
      <View style={styles.chipWind}>
        <Ionicons name="navigate-outline" size={11} color={colors.textMuted} />
        <Text style={[styles.chipWindText, { color: colors.textMuted }]}>{day.windSpeedMax} km/h</Text>
      </View>
    </View>
  );
}

export function WeatherWidget({ colors }: { colors: ThemeColors }) {
  const [forecast, setForecast] = useState<WeatherForecast | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetchWeatherForecast().then((f) => {
      if (!cancelled) setForecast(f);
    });
    return () => { cancelled = true; };
  }, []);

  // Während des Ladens oder bei Fehler bleibt die Zeile schlicht leer –
  // kein Spinner nötig, das Wetter ist nur ein Bonus, kein kritisches Feature.
  if (!forecast) return null;

  return (
    <View style={styles.row}>
      <DayChip label="Heute" day={forecast.today} colors={colors} />
      <DayChip label="Morgen" day={forecast.tomorrow} colors={colors} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipLabel: { fontSize: 11, fontWeight: '700' },
  chipTemp: { fontSize: 13, fontWeight: '700' },
  chipWind: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  chipWindText: { fontSize: 10.5 },
});
