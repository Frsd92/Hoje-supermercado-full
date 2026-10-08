export const storeDeviceCategories = [
  { key: 'mobile', label: 'Celular' },
  { key: 'tablet', label: 'Tablet' },
  { key: 'desktop', label: 'Computador' },
  { key: 'other', label: 'Outro' },
  { key: 'unknown', label: 'Não identificado' },
];

export const storeBrowserCategories = [
  { key: 'chrome', label: 'Chrome' },
  { key: 'safari', label: 'Safari' },
  { key: 'edge', label: 'Microsoft Edge' },
  { key: 'firefox', label: 'Firefox' },
  { key: 'samsung-internet', label: 'Samsung Internet' },
  { key: 'opera', label: 'Opera' },
  { key: 'webview', label: 'Navegador interno' },
  { key: 'other', label: 'Outros' },
  { key: 'unknown', label: 'Não identificado' },
];

const deviceCategoryKeys = new Set(storeDeviceCategories.map(({ key }) => key));
const browserCategoryKeys = new Set(storeBrowserCategories.map(({ key }) => key));

function createEmptyCounts(categories) {
  return Object.fromEntries(categories.map(({ key }) => [key, 0]));
}

function addCategoryCount(counts, categoryKeys, key, count) {
  if (!Number.isInteger(count) || count < 0) {
    throw new TypeError('Contagem de sessões inválida.');
  }
  counts[categoryKeys.has(key) ? key : 'other'] += count;
}

function readStoredCounts(value, categories) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Distribuição de sessões inválida.');
  }

  return Object.fromEntries(categories.map(({ key }) => {
    const count = value[key] ?? 0;
    if (!Number.isInteger(count) || count < 0) {
      throw new TypeError('Contagem de sessões inválida.');
    }
    return [key, count];
  }));
}

export function classifyStoreClient(userAgent) {
  if (typeof userAgent !== 'string' || !userAgent.trim()) {
    return { deviceType: 'unknown', browser: 'unknown' };
  }

  const agent = userAgent.trim();
  let deviceType = 'other';
  if (/ipad|tablet|playbook|silk/i.test(agent) || (/android/i.test(agent) && !/mobile/i.test(agent))) {
    deviceType = 'tablet';
  } else if (/iphone|ipod|mobile|windows phone|iemobile|blackberry|bb10/i.test(agent)) {
    deviceType = 'mobile';
  } else if (/windows nt|macintosh|mac os x|x11|linux/i.test(agent)) {
    deviceType = 'desktop';
  }

  let browser = 'other';
  if (/;\s*wv\)|\bwv\b|fban|fbav|instagram|snapchat|tiktok|line\//i.test(agent)) {
    browser = 'webview';
  } else if (/edg(?:a|ios)?\//i.test(agent)) {
    browser = 'edge';
  } else if (/samsungbrowser\//i.test(agent)) {
    browser = 'samsung-internet';
  } else if (/opr\/|opera/i.test(agent)) {
    browser = 'opera';
  } else if (/firefox\/|fxios\//i.test(agent)) {
    browser = 'firefox';
  } else if (/chrome\/|crios\//i.test(agent)) {
    browser = 'chrome';
  } else if (/safari\//i.test(agent)) {
    browser = 'safari';
  }

  return { deviceType, browser };
}

export function buildStoreTrafficClientCounts(groups) {
  const deviceCounts = createEmptyCounts(storeDeviceCategories);
  const browserCounts = createEmptyCounts(storeBrowserCategories);

  groups.forEach((group) => {
    addCategoryCount(deviceCounts, deviceCategoryKeys, group.deviceType, group.count);
    addCategoryCount(browserCounts, browserCategoryKeys, group.browser, group.count);
  });

  return { deviceCounts, browserCounts };
}

export function buildStoreTrafficClientItems(counts) {
  const devices = readStoredCounts(counts.deviceCounts, storeDeviceCategories);
  const browsers = readStoredCounts(counts.browserCounts, storeBrowserCategories);

  return {
    devices: storeDeviceCategories.map(({ key, label }) => ({ key, label, count: devices[key] })),
    browsers: storeBrowserCategories.map(({ key, label }) => ({ key, label, count: browsers[key] })),
  };
}

export function buildStoreTrafficClientPeaks({ snapshots, now, periodStart }) {
  const devicePeaks = createEmptyCounts(storeDeviceCategories);
  const browserPeaks = createEmptyCounts(storeBrowserCategories);
  const rangeStart = periodStart.getTime();
  const rangeEnd = now.getTime();
  let hasBreakdown = false;

  snapshots.forEach((snapshot) => {
    const sampledAt = new Date(snapshot.minute).getTime();
    if (!Number.isFinite(sampledAt)) throw new TypeError('Data da amostra inválida.');
    if (sampledAt < rangeStart || sampledAt >= rangeEnd || snapshot.deviceCounts == null || snapshot.browserCounts == null) return;

    const deviceCounts = readStoredCounts(snapshot.deviceCounts, storeDeviceCategories);
    const browserCounts = readStoredCounts(snapshot.browserCounts, storeBrowserCategories);
    storeDeviceCategories.forEach(({ key }) => {
      devicePeaks[key] = Math.max(devicePeaks[key], deviceCounts[key]);
    });
    storeBrowserCategories.forEach(({ key }) => {
      browserPeaks[key] = Math.max(browserPeaks[key], browserCounts[key]);
    });
    hasBreakdown = true;
  });

  return hasBreakdown
    ? buildStoreTrafficClientItems({ deviceCounts: devicePeaks, browserCounts: browserPeaks })
    : null;
}
