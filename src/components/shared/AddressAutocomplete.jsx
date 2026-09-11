import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
let cachedCoords = null; // module-level cache so we only prompt for location once

function getProximity() {
  return new Promise((resolve) => {
    if (cachedCoords) return resolve(cachedCoords);
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => { cachedCoords = { lng: pos.coords.longitude, lat: pos.coords.latitude }; resolve(cachedCoords); },
      () => resolve(null),
      { timeout: 4000, maximumAge: 600000 }
    );
  });
}

// Build a clean "123 Main St, City, ST 00000" from a Mapbox feature.
function formatAddress(f) {
  const street = [f.address, f.text].filter(Boolean).join(' ');
  const ctx = f.context || [];
  const city = ctx.find(c => c.id?.startsWith('place'))?.text || '';
  const region = ctx.find(c => c.id?.startsWith('region'));
  const state = region?.short_code?.replace(/^US-/, '') || region?.text || '';
  const zip = ctx.find(c => c.id?.startsWith('postcode'))?.text || '';
  return `${street}${city ? ', ' + city : ''}${state ? ', ' + state : ''}${zip ? ' ' + zip : ''}`.trim() || f.place_name || '';
}

/**
 * Address input with Mapbox autocomplete, biased to the device location.
 * Falls back to a plain input if VITE_MAPBOX_TOKEN isn't set.
 * Props: value, onChange(addressString), placeholder, className.
 */
export default function AddressAutocomplete({ value, onChange, onCoords, placeholder = 'Start typing an address…', className }) {
  const [query, setQuery] = useState(value || '');
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => { setQuery(value || ''); }, [value]);

  useEffect(() => {
    const handler = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const fetchSuggestions = async (q) => {
    if (!TOKEN || q.trim().length < 3) { setSuggestions([]); return; }
    const prox = await getProximity();
    const params = new URLSearchParams({ access_token: TOKEN, autocomplete: 'true', country: 'us', types: 'address', limit: '5' });
    if (prox) params.set('proximity', `${prox.lng},${prox.lat}`);
    try {
      const res = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?${params}`);
      const data = await res.json();
      setSuggestions((data.features || []).map(f => ({ id: f.id, clean: formatAddress(f), label: (f.place_name || '').replace(/, United States$/, ''), center: f.center })));
      setOpen(true);
    } catch { setSuggestions([]); }
  };

  const handleInput = (v) => {
    setQuery(v);
    onChange?.(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(v), 250);
  };

  const choose = (s) => {
    setQuery(s.clean);
    onChange?.(s.clean);
    if (onCoords && Array.isArray(s.center) && s.center.length === 2) {
      onCoords(s.center[1], s.center[0]); // Mapbox center is [lng, lat]
    }
    setOpen(false);
    setSuggestions([]);
  };

  return (
    <div className="relative" ref={boxRef}>
      <Input
        value={query}
        onChange={e => handleInput(e.target.value)}
        onFocus={() => suggestions.length && setOpen(true)}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
      />
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-popover border border-border rounded-md shadow-lg overflow-hidden max-h-60 overflow-y-auto">
          {suggestions.map((s) => (
            <button
              key={s.id}
              type="button"
              onMouseDown={e => { e.preventDefault(); choose(s); }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-muted"
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
