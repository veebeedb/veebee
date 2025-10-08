// /core/utility/api/namemc.ts
// Comprehensive NameMC + Mojang helper
//
// Features:
// - resolve username -> uuid
// - get current username + hyphenated uuid
// - get name history (Mojang authoritative)
// - get current textures (Mojang sessionserver authoritative)
// - best-effort NameMC scraping for: skin history, skins list, profile "about" text, external links (Discord, YouTube, Twitter, Twitch, Instagram, Steam, GitHub, Reddit, etc), followers/views, capes
// - getFullProfile aggregates everything
// - in-memory caching with TTL and simple rate limiting/backoff
//
// Caveats:
// - Scraping NameMC is fragile. If their markup changes this code can return partial results.
// - When you require absolute reliability, use Mojang APIs or the community packages that track NameMC changes.

type Nullable<T> = T | null;

export interface MinecraftProfile {
  uuid: string; // hyphenated UUID (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
  rawUuid: string; // raw UUID (no hyphens)
  username: string; // current username (latest from Mojang)
  legacy: boolean;
  createdAt: string | null;
  skin: string | null; // direct URL to current skin texture
  cape: string | null; // direct URL to current cape texture
}

export interface NameHistoryEntry {
  name: string;
  changedToAt?: number; // unix ms if available
}

export interface NameMCSkinEntry {
  id: string; // NameMC skin id or skin hash as found in URL
  url: string; // NameMC skin page url
  thumbnail?: string | null; // thumbnail image url if scraped
  firstSeen?: string | null; // text if scraped
  favorites?: number | null;
  tags?: string[] | null;
}

export interface NameMCProfileExtras {
  about?: string | null; // free text "about" from profile if present
  viewsMonth?: string | null; // views as text
  followers?: number | null;
  following?: number | null;
  skins?: NameMCSkinEntry[]; // scraped skins list
  skinCount?: number | null;
  capes?: string[]; // capes (strings with url or label)
  externalLinks?: string[]; // raw external URLs scraped from profile
  nameHistoryFromNameMC?: NameHistoryEntry[] | null; // if NameMC shows it differently
}

export interface FullNameMCProfile {
  mojang: MinecraftProfile;
  mojangNameHistory: NameHistoryEntry[]; // Mojang authoritative history
  namemcExtras: NameMCProfileExtras; // best-effort scraped extras
  fetchedAt: number;
}

/* -------------------------
   Utilities: fetch, uuid helpers, cache
   ------------------------- */

async function ensureFetch(): Promise<typeof fetch> {
  if (typeof globalThis.fetch === "function") return globalThis.fetch;
  try {
    const nf = await import("node-fetch");
    return (nf as any).default ?? (nf as any);
  } catch (err) {
    throw new Error(
      "No global fetch available and node-fetch failed to import"
    );
  }
}

