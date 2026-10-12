/**
 * TE-65: Runder Kinder-Avatar. Für Lenny, Emil, Hannes und Liddy gibt es gezeichnete
 * Porträts (assets/avatars, Zuordnung über den Vornamen); alle anderen Kinder
 * bekommen wie bisher einen Farbkreis mit Emoji bzw. Anfangsbuchstabe.
 */
import React from 'react';
import { View, Text, Image, ImageSourcePropType } from 'react-native';
import type { ChildConfig } from '../services/family';

const AVATARS: Record<string, ImageSourcePropType> = {
  lenny: require('../../assets/avatars/lenny.png'),
  emil: require('../../assets/avatars/emil.png'),
  hannes: require('../../assets/avatars/hannes.png'),
  liddy: require('../../assets/avatars/liddy.png'),
};

export function childAvatarSource(name: string): ImageSourcePropType | undefined {
  return AVATARS[name.trim().toLowerCase()];
}

interface Props {
  child: Pick<ChildConfig, 'name' | 'color' | 'emoji'>;
  size?: number;
}

export default function ChildAvatar({ child, size = 28 }: Props) {
  const src = childAvatarSource(child.name);
  const ring = Math.max(2, Math.round(size / 18));
  const circle = { width: size, height: size, borderRadius: size / 2 };
  if (src) {
    return (
      <Image
        source={src}
        accessibilityLabel={child.name}
        style={[circle, { borderWidth: ring, borderColor: child.color, backgroundColor: '#fff' }]}
      />
    );
  }
  return (
    <View style={[circle, { backgroundColor: child.color, alignItems: 'center', justifyContent: 'center' }]}>
      <Text style={{ fontSize: size * 0.5, fontWeight: '800', color: '#fff' }}>
        {child.emoji ?? child.name.charAt(0)}
      </Text>
    </View>
  );
}
