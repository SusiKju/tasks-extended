/**
 * links.ts
 *
 * Persönliche Linkliste pro User in Firestore.
 * Pfad: families/{familyId}/linksByUser/{uid}/links/{linkId}
 *
 * Privat (nur für den jeweiligen User) – nicht geteilt mit der Familie.
 * Analog zu geistesKacheln.ts.
 */

import { Linking } from 'react-native';
import { db } from './firebase';
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  writeBatch,
  Unsubscribe,
} from 'firebase/firestore';

export interface LinkItem {
  id: string;
  title: string;
  url: string;
  /** Ionicons-Name als Fallback, falls das Favicon nicht geladen werden kann. */
  icon: string | null;
  color: string;
  /** Nur aktive Links erscheinen in der Karten-Schnellleiste auf dem Dashboard. */
  active: boolean;
  createdAt: string;
  /** Manuelle Sortierreihenfolge (TE-34); fehlt bei Altdaten → fällt auf createdAt zurück. */
  order?: number;
}

export type LinkPatch = Partial<Pick<LinkItem, 'title' | 'url' | 'icon' | 'color' | 'active'>>;

const linksCol = (familyId: string, uid: string) =>
  collection(db, 'families', familyId, 'linksByUser', uid, 'links');

/**
 * Sortierung: zuerst nach manueller `order` (aufsteigend), Altdaten ohne `order`
 * danach nach createdAt (neueste zuerst) – wie vor TE-34.
 */
export function compareLinks(a: LinkItem, b: LinkItem): number {
  const ao = a.order ?? Number.POSITIVE_INFINITY;
  const bo = b.order ?? Number.POSITIVE_INFINITY;
  if (ao !== bo) return ao - bo;
  return b.createdAt.localeCompare(a.createdAt);
}

/**
 * Echtzeit-Listener – neueste Links zuerst (clientseitig sortiert).
 */
export function subscribeToLinks(
  familyId: string,
  uid: string,
  onChange: (links: LinkItem[]) => void,
  onError?: (e: unknown) => void,
): Unsubscribe {
  return onSnapshot(
    linksCol(familyId, uid),
    (snap) => {
      const links = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as LinkItem))
        .sort(compareLinks);
      onChange(links);
    },
    (e) => {
      console.warn('subscribeToLinks failed', e);
      onError?.(e);
    },
  );
}

export async function addLink(
  familyId: string,
  uid: string,
  data: { title: string; url: string; icon: string | null; color: string; active: boolean },
): Promise<string> {
  const ref = await addDoc(linksCol(familyId, uid), {
    title: data.title.trim(),
    url: normalizeUrl(data.url),
    icon: data.icon ?? null,
    color: data.color,
    active: data.active,
    createdAt: new Date().toISOString(),
  });
  return ref.id;
}

export async function updateLink(
  familyId: string,
  uid: string,
  id: string,
  patch: LinkPatch,
): Promise<void> {
  const clean: LinkPatch = { ...patch };
  if (typeof clean.title === 'string') clean.title = clean.title.trim();
  if (typeof clean.url === 'string') clean.url = normalizeUrl(clean.url);
  await updateDoc(
    doc(db, 'families', familyId, 'linksByUser', uid, 'links', id),
    clean,
  );
}

export async function deleteLink(
  familyId: string,
  uid: string,
  id: string,
): Promise<void> {
  await deleteDoc(
    doc(db, 'families', familyId, 'linksByUser', uid, 'links', id),
  );
}

/**
 * Schreibt die neue manuelle Reihenfolge (TE-34): `order` = Index in der Liste.
 * Ein Batch-Write hält die Reihenfolge atomar konsistent.
 */
export async function persistLinkOrder(
  familyId: string,
  uid: string,
  orderedIds: string[],
): Promise<void> {
  const batch = writeBatch(db);
  orderedIds.forEach((id, idx) => {
    batch.update(doc(db, 'families', familyId, 'linksByUser', uid, 'links', id), { order: idx });
  });
  await batch.commit();
}

// ─── URL-Helfer ─────────────────────────────────────────────────────────────

/** Ergänzt ein fehlendes Protokoll, damit Linking.openURL & Favicon funktionieren. */
export function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (/^[a-z]+:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/** Extrahiert den Host (Domain) aus einer URL – leere Zeichenkette bei Fehler. */
export function hostFromUrl(raw: string): string {
  const url = normalizeUrl(raw);
  try {
    return new URL(url).hostname;
  } catch {
    // Fallback ohne URL-API: alles zwischen Protokoll und erstem "/".
    const m = url.replace(/^[a-z]+:\/\//i, '').match(/^([^/?#]+)/i);
    return m ? m[1] : '';
  }
}

/** Google-Favicon-Dienst – liefert auch dann ein Icon, wenn die Seite kein eigenes anbietet. */
export function faviconUrl(rawUrl: string, size = 64): string | null {
  const host = hostFromUrl(rawUrl);
  if (!host) return null;
  return `https://www.google.com/s2/favicons?sz=${size}&domain=${encodeURIComponent(host)}`;
}

/**
 * Fallback wenn Google's Favicon-Dienst eine Domain nicht kennt (404, TE-86):
 * lädt das HTML der Seite und liest deren eigenes <link rel="icon">-Tag aus.
 * Bei mehreren rel="icon"-Treffern gewinnt die größte sizes-Angabe.
 */
export async function fetchPageFaviconUrl(rawUrl: string): Promise<string | null> {
  const pageUrl = normalizeUrl(rawUrl);
  if (!pageUrl) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(pageUrl, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const html = await res.text();
    const icons = (html.match(/<link\s[^>]*>/gi) ?? [])
      .map((tag) => ({
        rel: tag.match(/rel=["']([^"']+)["']/i)?.[1]?.toLowerCase() ?? '',
        href: tag.match(/href=["']([^"']+)["']/i)?.[1],
        sizes: tag.match(/sizes=["']([^"']+)["']/i)?.[1],
      }))
      .filter((t): t is { rel: string; href: string; sizes: string | undefined } => !!t.href && /icon/.test(t.rel));
    if (icons.length === 0) return null;
    const sizeOf = (s?: string) => parseInt(s?.match(/(\d+)x\d+/)?.[1] ?? '0', 10);
    const best = icons.filter((t) => t.rel === 'icon').sort((a, b) => sizeOf(b.sizes) - sizeOf(a.sizes))[0] ?? icons[0];
    return new URL(best.href, pageUrl).toString();
  } catch {
    return null;
  }
}

/** Öffnet die (normalisierte) URL extern – Web öffnet Tab, Native den Browser. */
export async function openLink(rawUrl: string): Promise<void> {
  const normalized = normalizeUrl(rawUrl);
  if (!normalized) return;
  try {
    await Linking.openURL(normalized);
  } catch (e) {
    console.warn('openLink failed', e);
  }
}
