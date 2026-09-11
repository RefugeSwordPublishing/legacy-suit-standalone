import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { MapPin } from 'lucide-react';

export default function AddressAutocomplete({ value, onChange, placeholder }) {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleChange = (e) => {
    const val = e.target.value;
    onChange(val);

    clearTimeout(debounceRef.current);
    if (val.length < 3) { setSuggestions([]); setOpen(false); return; }

    debounceRef.current = setTimeout(async () => {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=5&countrycodes=us&q=${encodeURIComponent(val)}`,
        { headers: { 'Accept-Language': 'en' } }
      );
      const data = await res.json();
      setSuggestions(data);
      setOpen(data.length > 0);
    }, 350);
  };

  const formatAddress = (item) => {
    const a = item.address || {};
    const parts = [];
    // House number
    if (a.house_number) parts.push(a.house_number);
    // Direction prefix (e.g. "N", "South")
    if (a.road) {
      parts.push(a.road);
    }
    // City: city > town > village > hamlet
    const city = a.city || a.town || a.village || a.hamlet || '';
    if (city) parts.push(city);
    // State abbreviation
    const state = a.state || '';
    if (state) parts.push(state);
    return parts.join(', ');
  };

  const handleSelect = (item) => {
    onChange(formatAddress(item));
    setSuggestions([]);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <Input
        value={value}
        onChange={handleChange}
        placeholder={placeholder || '123 Main St, City, ST'}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
      />
      {open && (
        <ul className="absolute z-50 mt-1 w-full bg-popover border border-border rounded-md shadow-lg max-h-60 overflow-y-auto">
          {suggestions.map((item) => (
            <li
              key={item.place_id}
              onMouseDown={() => handleSelect(item)}
              className="flex items-start gap-2 px-3 py-2 cursor-pointer hover:bg-muted text-sm"
            >
              <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground" />
              <span>{formatAddress(item)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}