function hyphenateUuid(raw: string): string {
  if (!raw || raw.length !== 32) return raw;
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(
    12,
    16
  )}-${raw.slice(16, 20)}-${raw.slice(20)}`;
}

// Simple in-memory cache with TTL
const cache = new Map<string, { expires: number; value: any }>();
function setCache(key: string, value: any, ttlMs = 1000 * 60 * 5) {
  cache.set(key, { expires: Date.now() + ttlMs, value });
}
function getCache<T>(key: string): T | null {
  const v = cache.get(key);
  if (!v) return null;
  if (Date.now() > v.expires) {
    cache.delete(key);
    return null;
  }
  return v.value as T;
}

/* -------------------------
   Rate limiting/backoff: very small safety wrapper
   ------------------------- */

const lastRequestAt = new Map<string, number>();
const MIN_MS_BETWEEN = 250; // 4 rps per host key by default
async function safeFetch(url: string, options?: RequestInit, hostKey?: string) {
  const f = await ensureFetch();
  const key = hostKey ?? new URL(url).hostname;
  const last = lastRequestAt.get(key) ?? 0;
  const now = Date.now();
  const delta = now - last;
  if (delta < MIN_MS_BETWEEN) {
    await new Promise((res) => setTimeout(res, MIN_MS_BETWEEN - delta));
  }
  lastRequestAt.set(key, Date.now());
  const res = await f(url, options);
  // small exponential backoff on 429/5xx
  if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
    const wait = 800 + Math.random() * 800;
    await new Promise((r) => setTimeout(r, wait));
    return f(url, options);
  }
  return res;
}

/* -------------------------
   Mojang helpers (authoritative)
   ------------------------- */

export async function resolveUsernameToUuid(
  username: string
): Promise<string | null> {
  const key = `resolve:${username.toLowerCase()}`;
  const cached = getCache<string>(key);
  if (cached) return cached;

  const fetchImpl = await ensureFetch();
  const url = `https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(
    username
  )}`;
  try {
    const r = await safeFetch(url, {}, "api.mojang.com");
    if (!r.ok) return null;
    const j = (await r.json()) as { id?: string };
    const raw = j?.id ?? null;
    if (!raw) return null;
    setCache(key, raw, 1000 * 60 * 60); // cache for 1 hour
    return raw;
  } catch (err) {
    console.warn("resolveUsernameToUuid error", err);
    return null;
  }
}

export async function getNameHistory(
  rawUuid: string
): Promise<NameHistoryEntry[]> {
  const key = `names:${rawUuid}`;
  const cached = getCache<NameHistoryEntry[]>(key);
  if (cached) return cached;

  try {
    const fetchImpl = await ensureFetch();
    const url = `https://api.mojang.com/user/profiles/${rawUuid}/names`;
    const r = await safeFetch(url, {}, "api.mojang.com");
    if (!r.ok) {
      setCache(key, [], 60 * 1000);
      return [];
    }
    const j = await r.json();
    const out: NameHistoryEntry[] = Array.isArray(j)
      ? j.map((e: any) => ({
          name: String(e.name),
          changedToAt: e.changedToAt ? Number(e.changedToAt) : undefined,
        }))
      : [];
    setCache(key, out, 1000 * 60 * 60);
    return out;
  } catch (err) {
    console.warn("getNameHistory error", err);
    return [];
  }
}

export async function getSessionTextures(
  rawUuid: string
): Promise<{ skin: string | null; cape: string | null }> {
  const key = `session:${rawUuid}`;
  const cached = getCache<{ skin: string | null; cape: string | null }>(key);
  if (cached) return cached;

  try {
    const fetchImpl = await ensureFetch();
    const url = `https://sessionserver.mojang.com/session/minecraft/profile/${rawUuid}`;
    const r = await safeFetch(url, {}, "sessionserver.mojang.com");
    if (!r.ok) {
      setCache(key, { skin: null, cape: null }, 60 * 1000);
      return { skin: null, cape: null };
    }
    const j = (await r.json()) as {
      properties?: Array<{ name?: string; value?: string }>;
    };
    const props = Array.isArray(j?.properties) ? j.properties : [];
    const texProp = props.find((p) => p?.name === "textures");
    if (!texProp?.value) {
      setCache(key, { skin: null, cape: null }, 60 * 1000);
      return { skin: null, cape: null };
    }
    // decode base64
    const decoded = JSON.parse(
      Buffer.from(String(texProp.value), "base64").toString("utf8")
    );
    const skin = decoded?.textures?.SKIN?.url ?? null;
    const cape = decoded?.textures?.CAPE?.url ?? null;
    setCache(key, { skin, cape }, 1000 * 60 * 10);
    return { skin, cape };
  } catch (err) {
    console.warn("getSessionTextures error", err);
    return { skin: null, cape: null };
  }
}

/* -------------------------
   Ashcon supplemental info (createdAt, legacy)
   ------------------------- */

