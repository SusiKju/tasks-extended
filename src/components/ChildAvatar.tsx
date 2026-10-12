/**
 * TE-65: Runder Kinder-Avatar. Für Lenny, Emil, Hannes und Liddy gibt es gezeichnete
 * Porträts (assets/avatars, Zuordnung über den Vornamen); alle anderen Kinder
 * bekommen wie bisher einen Farbkreis mit Emoji bzw. Anfangsbuchstabe.
 */
import React from 'react';
import { View, Text, Image, ImageSourcePropType } from 'react-native';
import type { ChildConfig } from '../services/family';
import { useTheme } from '../utils/theme';

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
  const { colors } = useTheme();
  const src = childAvatarSource(child.name);
  const circle = { width: size, height: size, borderRadius: size / 2 };
  if (src) {
    return (
      <Image
        source={src}
        accessibilityLabel={child.name}
        // TE-73: PNGs sind transparente Strichzeichnungen; Linien in Textfarbe (Dark Theme = weiß).
        style={[circle, { tintColor: colors.text }]}
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
