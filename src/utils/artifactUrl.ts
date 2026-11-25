/**
 * artifactUrl.ts
 *
 * Reine Helfer für Claude-Artefakt-Links im Tab „Ablage“ (Links & Artefakte).
 * Bewusst ohne React-Native-Importe, damit Vitest sie direkt testen kann.
 *
 * Unterstützte Formen:
 *   https://claude.ai/public/artifacts/{uuid}   (veröffentlicht, ohne Login sichtbar)
 *   https://claude.ai/artifact/{id}             (privat bzw. geteilt, Login nötig)
 *   https://claude.ai/code/artifact/{uuid}      (aus Claude Code)
 * Ein fehlendes Protokoll wird ergänzt, `www.` wird toleriert.
 */

export type ArtifactKind = 'public' | 'private' | 'code';

export interface ParsedArtifactUrl {
  /** Normalisierte URL ohne Query/Hash – wird so gespeichert und geöffnet. */
  url: string;
  id: string;
  kind: ArtifactKind;
}

const PATTERNS: { kind: ArtifactKind; re: RegExp }[] = [
  { kind: 'public',  re: /^\/public\/artifacts\/([A-Za-z0-9-]{6,})\/?$/ },
  { kind: 'code',    re: /^\/code\/artifact\/([A-Za-z0-9-]{6,})\/?$/ },
  { kind: 'private', re: /^\/artifact\/([A-Za-z0-9-]{6,})\/?$/ },
];

export function parseArtifactUrl(raw: string): ParsedArtifactUrl | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withProto = /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let u: URL;
  try {
    u = new URL(withProto);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  if (host !== 'claude.ai') return null;
  for (const { kind, re } of PATTERNS) {
    const m = u.pathname.match(re);
    if (m) {
      const id = m[1];
      const path = u.pathname.replace(/\/$/, '');
      return { url: `https://claude.ai${path}`, id, kind };
    }
  }
  return null;
}

/** Anzeigename, wenn der Nutzer keinen Titel vergibt. */
export function defaultArtifactTitle(parsed: ParsedArtifactUrl): string {
  return `Artefakt ${parsed.id.slice(0, 8)}`;
}
