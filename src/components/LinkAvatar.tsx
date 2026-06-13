/**
 * LinkAvatar.tsx
 *
 * Quadratisches Link-Symbol: zeigt das Favicon der Domain, fällt bei Lade-Fehler
 * (oder fehlender URL) auf das hinterlegte Ionicons-Symbol vor farbigem
 * Hintergrund zurück (TE-32). Wird sowohl im Link-Tab als auch in der
 * Dashboard-Schnellleiste verwendet.
 */

import React, { useState, useEffect } from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinkItem, faviconUrl } from '../services/links';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

export function LinkAvatar({ link, size }: { link: LinkItem; size: number }) {
  const fav = faviconUrl(link.url, 64);
  const [failed, setFailed] = useState(false);

  // Bei URL-Wechsel erneuten Favicon-Versuch erlauben.
  useEffect(() => { setFailed(false); }, [fav]);

  const radius = Math.round(size * 0.22);
  const iconName = (link.icon as IoniconName) ?? 'link-outline';

  if (fav && !failed) {
    return (
      <View style={[styles.wrap, { width: size, height: size, borderRadius: radius, backgroundColor: '#FFFFFF' }]}>
        <Image
          source={{ uri: fav }}
          style={{ width: Math.round(size * 0.62), height: Math.round(size * 0.62) }}
          resizeMode="contain"
          onError={() => setFailed(true)}
        />
      </View>
    );
  }

  return (
    <View style={[styles.wrap, { width: size, height: size, borderRadius: radius, backgroundColor: link.color }]}>
      <Ionicons name={iconName} size={Math.round(size * 0.46)} color="#fff" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
