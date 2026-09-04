import { useEffect } from 'react';
import { useCurrentUser } from '@/lib/UserContext';
import { FONT_PAIRINGS, hexToHslChannels, readableForeground } from '@/lib/branding';

// Applies the tenant's branding (colors + fonts) to CSS variables at runtime. Renders nothing.
function injectFontLink(families) {
  if (!families?.length) return;
  const id = 'brand-fonts';
  const href = `https://fonts.googleapis.com/css2?${families.map((f) => `family=${f}`).join('&')}&display=swap`;
  let link = document.getElementById(id);
  if (!link) { link = document.createElement('link'); link.id = id; link.rel = 'stylesheet'; document.head.appendChild(link); }
  if (link.href !== href) link.href = href;
}

export default function BrandingApplier() {
  const { currentUser } = useCurrentUser();
  const b = currentUser?.branding || {};

  useEffect(() => {
    const root = document.documentElement;
    const set = (k, v) => (v ? root.style.setProperty(k, v) : root.style.removeProperty(k));

    // Keep GuildWright's neutral dark primary (buttons/sidebar base) so the UI stays legible and
    // isn't swamped by a strong brand color. The tenant's brand shows through the ACCENT only:
    // highlights, active nav, focus rings, key CTAs.
    set('--primary', null);
    set('--primary-foreground', null);

    const accent = hexToHslChannels(b.accent);
    const accentFg = accent ? readableForeground(b.accent) : null;
    set('--accent', accent);
    set('--accent-foreground', accentFg);
    set('--ring', accent);
    set('--sidebar-accent', accent);
    set('--sidebar-accent-foreground', accentFg);
    set('--sidebar-ring', accent);

    const pair = FONT_PAIRINGS[b.font];
    if (pair && b.font && b.font !== 'default') {
      set('--font-butler', pair.heading);
      set('--font-highway', pair.body);
      injectFontLink(pair.google);
    } else {
      set('--font-butler', null);
      set('--font-highway', null);
    }
  }, [b.primary, b.accent, b.font]);

  return null;
}
