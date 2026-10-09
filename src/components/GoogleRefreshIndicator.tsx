/**
 * TE-42: Dezenter Hinweis, solange im Web das Google-Token erneuert wird.
 * GIS öffnet dabei kurz ein Pop-up, das sich nicht unterdrücken lässt – die
 * Pusteblume oben zeigt, dass das gewollt ist und gleich vorbei ist.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, Text, View } from 'react-native';
import { useGoogleRefreshing } from '../services/googleCalendar';

const RAYS = 8; // Linien durch die Mitte → 16 Schirmchen
const MIN_VISIBLE_MS = 1200; // sonst blitzt der Hinweis nur kurz auf

export function GoogleRefreshIndicator() {
  const refreshing = useGoogleRefreshing((s) => s.refreshing);
  const [visible, setVisible] = useState(false);
  const shownAt = useRef(0);
  const spin = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (refreshing) {
      shownAt.current = Date.now();
      setVisible(true);
      return;
    }
    const t = setTimeout(() => setVisible(false), Math.max(0, MIN_VISIBLE_MS - (Date.now() - shownAt.current)));
    return () => clearTimeout(t);
  }, [refreshing]);

  useEffect(() => {
    Animated.timing(fade, { toValue: visible ? 1 : 0, duration: 250, useNativeDriver: false }).start();
    if (!visible) return;
    const loop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 6000, easing: Easing.linear, useNativeDriver: false }),
    );
    loop.start();
    return () => loop.stop();
  }, [visible]);

  if (Platform.OS !== 'web' || !visible) return null;
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View pointerEvents="none" style={styles.wrap}>
      <Animated.View style={[styles.pill, { opacity: fade }]} accessibilityRole="progressbar" accessibilityLabel="Anmeldung bei Google läuft">
        <Animated.View style={[styles.flower, { transform: [{ rotate }] }]}>
          {Array.from({ length: RAYS }, (_, i) => (
            <View key={i} style={[styles.ray, { transform: [{ rotate: `${(180 / RAYS) * i}deg` }] }]}>
              <View style={styles.seed} />
              <View style={styles.seed} />
            </View>
          ))}
          <View style={styles.core} />
        </Animated.View>
        <Text style={styles.text}>Anmeldung bei Google …</Text>
      </Animated.View>
    </View>
  );
}

const SIZE = 22;
const styles = StyleSheet.create({
  wrap: { position: 'absolute', top: 10, left: 0, right: 0, alignItems: 'center', zIndex: 1000 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 6, paddingLeft: 8, paddingRight: 12, borderRadius: 999,
    backgroundColor: 'rgba(28,28,30,0.92)', borderWidth: StyleSheet.hairlineWidth, borderColor: '#3a3a3c',
  },
  flower: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  ray: {
    position: 'absolute', width: SIZE, height: 1, backgroundColor: 'rgba(255,255,255,0.35)',
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  seed: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: '#fff' },
  core: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#e8e2c8' },
  text: { color: '#e5e5e7', fontSize: 12, fontWeight: '600' },
});
