const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || '';
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || '';

let cachedToken: string | null = null;
let tokenExpiry = 0;

async function getSpotifyToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry) {
    return cachedToken;
  }

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!response.ok) {
    throw new Error(`Spotify auth failed: ${response.status}`);
  }

  const data = await response.json();
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return cachedToken || '';
}

export async function getPlaylistTracks(playlistId: string) {
  const token = await getSpotifyToken();

  const response = await fetchWithTimeout(`https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`, {
    headers: { Authorization: `Bearer ${token}` },
  }, 15000);

  if (!response.ok) {
    throw new Error(`Spotify API error: ${response.status}`);
  }

  const data = await response.json();

  return data.items
    .filter((item: any) => item.track && item.track.name && item.track.artists?.length > 0)
    .map((item: any) => ({
      title: item.track.name,
      artist: item.track.artists[0].name,
      uri: item.track.uri,
    }));
}

// Helper: fetch with timeout (default 20 seconds for search, 10 for get)
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 20000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchLyrics(artist: string, title: string): Promise<string | null> {
  try {
    const cleanArtist = artist.replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '').trim();
    const cleanTitle = title.replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '').trim();

    // ── Tier 1: LRCLIB fuzzy search (best Spanish coverage) ──
    try {
      // Try multiple search queries
      const searchQueries = [
        `${cleanArtist} ${cleanTitle}`,
        `${cleanArtist} ${cleanTitle.replace(/\s*[-–—]\s*.*$/, '').trim()}`,
        `${cleanArtist.replace(/(?:Music|Worship|Band)\s*$/i, '').replace(/\s+en\s+Espa[ñn]ol\s*$/i, '').replace(/\s+en\s+Vivo\s*$/i, '').replace(/\s+Live\s*$/i, '').trim()} ${cleanTitle}`,
      ];

      for (const query of [...new Set(searchQueries)]) {
        try {
          const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(query)}`;
          const searchRes = await fetchWithTimeout(searchUrl, { headers: { 'Accept': 'application/json' } });
          if (!searchRes.ok) continue;
          
          const results = await searchRes.json();
          if (!Array.isArray(results) || results.length === 0) continue;

          // Find best match: prefer exact artist match, then exact title match
          const bestMatch = results.find((r: any) => {
            const rArtist = (r.artistName || '').toLowerCase();
            const rTrack = (r.trackName || r.name || '').toLowerCase();
            const qArtist = cleanArtist.toLowerCase();
            const qTitle = cleanTitle.toLowerCase();
            return rArtist.includes(qArtist) || qArtist.includes(rArtist) ||
                   rTrack.includes(qTitle) || qTitle.includes(rTrack);
          }) || results[0];

          if (bestMatch) {
            const artistName = bestMatch.artistName || cleanArtist;
            const trackName = bestMatch.trackName || bestMatch.name || cleanTitle;

            const getUrl = `https://lrclib.net/api/get?artist_name=${encodeURIComponent(artistName)}&track_name=${encodeURIComponent(trackName)}`;
            const getRes = await fetchWithTimeout(getUrl, { headers: { 'Accept': 'application/json' } });
            if (getRes.ok) {
              const data = await getRes.json();
              if (data.plainLyrics) {
                return data.plainLyrics;
              }
              if (data.syncedLyrics) {
                return data.syncedLyrics.replace(/\[\d{2}:\d{2}\.\d{2}\]/g, '').trim();
              }
            }
          }
        } catch (e) { /* continue to next query */ }
      }
    } catch { /* fall through to tier 2 */ }

    // ── Tier 2: Query variants against Lyrist + lyrics.ovh ──
    const artistVariants = [
      cleanArtist,
      cleanArtist.replace(/\s*[-–—]\s*.*$/, '').trim(),
      cleanArtist.replace(/(?:Music|Worship|Band)\s*$/i, '').replace(/\s+en\s+Espa[ñn]ol\s*$/i, '').replace(/\s+en\s+Vivo\s*$/i, '').replace(/\s+Live\s*$/i, '').trim(),
      cleanArtist.normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
    ];

    const titleVariants = [
      cleanTitle,
      cleanTitle.replace(/\s*[-–—]\s*.*$/, '').trim(),
      cleanTitle.replace(/\s*\(\s*En\s+Vivo\s*\)/gi, '').replace(/\s*\(\s*Live\s*\)/gi, '').replace(/\s*\[\s*feat\.?\s+.*?\]/gi, '').replace(/\s*\(\s*feat\.?\s+.*?\)/gi, '').trim(),
      cleanTitle.normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
    ];

    const uniqueArtists = [...new Set(artistVariants.filter(a => a.length > 0))];
    const uniqueTitles = [...new Set(titleVariants.filter(t => t.length > 0))];

    for (const apiArtist of uniqueArtists) {
      for (const apiTitle of uniqueTitles) {
        // Lyrist
        try {
          const url = `https://lyrist.vercel.app/api/${encodeURIComponent(apiArtist)}/${encodeURIComponent(apiTitle)}`;
          const res = await fetchWithTimeout(url, { headers: { 'Accept': 'application/json' } });
          if (res.ok) {
            const data = await res.json();
            if (data.lyrics) {
              return data.lyrics;
            }
          }
        } catch {}

        // lyrics.ovh
        try {
          const url = `https://api.lyrics.ovh/v1/${encodeURIComponent(apiArtist)}/${encodeURIComponent(apiTitle)}`;
          const res = await fetchWithTimeout(url, { headers: { 'Accept': 'application/json' } });
          if (res.ok) {
            const data = await res.json();
            if (data.lyrics) {
              return data.lyrics;
            }
          }
        } catch {}
      }
    }

    // ── Tier 3: letras.com scraping (last resort for Spanish) ──
    try {
      const letrasLyrics = await fetchLyricsFromLetras(artist, title);
      if (letrasLyrics) return letrasLyrics;
    } catch {}

    return null;
  } catch {
    return null;
  }
}

