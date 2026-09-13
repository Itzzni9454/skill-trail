/**
 * Dynamic SVG Badge Generator for GitHub Profile READMEs
 *
 * Generates lightweight, pixel-perfect vector SVGs displaying user study progress,
 * streaks, and completion rates. Designed to pass GitHub Camo caching and render
 * cleanly in both light and dark GitHub profile views.
 */

function escapeXml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Generate a sleek Shields-style badge SVG.
 * e.g. [ Frontend Developer | 42/140 (30%) ]
 */
export function generateFlatBadge({ label, value, color = '#10b981', streak = 0 }) {
  const safeLabel = escapeXml(label);
  const safeValue = escapeXml(value);
  const streakText = streak > 0 ? ` 🔥 ${streak}d` : '';

  // Approximate character widths for sans-serif (11px)
  const labelWidth = Math.max(60, Math.round(safeLabel.length * 7 + 16));
  const valueWidth = Math.max(60, Math.round((safeValue.length + streakText.length) * 7.2 + 18));
  const totalWidth = labelWidth + valueWidth;
  const height = 24;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${height}" viewBox="0 0 ${totalWidth} ${height}" role="img" aria-label="${safeLabel}: ${safeValue}">
  <title>${safeLabel}: ${safeValue}${streakText}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#fff" stop-opacity=".1"/>
    <stop offset="100%" stop-color="#000" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r">
    <rect width="${totalWidth}" height="${height}" rx="4" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="${height}" fill="#1e293b"/>
    <rect x="${labelWidth}" width="${valueWidth}" height="${height}" fill="${color}"/>
    <rect width="${totalWidth}" height="${height}" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif" font-size="11" font-weight="600">
    <text x="${labelWidth / 2}" y="16.5" fill="#010101" fill-opacity=".3">${safeLabel}</text>
    <text x="${labelWidth / 2}" y="15.5">${safeLabel}</text>
    <text x="${labelWidth + valueWidth / 2}" y="16.5" fill="#010101" fill-opacity=".3">${safeValue}${escapeXml(streakText)}</text>
    <text x="${labelWidth + valueWidth / 2}" y="15.5">${safeValue}${escapeXml(streakText)}</text>
  </g>
</svg>`;
}

/**
 * Generate a rich GitHub Profile Card SVG with progress bar and statistics.
 */
export function generateCardBadge({
  title,
  doneCount,
  totalNodes,
  learningCount = 0,
  streak = 0,
  theme = 'dark',
}) {
  const safeTitle = escapeXml(title);
  const pct = totalNodes > 0 ? Math.min(100, Math.round((doneCount / totalNodes) * 100)) : 0;
  const isDark = theme !== 'light';

  const bg = isDark ? '#0f172a' : '#ffffff';
  const border = isDark ? '#334155' : '#e2e8f0';
  const textPrimary = isDark ? '#f8fafc' : '#0f172a';
  const textMuted = isDark ? '#94a3b8' : '#64748b';
  const barBg = isDark ? '#1e293b' : '#f1f5f9';

  const width = 380;
  const height = 135;
  const barWidth = 320;
  const fillWidth = Math.round((barWidth * pct) / 100);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">
  <defs>
    <linearGradient id="barGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#10b981"/>
      <stop offset="100%" stop-color="#06b6d4"/>
    </linearGradient>
    <filter id="shadow" x="-4%" y="-4%" width="108%" height="108%" filterUnits="userSpaceOnUse">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#000" flood-opacity="0.15"/>
    </filter>
  </defs>

  <!-- Background container -->
  <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="12" fill="${bg}" stroke="${border}" stroke-width="1.5" filter="url(#shadow)"/>

  <!-- Header -->
  <g transform="translate(24, 28)">
    <text x="0" y="0" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif" font-size="16" font-weight="700" fill="${textPrimary}">
      ${safeTitle}
    </text>
    <text x="${width - 48}" y="0" text-anchor="end" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif" font-size="14" font-weight="700" fill="#10b981">
      ${pct}%
    </text>
  </g>

  <!-- Progress Bar -->
  <g transform="translate(24, 46)">
    <rect width="${barWidth}" height="10" rx="5" fill="${barBg}"/>
    ${fillWidth > 0 ? `<rect width="${fillWidth}" height="10" rx="5" fill="url(#barGrad)"/>` : ''}
  </g>

  <!-- Metrics row -->
  <g transform="translate(24, 86)" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif" font-size="12">
    <!-- Topics Done -->
    <g transform="translate(0, 0)">
      <text x="0" y="0" fill="${textMuted}" font-weight="500">Completed</text>
      <text x="0" y="18" fill="${textPrimary}" font-weight="700" font-size="13">${doneCount} / ${totalNodes}</text>
    </g>

    <!-- In Progress -->
    <g transform="translate(115, 0)">
      <text x="0" y="0" fill="${textMuted}" font-weight="500">Learning</text>
      <text x="0" y="18" fill="#0284c7" font-weight="700" font-size="13">${learningCount}</text>
    </g>

    <!-- Streak -->
    <g transform="translate(225, 0)">
      <text x="0" y="0" fill="${textMuted}" font-weight="500">Study Streak</text>
      <text x="0" y="18" fill="#f59e0b" font-weight="700" font-size="13">${streak} days 🔥</text>
    </g>
  </g>
</svg>`;
}
