/**
 * FeedBlock.tsx
 *
 * "Mein Tag" – konfigurierbarer Dashboard-Block (DashboardBlockKey 'feed').
 * Vereint alle "zu erledigenden"/anstehenden Dinge (Tasks, Kinder-Aufgaben, Mail,
 * Termine, Geburtstage, Geteilte Liste, Geistesblitze, Notizblock, Taschengeld)
 * als EINE durchgehende Liste – schlank, ohne Zeitgruppen-Header/-Karten.
 * Jede Kategorie hat ein eigenes, farbiges Icon (gut unterscheidbar in beiden
 * dunklen Themes). Wichtige/überfällige Items werden über ein dunkelrosa
 * Badge markiert statt über Textfarbe. Additiv neben den bestehenden
 * Einzel-Blöcken, standardmäßig AUS (siehe DEFAULT_DASHBOARD_BLOCKS). v1: nur
 * Tippen → Navigation, kein Direkt-Abhaken.
 *
 * Manuelle Sortierung per Auf/Ab-Pfeilen (keine Drag-Geste, da keine
 * reanimated/gesture-handler-Abhängigkeit im Projekt) – eine flache
 * Reihenfolge über die ganze Liste (siehe feedOrderService.ts). Items ohne
 * Eintrag fallen auf die Default-Sortierung zurück (überfällig/wichtig
 * zuerst, dann Dringlichkeit, dann Kategorie) und werden dahinter angehängt.
 *
 * Design abgestimmt per /drill-Interview, siehe .drills/2026-06-16/unified-feed-block.md
 * (Phase 3: Layout-Vereinfachung + Badge + farbige Icons, nachträglich angepasst).
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemeColors, neonGlow } from '../utils/theme';

export type FeedCategory =
  | 'birthday'
  | 'calendar'
  | 'task'
  | 'kidsTask'
  | 'mail'
  | 'sharedList'
  | 'geistesblitz'
  | 'note'
  | 'allowance';

/** Interne Dringlichkeits-Einstufung – steuert nur die Default-Sortierung, keine Header mehr. */
export type FeedGroupKey = 'overdue' | 'today' | 'tomorrow' | 'later';

export interface FeedItem {
  /** Stabiler Schlüssel `category:id`, z. B. `task:abc123`. */
  key: string;
  category: FeedCategory;
  group: FeedGroupKey;
  title: string;
  subtitle?: string;
  important?: boolean;
  overdue?: boolean;
  onPress?: () => void;
  /**
   * Optionale Item-eigene Markerfarbe. Aktuell nur für `note`: jede Notiz aus
   * dem Notizblock trägt ihre Bubble-Farbe, damit das Feed-Bullet exakt dem
   * Dashboard-Notizblock entspricht. Fällt auf CATEGORY_COLOR zurück.
   */
  color?: string;
}

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** Kategorien, die statt eines Ionicons-Icons ein eigenes Text-Glyph rendern (siehe Render-Logik unten). */
const CATEGORY_GLYPH: Partial<Record<FeedCategory, string>> = {
  allowance: '$',
};

const CATEGORY_ICON: Record<FeedCategory, IconName> = {
  birthday: 'gift-outline',
  calendar: 'calendar-outline',
  task: 'checkbox-outline',
  kidsTask: 'school-outline',
  mail: 'mail-outline',
  sharedList: 'share-social-outline',
  geistesblitz: 'bulb-outline',
  note: 'document-text-outline',
  allowance: 'cash-outline', // ungenutzt, da Glyph (siehe CATEGORY_GLYPH) – Fallback für Typ-Vollständigkeit.
};

/**
 * Feste, farbige Icon-Farben pro Kategorie (statt neutralem textMuted) – gut
 * unterscheidbar auf beiden dunklen Themes (dark-mono/dark-calm).
 */
const CATEGORY_COLOR: Record<FeedCategory, string> = {
  birthday: '#f472b6', // pink
  calendar: '#60a5fa', // blau
  task: '#34d399', // grün
  kidsTask: '#a78bfa', // violett
  mail: '#38bdf8', // hellblau
  sharedList: '#fbbf24', // amber
  geistesblitz: '#fde047', // gelb
  note: '#fb923c', // orange
  allowance: '#2dd4bf', // türkis
};

/** Dunkelrosa Badge-Farbe für wichtig/überfällig (statt roter Text). */
const BADGE_COLOR = '#9d174d';

/** Sortier-Priorität innerhalb gleicher Dringlichkeit (siehe Drill-Entscheidung). */
const CATEGORY_PRIORITY: Record<FeedCategory, number> = {
  birthday: 0,
  calendar: 1,
  task: 2,
  kidsTask: 3,
  mail: 4,
  sharedList: 5,
  geistesblitz: 6,
  note: 7,
  allowance: 8,
};

const GROUP_ORDER: FeedGroupKey[] = ['overdue', 'today', 'tomorrow', 'later'];

function sortItems(items: FeedItem[]): FeedItem[] {
  return [...items].sort((a, b) => {
    // Tasks gewinnen im Standard immer vor Mails, unabhängig von wichtig/überfällig.
    if (a.category === 'task' && b.category === 'mail') return -1;
    if (a.category === 'mail' && b.category === 'task') return 1;
    const flaggedA = a.overdue || a.important;
    const flaggedB = b.overdue || b.important;
    if (!!flaggedA !== !!flaggedB) return flaggedA ? -1 : 1;
    const ga = GROUP_ORDER.indexOf(a.group);
    const gb = GROUP_ORDER.indexOf(b.group);
    if (ga !== gb) return ga - gb;
    const pa = CATEGORY_PRIORITY[a.category];
    const pb = CATEGORY_PRIORITY[b.category];
    if (pa !== pb) return pa - pb;
    return 0;
  });
}

