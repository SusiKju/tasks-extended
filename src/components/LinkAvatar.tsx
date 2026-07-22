/**
 * LinkAvatar.tsx
 *
 * Quadratisches Link-Symbol: zeigt das Favicon der Domain vollflächig, fällt bei
 * Lade-Fehler (oder fehlender URL) auf das hinterlegte Ionicons-Symbol vor
 * farbigem Hintergrund zurück (TE-32/TE-33).
 *
 * TE-35: ringförmiger Rahmen (~4px), dezent einfarbig. Dieselbe Komponente
 * wird im Link-Tab und in der Dashboard-Leiste genutzt.
 *
 * TE-86: kennt Google's Favicon-Dienst eine Domain nicht (404), wird als zweiter
 * Versuch das eigene <link rel="icon">-Tag der Seite nachgeladen, bevor auf das
 * Ionicons-Symbol zurückgefallen wird.
 */

import React, { useState, useEffect } from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../utils/theme';
import { LinkItem, faviconUrl, fetchPageFaviconUrl } from '../services/links';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const BORDER = 3;

export function LinkAvatar({ link, size }: { link: LinkItem; size: number }) {
  const { colors } = useTheme();
  const fav = faviconUrl(link.url, 64);
  const [googleFailed, setGoogleFailed] = useState(false);
  const [pageFavUrl, setPageFavUrl] = useState<string | null>(null);
  const [pageFetchDone, setPageFetchDone] = useState(false);
  const [pageFailed, setPageFailed] = useState(false);

  // Bei URL-Wechsel erneuten Favicon-Versuch erlauben.
  useEffect(() => {
    setGoogleFailed(false);
    setPageFavUrl(null);
    setPageFetchDone(false);
    setPageFailed(false);
  }, [fav]);

  // TE-86: Google's Dienst kennt manche Domains nicht (404) – dann das eigene
  // Favicon-Tag der Seite als zweiten Versuch nachladen.
  useEffect(() => {
    if (!googleFailed || pageFetchDone) return;
    let cancelled = false;
    fetchPageFaviconUrl(link.url).then((url) => {
      if (cancelled) return;
      setPageFavUrl(url);
      setPageFetchDone(true);
    });
    return () => { cancelled = true; };
  }, [googleFailed, pageFetchDone, link.url]);

  const iconName = (link.icon as IoniconName) ?? 'link-outline';

  const outerRadius = Math.round(size * 0.26);
  const innerSize = size - BORDER * 2;
  const innerRadius = Math.round(innerSize * 0.22);

  const src = !googleFailed ? fav : (pageFavUrl && !pageFailed ? pageFavUrl : null);

  // Innenfläche: Favicon vollflächig oder Ionicons-Fallback vor Link-Farbe.
  const inner = (
    <View style={[styles.inner, { width: innerSize, height: innerSize, borderRadius: innerRadius, backgroundColor: link.color }]}>
      {src ? (
        <Image
          source={{ uri: src }}
          style={{ width: innerSize, height: innerSize }}
          resizeMode="cover"
          onError={() => (googleFailed ? setPageFailed(true) : setGoogleFailed(true))}
        />
      ) : (
        <Ionicons name={iconName} size={Math.round(innerSize * 0.46)} color="#fff" />
      )}
    </View>
  );

  return (
    <View style={[styles.ring, { width: size, height: size, borderRadius: outerRadius, backgroundColor: colors.border }]}>
      {inner}
    </View>
  );
}

const styles = StyleSheet.create({
  ring: { alignItems: 'center', justifyContent: 'center', padding: BORDER },
  inner: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