async function getAshconSupplement(
  usernameOrUuid: string
): Promise<{ createdAt?: string | null; legacy?: boolean | null } | null> {
  const key = `ashcon:${usernameOrUuid.toLowerCase()}`;
  const cached = getCache<any>(key);
  if (cached) return cached;
  try {
    const fetchImpl = await ensureFetch();
    // ashcon accepts username or uuid
    const url = `https://api.ashcon.app/mojang/v2/user/${encodeURIComponent(
      usernameOrUuid
    )}`;
    const r = await safeFetch(url, {}, "api.ashcon.app");
    if (!r.ok) {
      setCache(key, null, 60 * 1000);
      return null;
    }
    const j = (await r.json()) as { created_at?: string; legacy?: boolean };
    const out = {
      createdAt: j?.created_at ?? null,
      legacy: j?.legacy ?? null,
    };
    setCache(key, out, 1000 * 60 * 60);
    return out;
  } catch (err) {
    return null;
  }
}

/* -------------------------
   NameMC scraping helpers (best-effort)
   ------------------------- */

async function fetchNameMCProfileHtmlByUuid(
  hyphenatedOrRawUuidOrName: string
): Promise<string | null> {
  const key = `namemc_html:${hyphenatedOrRawUuidOrName}`;
  const cached = getCache<string>(key);
  if (cached) return cached;

  try {
    const fetchImpl = await ensureFetch();
    // NameMC accepts username or hyphenated uuid or raw uuid in profile path. We'll try a few forms.
    const candidates = [
      `https://namemc.com/profile/${encodeURIComponent(
        hyphenatedOrRawUuidOrName
      )}`,
      `https://namemc.com/profile/${encodeURIComponent(
        hyphenatedOrRawUuidOrName
      )}.1`,
      `https://namemc.com/profile/${encodeURIComponent(
        hyphenatedOrRawUuidOrName
      )}.2`,
    ];
    for (const url of candidates) {
      try {
        const r = await safeFetch(url, {}, "namemc.com");
        if (!r.ok) continue;
        const text = await r.text();
        if (text && text.length > 100) {
          setCache(key, text, 1000 * 60 * 5);
          return text;
        }
      } catch {
        // continue trying
      }
    }
    setCache(key, null, 60 * 1000);
    return null;
  } catch (err) {
    console.warn("fetchNameMCProfileHtml error", err);
    return null;
  }
}

function extractExternalLinksFromHtml(html: string): string[] {
  const out = new Set<string>();
  // crude but wide net for common domains
  const re =
    /https?:\/\/[^\s"'<>]*?(?:discord(?:\.gg|app\.com)|youtube\.com|youtu\.be|twitter\.com|x\.com|twitch\.tv|instagram\.com|steamcommunity\.com|github\.com|reddit\.com|snapchat\.com|tiktok\.com)[^\s"'<>]*/gi;
  let m;
  while ((m = re.exec(html))) {
    out.add(m[0]);
  }
  return Array.from(out);
}

function extractNameHistoryFromNameMC(html: string): NameHistoryEntry[] | null {
  // NameMC prints a "Name History" area with names in order
  // We'll search for the "Name History" header and then look for elements with the name text
  try {
    const sectionIdx = html.indexOf("Name History");
    if (sectionIdx === -1) return null;
    // restrict to next 20k chars
    const slice = html.slice(sectionIdx, sectionIdx + 20000);
    // find occurrences of links like <a ...>NAME</a>
    const nameRe = /<a[^>]*>([A-Za-z0-9_]{1,16})<\/a>/g;
    const out: NameHistoryEntry[] = [];
    let m;
    while ((m = nameRe.exec(slice))) {
      if (m[1]) {
        out.push({ name: m[1] });
      }
    }
    if (out.length === 0) return null;
    return out;
  } catch {
    return null;
  }
}

function extractSkinsFromSkinsHtml(html: string): NameMCSkinEntry[] {
  const out: NameMCSkinEntry[] = [];
  try {
    const hrefRe = /href="\/skin\/([a-z0-9]+)"/gi;
    const ids = new Set<string>();
    let m;
    while ((m = hrefRe.exec(html))) {
      if (m[1]) ids.add(m[1]);
    }
    const imgRe = /<img[^>]+src="([^"]+)"/gi;
    const thumbs: string[] = [];
    while ((m = imgRe.exec(html))) {
      if (m[1]) thumbs.push(m[1]);
    }
    const idList = Array.from(ids);
    for (let i = 0; i < idList.length; i++) {
      const id = idList[i];
      const thumb = thumbs[i] ?? null;
      if (!id) continue;
      out.push({
        id,
        url: `https://namemc.com/skin/${id}`,
        thumbnail: thumb,
        firstSeen: null,
        favorites: null,
        tags: null,
      });
    }
  } catch {}
  return out;
}

