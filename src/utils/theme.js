// Dynamic Restaurant Color Extraction, WCAG Contrast Correction, and Theme Engine

/**
 * Helper to convert HEX to RGB
 */
function hexToRgb(hex) {
  let c = hex.replace('#', '');
  if (c.length === 3) {
    c = c.split('').map(char => char + char).join('');
  }
  const num = parseInt(c, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255
  };
}

/**
 * Helper to convert RGB to HEX
 */
function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(x => {
    const hex = Math.max(0, Math.min(255, Math.round(x))).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

/**
 * Calculate Relative Luminance for WCAG Contrast
 */
function getLuminance(r, g, b) {
  const a = [r, g, b].map(v => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

/**
 * Adjust Color Brightness / Saturation for contrast correction
 */
function adjustColorBrightness(hex, percent) {
  const { r, g, b } = hexToRgb(hex);
  const factor = 1 + percent / 100;
  return rgbToHex(
    Math.min(255, Math.max(0, r * factor)),
    Math.min(255, Math.max(0, g * factor)),
    Math.min(255, Math.max(0, b * factor))
  );
}

/**
 * Strong Color Correction: Ensures logo extracted colors are vivid and high contrast
 */
export function sanitizeBrandColor(hex, fallback = '#e11d48') {
  if (!hex || !/^#[0-9A-F]{6}$/i.test(hex)) return fallback;
  const { r, g, b } = hexToRgb(hex);
  const lum = getLuminance(r, g, b);

  // If color is too light (washed out / yellow), darken it for visibility
  if (lum > 0.6) {
    return adjustColorBrightness(hex, -45);
  }
  // If color is extremely dark, brighten it slightly
  if (lum < 0.05) {
    return adjustColorBrightness(hex, 40);
  }
  return hex;
}

/**
 * Extract Palette directly from Logo Image
 */
export async function extractPaletteFromLogo(logoUrl) {
  const defaultPalette = {
    primary: '#e11d48',
    secondary: '#f97316',
    accent: '#fbbf24',
    dark: '#9f1239',
    light: '#ffe4e6',
    bgLayer1: '#fff1f2',
    bgLayer2: '#fff7ed'
  };

  if (!logoUrl) return defaultPalette;

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.src = logoUrl;

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 100;
        canvas.height = 100;

        ctx.drawImage(img, 0, 0, 100, 100);
        const imgData = ctx.getImageData(0, 0, 100, 100).data;

        const colorCounts = {};
        for (let i = 0; i < imgData.length; i += 16) {
          const r = imgData[i];
          const g = imgData[i + 1];
          const b = imgData[i + 2];
          const alpha = imgData[i + 3];

          if (alpha < 128) continue; // Skip transparent
          // Skip pure whites/blacks
          if ((r > 240 && g > 240 && b > 240) || (r < 15 && g < 15 && b < 15)) continue;

          const hex = rgbToHex(r, g, b);
          colorCounts[hex] = (colorCounts[hex] || 0) + 1;
        }

        const sortedColors = Object.keys(colorCounts).sort((a, b) => colorCounts[b] - colorCounts[a]);

        if (sortedColors.length === 0) {
          return resolve(defaultPalette);
        }

        const primaryRaw = sortedColors[0];
        const secondaryRaw = sortedColors[1] || adjustColorBrightness(primaryRaw, 25);
        const accentRaw = sortedColors[2] || adjustColorBrightness(primaryRaw, -25);

        const primary = sanitizeBrandColor(primaryRaw);
        const secondary = sanitizeBrandColor(secondaryRaw, '#f97316');
        const accent = sanitizeBrandColor(accentRaw, '#fbbf24');

        const dark = adjustColorBrightness(primary, -35);
        const light = adjustColorBrightness(primary, 75);

        resolve({
          primary,
          secondary,
          accent,
          dark,
          light,
          bgLayer1: adjustColorBrightness(primary, 85),
          bgLayer2: adjustColorBrightness(secondary, 85)
        });
      } catch (err) {
        console.warn('Logo color extraction failed, fallback used:', err);
        resolve(defaultPalette);
      }
    };

    img.onerror = () => {
      resolve(defaultPalette);
    };
  });
}

/**
 * Apply Brand Custom Properties dynamically to root document
 */
export function applyRestaurantTheme(palette, isDarkMode = false) {
  if (!palette) return;
  const root = document.documentElement;

  root.style.setProperty('--brand-primary', palette.primary);
  root.style.setProperty('--brand-secondary', palette.secondary);
  root.style.setProperty('--brand-accent', palette.accent);
  root.style.setProperty('--brand-dark', palette.dark);
  root.style.setProperty('--brand-light', palette.light);
  root.style.setProperty('--brand-bg-layer1', palette.bgLayer1);
  root.style.setProperty('--brand-bg-layer2', palette.bgLayer2);

  if (isDarkMode) {
    root.style.setProperty('--bg-main', '#0f172a');
    root.style.setProperty('--card-bg', 'rgba(30, 41, 59, 0.85)');
    root.style.setProperty('--card-border', 'rgba(255, 255, 255, 0.12)');
    root.style.setProperty('--text-main', '#f8fafc');
    root.style.setProperty('--text-muted', '#94a3b8');
    root.style.setProperty('--input-bg', '#1e293b');
  } else {
    root.style.setProperty('--bg-main', '#f8fafc');
    root.style.setProperty('--card-bg', 'rgba(255, 255, 255, 0.90)');
    root.style.setProperty('--card-border', 'rgba(226, 232, 240, 0.8)');
    root.style.setProperty('--text-main', '#0f172a');
    root.style.setProperty('--text-muted', '#64748b');
    root.style.setProperty('--input-bg', '#ffffff');
  }
}
