/**
 * GradientButton.tsx (TE-62)
 *
 * Pressable mit Verlaufsfläche. Ohne `gradient` rendert er `fallbackStyle`
 * (z. B. Outline) – so entscheidet das Theme, ob ein Button glänzt.
 */

import React from 'react';
import { Pressable, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ButtonGradient } from '../utils/theme';

export function GradientButton({
  gradient,
  onPress,
  disabled,
  style,
  fallbackStyle,
  accessibilityLabel,
  children,
}: {
  gradient?: ButtonGradient;
  onPress: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  fallbackStyle?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        style,
        gradient ? styles.clip : fallbackStyle,
        { opacity: disabled ? 0.45 : pressed ? 0.8 : 1 },
      ]}
    >
      {gradient && (
        <LinearGradient colors={gradient.colors} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
      )}
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({ clip: { overflow: 'hidden', borderWidth: 0 } });