function extractStatsFromProfileHtml(html: string): {
  viewsMonth?: string | null;
  followers?: number | null;
} {
  try {
    const viewsRe = /Views\s*<\/[\w\s>]*>\s*([\d,]+)\s*\/\s*month/;
    const m = viewsRe.exec(html);
    const views = m ? m[1] : null;
    const folRe = /Followers\s*\(([\d,]+)\)/i;
    const f = folRe.exec(html);
    const followers = f ? Number(String(f[1]).replace(/,/g, "")) : null;
    return { viewsMonth: views, followers };
  } catch {
    return {};
  }
}

export async function getMinecraftProfile(
  input: string
): Promise<MinecraftProfile | null> {
  const fetchImpl = await ensureFetch();
  const query = input.trim();
  let rawUuid: string | null = null;
  let resolvedUsername = query;

  const candidateRaw = query.replace(/-/g, "");
  if (/^[0-9a-fA-F]{32}$/.test(candidateRaw)) {
    rawUuid = candidateRaw.toLowerCase();
  } else {
    rawUuid = await resolveUsernameToUuid(query);
    if (!rawUuid) return null;
  }

  const names = await getNameHistory(rawUuid);
  if (names && names.length > 0) {
    const last = names[names.length - 1];
    if (last?.name) {
      resolvedUsername = last.name;
    }
  }

  const textures = await getSessionTextures(rawUuid);
  const ash = await getAshconSupplement(resolvedUsername).catch(() => null);

  const hyph = hyphenateUuid(rawUuid);

  return {
    uuid: hyph,
    rawUuid,
    username: resolvedUsername,
    legacy: !!(ash?.legacy ?? false),
    createdAt: ash?.createdAt ?? null,
    skin: textures.skin ?? null,
    cape: textures.cape ?? null,
  };
}

export async function getNameMCExtras(
  input: string
): Promise<NameMCProfileExtras> {
  const fetchImpl = await ensureFetch();
  const probeCandidates: string[] = [];
  const q = input.trim();
  probeCandidates.push(q);

  const rawCandidate = q.replace(/-/g, "");
  if (/^[0-9a-fA-F]{32}$/.test(rawCandidate)) {
    probeCandidates.push(hyphenateUuid(rawCandidate));
    probeCandidates.push(rawCandidate);
  } else {
    const maybeRaw = await resolveUsernameToUuid(q).catch(() => null);
    if (maybeRaw) {
      probeCandidates.push(hyphenateUuid(maybeRaw));
      probeCandidates.push(maybeRaw);
    }
  }

  for (const probe of probeCandidates) {
    const html = await fetchNameMCProfileHtmlByUuid(probe);
    if (!html) continue;

    const nmNames = extractNameHistoryFromNameMC(html);
    const skinsPage = await safeFetch(
      `https://namemc.com/minecraft-skins/profile/${encodeURIComponent(probe)}`,
      {},
      "namemc.com"
    )
      .then((r) => (r.ok ? r.text() : null))
      .catch(() => null);

    const skins = skinsPage
      ? extractSkinsFromSkinsHtml(skinsPage)
      : extractSkinsFromSkinsHtml(html);

    const links = extractExternalLinksFromHtml(html);
    const stats = extractStatsFromProfileHtml(html);

    let about: string | null = null;
    try {
      const aboutIdx = html.indexOf("Profile");
      if (aboutIdx !== -1) {
        const slice = html.slice(aboutIdx, aboutIdx + 6500);
        const pMatch = /<p[^>]*>([\s\S]{1,800})<\/p>/i.exec(slice);
        if (pMatch?.[1]) {
          about = pMatch[1].replace(/<[^>]+>/g, "").trim();
        } else {
          const divMatch =
            /<div[^>]+class=["'][^"']*(about|profile|bio)[^"']*["'][^>]*>([\s\S]{1,1200})<\/div>/i.exec(
              slice
            );
          if (divMatch?.[2]) {
            about = divMatch[2].replace(/<[^>]+>/g, "").trim();
          }
        }
      }
    } catch {
      about = null;
    }

    const out: NameMCProfileExtras = {
      about,
      viewsMonth: stats.viewsMonth ?? null,
      followers: stats.followers ?? null,
      following: null,
      skins,
      skinCount: skins.length,
      capes: [],
      externalLinks: links,
      nameHistoryFromNameMC: nmNames ?? null,
    };

    return out;
  }

  return {};
}

