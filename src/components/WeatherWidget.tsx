/**
 * WeatherWidget.tsx (TE-126/TE-127)
 *
 * Kompakte Wetteranzeige oben auf dem Dashboard, links neben dem Sync-Button:
 * zeigt nur HEUTE Temperatur (Min/Max) und Windgeschwindigkeit für PLZ 01139
 * (Dresden). Antippen öffnet ein Modal mit der ausführlicheren Vorhersage für
 * heute + die nächsten 3 Tage (siehe services/weather.ts).
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemeColors } from '../utils/theme';
import {
  fetchWeatherForecast,
  weatherIconAndLabel,
  weatherDayLabel,
  clothingAdvice,
  SCHOOL_WINDOW_LABEL,
  DailyWeather,
  WeatherForecast,
} from '../services/weather';

function DayRow({ day, index, colors }: { day: DailyWeather; index: number; colors: ThemeColors }) {
  const { icon, label } = weatherIconAndLabel(day.weatherCode);
  return (
    <View style={[styles.modalRow, { borderBottomColor: colors.border }]}>
      <View style={styles.modalDayCol}>
        <Text style={[styles.modalDayLabel, { color: colors.text }]}>{weatherDayLabel(day.date, index)}</Text>
        <Text style={[styles.modalDayDesc, { color: colors.textMuted }]}>{label}</Text>
      </View>
      <Ionicons name={icon as any} size={22} color={colors.textSecondary} />
      <View style={styles.modalTempCol}>
        <Text style={[styles.modalTemp, { color: colors.text }]}>
          {day.tempMax}° <Text style={{ color: colors.textMuted, fontWeight: '400' }}>/ {day.tempMin}°</Text>
        </Text>
      </View>
      <View style={styles.modalWindCol}>
        <Ionicons name="navigate-outline" size={13} color={colors.textMuted} />
        <Text style={[styles.modalWindText, { color: colors.textMuted }]}>{day.windSpeedMax} km/h</Text>
      </View>
    </View>
  );
}

export function WeatherWidget({ colors }: { colors: ThemeColors }) {
  const [forecast, setForecast] = useState<WeatherForecast | null | undefined>(undefined);
  const [modalVisible, setModalVisible] = useState(false);
  const [adviceVisible, setAdviceVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchWeatherForecast().then((f) => {
      if (!cancelled) setForecast(f);
    });
    return () => { cancelled = true; };
  }, []);

  // Während des Ladens oder bei Fehler bleibt die Zeile schlicht leer –
  // kein Spinner nötig, das Wetter ist nur ein Bonus, kein kritisches Feature.
  if (!forecast || !forecast.days.length) return null;

  const today = forecast.days[0];
  const { icon } = weatherIconAndLabel(today.weatherCode);

  return (
    <>
      <Pressable
        onPress={() => setModalVisible(true)}
        style={({ pressed }) => [
          styles.chip,
          { borderColor: colors.border, backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 },
        ]}
        hitSlop={6}
      >
        <Ionicons name={icon as any} size={16} color={colors.textSecondary} />
        <Pressable
          onPress={(e) => {
            e.stopPropagation();
            setAdviceVisible(true);
          }}
          hitSlop={6}
        >
          <Text style={[styles.chipTemp, { color: colors.text }]}>
            {today.tempMax}° <Text style={{ color: colors.textMuted }}>/ {today.tempMin}°</Text>
          </Text>
        </Pressable>
        <View style={styles.chipWind}>
          <Ionicons name="navigate-outline" size={11} color={colors.textMuted} />
          <Text style={[styles.chipWindText, { color: colors.textMuted }]}>{today.windSpeedMax} km/h</Text>
        </View>
      </Pressable>

      <Modal visible={modalVisible} animationType="fade" transparent onRequestClose={() => setModalVisible(false)}>
        <Pressable style={styles.backdrop} onPress={() => setModalVisible(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Wetter · PLZ 01139</Text>
              <Pressable onPress={() => setModalVisible(false)} hitSlop={10}>
                <Ionicons name="close" size={20} color={colors.textMuted} />
              </Pressable>
            </View>
            <Text style={[styles.modalSubtitle, { color: colors.textMuted }]}>
              Heute und die nächsten drei Tage – Temperatur und Windgeschwindigkeit{'\n'}
              jeweils für {SCHOOL_WINDOW_LABEL}
            </Text>
            <View style={{ marginTop: 6 }}>
              {forecast.days.map((day, i) => (
                <DayRow key={day.date} day={day} index={i} colors={colors} />
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={adviceVisible} animationType="fade" transparent onRequestClose={() => setAdviceVisible(false)}>
        <Pressable style={styles.backdrop} onPress={() => setAdviceVisible(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Was zieh ich heute an?</Text>
              <Pressable onPress={() => setAdviceVisible(false)} hitSlop={10}>
                <Ionicons name="close" size={20} color={colors.textMuted} />
              </Pressable>
            </View>
            <Text style={[styles.modalSubtitle, { color: colors.textMuted }]}>
              {today.tempMax}° / {today.tempMin}° für {SCHOOL_WINDOW_LABEL}
            </Text>
            <View style={{ marginTop: 10, gap: 8 }}>
              {clothingAdvice(today).map((tip, i) => (
                <View key={i} style={styles.adviceRow}>
                  <Ionicons name="shirt-outline" size={16} color={colors.accent} style={{ marginTop: 1 }} />
                  <Text style={[styles.adviceText, { color: colors.text }]}>{tip}</Text>
                </View>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipTemp: { fontSize: 13, fontWeight: '700' },
  chipWind: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  chipWindText: { fontSize: 10.5 },

  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontSize: 16, fontWeight: '800' },
  modalSubtitle: { fontSize: 12, marginTop: 4, lineHeight: 17 },

  adviceRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  adviceText: { fontSize: 14, lineHeight: 20, flex: 1 },

  modalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalDayCol: { flex: 1.2 },
  modalDayLabel: { fontSize: 14, fontWeight: '700' },
  modalDayDesc: { fontSize: 11, marginTop: 1 },
  modalTempCol: { flex: 0.9, alignItems: 'flex-end' },
  modalTemp: { fontSize: 15, fontWeight: '700' },
  modalWindCol: { flexDirection: 'row', alignItems: 'center', gap: 3, flex: 0.9, justifyContent: 'flex-end' },
  modalWindText: { fontSize: 11.5 },
});
