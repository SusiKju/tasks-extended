import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Group } from '../types';

interface Props {
  group: Group;
  small?: boolean;
}

export function GroupBadge({ group, small = false }: Props) {
  return (
    <View style={[styles.badge, { backgroundColor: group.color + '22', borderColor: group.color }, small && styles.small]}>
      <View style={[styles.dot, { backgroundColor: group.color }]} />
      <Text style={[styles.label, { color: group.color }, small && styles.smallLabel]}>
        {group.name}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    alignSelf: 'flex-start',
    gap: 4,
  },
  small: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
  },
  smallLabel: {
    fontSize: 10,
  },
});
