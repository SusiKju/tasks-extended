/**
 * SearchInput.tsx
 *
 * Globale Suchfeld-Komponente für konsistentes Design über alle Screens hinweg (TE-98).
 * Bietet: Suchicon, Eingabe, Clear-Button + standardisiertes Styling.
 */

import React from 'react';
import {
  View,
  TextInput as RNTextInput,
  Pressable,
  StyleSheet,
  Platform,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemeColors } from '../utils/theme';

interface SearchInputProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  placeholderTextColor?: string;
  style?: ViewStyle;
  colors: ThemeColors;
  clearButtonMode?: 'never' | 'while-editing' | 'always';
  autoCorrect?: boolean;
  testID?: string;
}

export function SearchInput({
  value,
  onChangeText,
  placeholder = 'Suchen…',
  placeholderTextColor,
  style,
  colors,
  clearButtonMode = 'while-editing',
  autoCorrect = false,
  testID,
}: SearchInputProps) {
  const s = styles(colors);

  const shouldShowClear = clearButtonMode === 'always' || (clearButtonMode === 'while-editing' && !!value);

  return (
    <View style={[s.container, style]}>
      <Ionicons name="search" size={18} color={colors.textSecondary} />
      <RNTextInput
        style={s.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={placeholderTextColor || colors.placeholder}
        autoCorrect={autoCorrect}
        testID={testID}
      />
      {shouldShowClear && (
        <Pressable
          onPress={() => onChangeText('')}
          hitSlop={8}
          accessibilityLabel="Suche leeren"
        >
          <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
        </Pressable>
      )}
    </View>
  );
}

const styles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: colors.inputBackground,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: Platform.OS === 'ios' ? 11 : 8,
    },
    input: {
      flex: 1,
      color: colors.text,
      fontSize: 15,
      fontWeight: '400',
    },
  });