// Tier 3: Scrape letras.com as last resort for Spanish lyrics
async function fetchLyricsFromLetras(artist: string, title: string): Promise<string | null> {
  try {
    const slug = (s: string) =>
      s.toLowerCase()
       .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
       .replace(/[^a-z0-9\s-]/g, '')
       .replace(/\s+/g, '-')
       .replace(/-+/g, '-')
       .replace(/^-|-$/g, '');

    const url = `https://www.letras.com/${slug(artist)}/${slug(title)}/`;
    const res = await fetchWithTimeout(url, { headers: { 'Accept': 'text/html', 'User-Agent': 'Mozilla/5.0' } }, 10000);
    if (!res.ok) return null;

    const html = await res.text();
    // Extract lyrics from <div class="lyric-original">
    const match = html.match(/<div[^>]*class="[^"]*lyric-original[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    if (!match) return null;

    // Strip HTML tags and decode entities
    const raw = match[1]
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#x27;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0)
      .join('\n');

    return raw.length > 20 ? raw : null;
  } catch {
    return null;
  }
}

function normalizeParagraph(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function parseLyricsSections(lyrics: string) {
  const rawParagraphs = lyrics.split(/\n\s*\n/).map(p => p.trim()).filter(p => p.length > 0);

  const paragraphs = rawParagraphs.map(p => ({
    text: p,
    normalized: normalizeParagraph(p),
    lineCount: p.split('\n').filter(l => l.trim().length > 0).length,
  }));

  const freq = new Map<string, number>();
  paragraphs.forEach(p => {
    freq.set(p.normalized, (freq.get(p.normalized) || 0) + 1);
  });

  const sections: Array<{ type: string; content: string }> = [];
  let estrofaCount = 0;
  let puenteCount = 0;

  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    const isRepeated = (freq.get(p.normalized) || 0) >= 2;
    const isFirst = i === 0;
    const isLast = i === paragraphs.length - 1;
    const isShort = p.lineCount <= 3;

    if (isRepeated) {
      sections.push({ type: 'ESTRIBILLO', content: p.text });
    } else if (isFirst && isShort) {
      sections.push({ type: 'INTRO', content: p.text });
    } else if (isLast && isShort && sections.length >= 2) {
      const lastSectionType = sections[sections.length - 1].type;
      if (lastSectionType === 'ESTRIBILLO') {
        sections.push({ type: 'OUTRO', content: p.text });
      } else {
        sections.push({ type: 'OUTRO', content: p.text });
      }
    } else if (isShort && i > 0 && i < paragraphs.length - 1) {
      const prevType = sections[sections.length - 1]?.type;
      if (prevType === 'VERSO' || prevType === 'ESTRIBILLO') {
        sections.push({ type: 'PUENTE', content: p.text });
      } else {
        estrofaCount++;
        sections.push({ type: 'VERSO', content: p.text });
      }
    } else {
      estrofaCount++;
      sections.push({ type: 'VERSO', content: p.text });
    }
  }

  if (sections.length === 0 && lyrics.trim().length > 0) {
    sections.push({ type: 'VERSO', content: lyrics.trim() });
  }

  return sections;
}

export function extractPlaylistId(url: string): string | null {
  const match = url.match(/playlist\/([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}