/**
 * Wendet eine gespeicherte manuelle Reihenfolge (flache Liste von FeedItem.key)
 * auf eine bereits default-sortierte Liste an. Bekannte Keys werden in der
 * gespeicherten Reihenfolge vorangestellt, alles Neue/Unbekannte (z. B. ein
 * frisch hinzugekommenes Item) wird in Default-Reihenfolge dahinter angehängt.
 */
function applyManualOrder(sorted: FeedItem[], order?: string[]): FeedItem[] {
  if (!order || order.length === 0) return sorted;
  const remaining = new Map(sorted.map((i) => [i.key, i] as const));
  const ordered: FeedItem[] = [];
  for (const key of order) {
    const item = remaining.get(key);
    if (item) {
      ordered.push(item);
      remaining.delete(key);
    }
  }
  for (const item of sorted) {
    if (remaining.has(item.key)) ordered.push(item);
  }
  return ordered;
}

export function FeedBlock({
  items,
  colors,
  manualOrder,
  onReorder,
}: {
  items: FeedItem[];
  colors: ThemeColors;
  /** Gespeicherte manuelle Sortierung über die ganze Liste (siehe feedOrderService.ts). */
  manualOrder?: string[];
  /** Wird mit der vollständigen neuen Key-Reihenfolge der Liste aufgerufen. */
  onReorder?: (orderedKeys: string[]) => void;
}) {
  const sorted = applyManualOrder(sortItems(items), manualOrder);
  // Long-Press hebt genau ein Item per kräftigem Rahmen hervor; erneuter
  // Long-Press auf das gleiche Item hebt die Hervorhebung wieder auf.
  const [highlightedKey, setHighlightedKey] = React.useState<string | null>(null);

  const moveItem = (index: number, dir: -1 | 1) => {
    const targetIndex = index + dir;
    if (targetIndex < 0 || targetIndex >= sorted.length) return;
    const reordered = [...sorted];
    [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];
    onReorder?.(reordered.map((i) => i.key));
  };

  if (sorted.length === 0) {
    return (
      <View style={styles.emptyRow}>
        <Ionicons name="checkmark-circle-outline" size={16} color={colors.success} />
        <Text style={[styles.emptyText, { color: colors.textMuted }]}>Nichts Anstehendes 🎉</Text>
      </View>
    );
  }

  return (
    <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      {sorted.map((item, i) => {
        const flagged = item.overdue || item.important;
        return (
          <Pressable
            key={item.key}
            disabled={!item.onPress}
            onPress={item.onPress}
            onLongPress={() => setHighlightedKey((prev) => (prev === item.key ? null : item.key))}
            delayLongPress={1000}
            style={({ pressed }) => [
              styles.row,
              i < sorted.length - 1 && { borderBottomColor: colors.border, borderBottomWidth: 1 },
              pressed && item.onPress ? { opacity: 0.6 } : null,
              item.key === highlightedKey
                ? { borderWidth: 2, borderColor: colors.accent, borderRadius: 8, ...neonGlow(colors.accentNeon, 'medium') }
                : null,
            ]}
          >
            {item.category === 'note' ? (
              // Notizen: rundes Bullet wie im Dashboard-Notizblock, in der Farbe
              // der jeweiligen Notiz (item.color), statt eines Ionicons-Icons.
              <View style={styles.noteBulletWrap}>
                <View style={[styles.noteBullet, { backgroundColor: item.color ?? CATEGORY_COLOR.note }]} />
              </View>
            ) : CATEGORY_GLYPH[item.category] ? (
              <Text style={[styles.glyph, { color: CATEGORY_COLOR[item.category] }]}>
                {CATEGORY_GLYPH[item.category]}
              </Text>
            ) : (
              <Ionicons name={CATEGORY_ICON[item.category]} size={16} color={CATEGORY_COLOR[item.category]} />
            )}
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
                {item.title}
              </Text>
              {item.subtitle ? (
                <Text style={[styles.subtitle, { color: colors.textMuted }]} numberOfLines={1}>
                  {item.subtitle}
                </Text>
              ) : null}
            </View>
            {flagged ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {item.overdue ? 'Überfällig' : item.category === 'mail' ? 'Pinned' : 'Wichtig'}
                </Text>
              </View>
            ) : null}
            {onReorder && sorted.length > 1 ? (
              <View style={styles.reorderRow}>
                <Pressable
                  hitSlop={8}
                  disabled={i === 0}
                  onPress={() => moveItem(i, -1)}
                  style={styles.reorderBtn}
                >
                  <Ionicons name="chevron-up" size={14} color={i === 0 ? colors.border : colors.textMuted} />
                </Pressable>
                <Pressable
                  hitSlop={8}
                  disabled={i === sorted.length - 1}
                  onPress={() => moveItem(i, 1)}
                  style={styles.reorderBtn}
                >
                  <Ionicons
                    name="chevron-down"
                    size={14}
                    color={i === sorted.length - 1 ? colors.border : colors.textMuted}
                  />
                </Pressable>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  title: {
    fontSize: 14,
  },
  glyph: {
    width: 16,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '700',
  },
  // 16er-Spalte wie die Icons, damit das Bullet bündig zu den anderen Items sitzt.
  noteBulletWrap: {
    width: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Gleiche Maße wie das Bullet im Notizblock (padStyles.bullet).
  noteBullet: {
    width: 10,
    height: 10,
    borderRadius: 999,
  },
  subtitle: {
    fontSize: 11,
    marginTop: 1,
  },
  badge: {
    backgroundColor: BADGE_COLOR,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  reorderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  reorderBtn: {
    padding: 2,
  },
  emptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  emptyText: {
    fontSize: 13,
  },
});
