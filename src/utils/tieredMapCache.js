// Tiered Progressive GIS Cache Engine for Purvanchal
// Engineered by Mani Ratan Singh (https://mrps.in | https://github.com/maniratansingh)
// Manages asynchronous loading of Tier 2 (Regional) and Tier 3 (Micro-Hamlets) from GitHub/CDN

const memoryCache = new Map();
const pendingRequests = new Map();

// GitHub Raw fallback repository URL
const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/maniratansingh/santkabir-fleet-shield/main/public';

/**
 * Asynchronously loads and caches tiered GeoJSON datasets (Tier 2 & Tier 3)
 * @param {string} tierKey - 'tier2' or 'tier3'
 * @param {string} localPath - Path relative to public root (e.g. '/data/tiered/purvanchal-tier2.geojson')
 * @returns {Promise<object|null>} - GeoJSON FeatureCollection
 */
export async function loadTieredGeoJson(tierKey, localPath) {
  if (memoryCache.has(tierKey)) {
    return memoryCache.get(tierKey);
  }

  // Check sessionStorage
  if (typeof window !== 'undefined' && window.sessionStorage) {
    try {
      const stored = sessionStorage.getItem(`sk_tiered_${tierKey}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        memoryCache.set(tierKey, parsed);
        return parsed;
      }
    } catch (e) {
      // Session storage quota or parsing error, fall back to memory
    }
  }

  if (pendingRequests.has(tierKey)) {
    return pendingRequests.get(tierKey);
  }

  const fetchPromise = (async () => {
    let data = null;

    // 1. Try local origin first (/data/tiered/...)
    try {
      const res = await fetch(localPath);
      if (res.ok) {
        data = await res.json();
      }
    } catch (err) {
      console.warn(`Local fetch for ${tierKey} failed, attempting GitHub Raw CDN fallback...`);
    }

    // 2. Fallback to GitHub Raw CDN
    if (!data) {
      try {
        const githubUrl = `${GITHUB_RAW_BASE}${localPath}`;
        const res = await fetch(githubUrl);
        if (res.ok) {
          data = await res.json();
        }
      } catch (err) {
        console.error(`GitHub CDN fallback for ${tierKey} failed:`, err);
      }
    }

    if (data && data.type === 'FeatureCollection') {
      memoryCache.set(tierKey, data);
      if (typeof window !== 'undefined' && window.sessionStorage && tierKey === 'tier2') {
        try {
          sessionStorage.setItem(`sk_tiered_${tierKey}`, JSON.stringify(data));
        } catch (e) {}
      }
      return data;
    }

    return null;
  })();

  pendingRequests.set(tierKey, fetchPromise);
  try {
    const result = await fetchPromise;
    return result;
  } finally {
    pendingRequests.delete(tierKey);
  }
}