export async function getFullProfile(
  input: string
): Promise<FullNameMCProfile | null> {
  const key = `full:${input.toLowerCase()}`;
  const cached = getCache<FullNameMCProfile>(key);
  if (cached) return cached;

  const candidateRaw = input.replace(/-/g, "");
  let rawUuid: string | null = null;
  if (/^[0-9a-fA-F]{32}$/.test(candidateRaw))
    rawUuid = candidateRaw.toLowerCase();
  else rawUuid = await resolveUsernameToUuid(input);

  if (!rawUuid) return null;

  const names = await getNameHistory(rawUuid);
  const current =
    names.length > 0 ? names[names.length - 1]?.name ?? input : input;
  const textures = await getSessionTextures(rawUuid);
  const ash = await getAshconSupplement(current).catch(() => null);

  const mojang: MinecraftProfile = {
    uuid: hyphenateUuid(rawUuid),
    rawUuid,
    username: current,
    legacy: !!(ash?.legacy ?? false),
    createdAt: ash?.createdAt ?? null,
    skin: textures.skin ?? null,
    cape: textures.cape ?? null,
  };

  const extras = await getNameMCExtras(rawUuid);

  const out: FullNameMCProfile = {
    mojang,
    mojangNameHistory: names,
    namemcExtras: extras,
    fetchedAt: Date.now(),
  };

  setCache(key, out, 1000 * 60 * 5);
  return out;
}

export async function getUsernameHistory(
  input: string
): Promise<NameHistoryEntry[]> {
  const candidateRaw = input.replace(/-/g, "");
  let rawUuid: string | null = null;
  if (/^[0-9a-fA-F]{32}$/.test(candidateRaw))
    rawUuid = candidateRaw.toLowerCase();
  else rawUuid = await resolveUsernameToUuid(input);
  if (!rawUuid) return [];
  return getNameHistory(rawUuid);
}

export async function getSkinHistory(
  input: string
): Promise<NameMCSkinEntry[]> {
  const q = input.trim();
  const rawCandidate = q.replace(/-/g, "");
  const probeCandidates = [q];
  if (/^[0-9a-fA-F]{32}$/.test(rawCandidate)) {
    probeCandidates.push(hyphenateUuid(rawCandidate));
    probeCandidates.push(rawCandidate);
  } else {
    const maybeRaw = await resolveUsernameToUuid(q).catch(() => null);
    if (maybeRaw) {
      probeCandidates.push(hyphenateUuid(maybeRaw));
      probeCandidates.push(maybeRaw);
    }
  }
  for (const p of probeCandidates) {
    const html = await safeFetch(
      `https://namemc.com/minecraft-skins/profile/${encodeURIComponent(p)}`,
      {},
      "namemc.com"
    )
      .then((r) => (r.ok ? r.text() : null))
      .catch(() => null);
    if (html) {
      return extractSkinsFromSkinsHtml(html);
    }
  }
  return [];
}

const NamemcAPI = {
  resolveUsernameToUuid,
  getNameHistory,
  getSessionTextures,
  getMinecraftProfile,
  getNameMCExtras,
  getFullProfile,
  getUsernameHistory,
  getSkinHistory,
};

export default NamemcAPI;
