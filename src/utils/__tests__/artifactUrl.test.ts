import { describe, it, expect } from 'vitest';
import {
  parseArtifactUrl,
  artifactPreviewUrl,
  defaultArtifactTitle,
  hasPublicPreview,
} from '../artifactUrl';

const UUID = '3f2a9c1e-1b2d-4c5e-8f90-123456789abc';

describe('parseArtifactUrl', () => {
  it('erkennt veröffentlichte Artefakte', () => {
    expect(parseArtifactUrl(`https://claude.ai/public/artifacts/${UUID}`)).toEqual({
      url: `https://claude.ai/public/artifacts/${UUID}`,
      id: UUID,
      kind: 'public',
    });
  });

  it('erkennt private und Claude-Code-Artefakte', () => {
    expect(parseArtifactUrl('https://claude.ai/artifact/abc123XYZ')?.kind).toBe('private');
    expect(parseArtifactUrl(`https://claude.ai/code/artifact/${UUID}`)?.kind).toBe('code');
  });

  it('ergänzt Protokoll, entfernt www, Query, Hash und Slash am Ende', () => {
    expect(parseArtifactUrl(`  www.claude.ai/public/artifacts/${UUID}/?utm=x#top `)?.url)
      .toBe(`https://claude.ai/public/artifacts/${UUID}`);
  });

  it('lehnt fremde Hosts und andere Pfade ab', () => {
    expect(parseArtifactUrl('https://example.com/public/artifacts/abcdef12')).toBeNull();
    expect(parseArtifactUrl('https://claude.ai/chat/abcdef12')).toBeNull();
    expect(parseArtifactUrl('https://evilclaude.ai/artifact/abcdef12')).toBeNull();
    expect(parseArtifactUrl('')).toBeNull();
    expect(parseArtifactUrl('kein link')).toBeNull();
  });
});

describe('artifactPreviewUrl', () => {
  it('kodiert die Ziel-URL und hängt bei Wiederholung einen Cache-Buster an', () => {
    const u = `https://claude.ai/public/artifacts/${UUID}`;
    expect(artifactPreviewUrl(u)).toBe(
      `https://s.wordpress.com/mshots/v1/${encodeURIComponent(u)}?w=800&h=500`,
    );
    expect(artifactPreviewUrl(u, 2)).toMatch(/&r=2$/);
  });
});

describe('Hilfen', () => {
  it('Titel-Fallback und Vorschau-Fähigkeit', () => {
    const p = parseArtifactUrl(`https://claude.ai/public/artifacts/${UUID}`)!;
    expect(defaultArtifactTitle(p)).toBe('Artefakt 3f2a9c1e');
    expect(hasPublicPreview('public')).toBe(true);
    expect(hasPublicPreview('private')).toBe(true);
    expect(hasPublicPreview('code')).toBe(true);
  });
});
