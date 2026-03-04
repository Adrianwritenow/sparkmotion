"use client";

import { useState, useEffect, useRef } from "react";
import usePlacesAutocomplete, {
  getGeocode,
  getLatLng,
} from "use-places-autocomplete";

export function LocationPicker({
  onSelect,
  onClear,
}: {
  onSelect: (lat: number, lng: number, label: string) => void;
  onClear: () => void;
}) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) return;

    if (window.google?.maps?.places) {
      setIsLoaded(true);
      return;
    }

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=Function.prototype`;
    script.async = true;
    script.defer = true;
    script.onload = () => setIsLoaded(true);
    document.head.appendChild(script);

    return () => {
      if (script.parentNode) script.parentNode.removeChild(script);
    };
  }, []);

  const {
    ready,
    value,
    suggestions: { status, data },
    setValue,
    clearSuggestions,
  } = usePlacesAutocomplete({
    requestOptions: { types: ["establishment", "geocode"] },
    debounce: 300,
    initOnMount: isLoaded,
  });

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        clearSuggestions();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [clearSuggestions]);

  const handleSelect = async (description: string) => {
    setValue(description, false);
    clearSuggestions();

    try {
      const results = await getGeocode({ address: description });
      const first = results[0];
      if (!first) return;
      const { lat, lng } = await getLatLng(first);
      setSelectedLabel(description);
      onSelect(lat, lng, description);
    } catch (error) {
      console.error("Geocode error:", error);
    }
  };

  const handleClear = () => {
    setValue("", false);
    setSelectedLabel(null);
    clearSuggestions();
    onClear();
  };

  if (!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) {
    return null;
  }

  return (
    <div ref={dropdownRef}>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        Scan Location
      </label>
      {selectedLabel ? (
        <div className="flex items-center gap-1 border border-green-300 bg-green-50 rounded-md px-3 py-2 text-sm">
          <span className="truncate flex-1 text-green-800">{selectedLabel}</span>
          <button
            type="button"
            onClick={handleClear}
            className="text-green-600 hover:text-green-800 font-bold flex-shrink-0"
          >
            ×
          </button>
        </div>
      ) : (
        <div className="relative">
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={ready ? "Search location..." : "Loading..."}
            disabled={!ready}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm disabled:bg-gray-100"
          />
          {status === "OK" && data.length > 0 && (
            <ul className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-40 overflow-y-auto">
              {data.map((suggestion) => (
                <li
                  key={suggestion.place_id}
                  onClick={() => handleSelect(suggestion.description)}
                  className="px-3 py-1.5 text-sm cursor-pointer hover:bg-gray-100"
                >
                  <div className="font-medium">
                    {suggestion.structured_formatting.main_text}
                  </div>
                  <div className="text-xs text-gray-500">
                    {suggestion.structured_formatting.secondary_text}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
