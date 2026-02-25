"use client";

import { useState, useEffect } from "react";
import { MapPin } from "lucide-react";
import { Input } from "@/components/ui/input";
import usePlacesAutocomplete, {
  getGeocode,
  getLatLng,
} from "use-places-autocomplete";
import { cn } from "@/lib/utils";

declare global {
  interface Window {
    google?: typeof google;
  }
}

interface PlaceResult {
  venueName: string;
  formattedAddress: string;
  latitude: number;
  longitude: number;
  city: string;
  state: string;
  country: string;
  zipcode: string;
}

interface GooglePlacesAutocompleteProps {
  onPlaceSelect: (place: PlaceResult) => void;
  defaultValue?: string;
}

export function GooglePlacesAutocomplete({
  onPlaceSelect,
  defaultValue = "",
}: GooglePlacesAutocompleteProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Load Google Maps API
  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

    if (!apiKey) {
      setLoadError("Google Maps API key not configured");
      return;
    }

    // Check if already loaded
    if (window.google?.maps?.places) {
      setIsLoaded(true);
      return;
    }

    // Load script manually
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=Function.prototype`;
    script.async = true;
    script.defer = true;

    script.onload = () => {
      setIsLoaded(true);
    };

    script.onerror = () => {
      setLoadError("Failed to load Google Maps");
    };

    document.head.appendChild(script);

    return () => {
      // Cleanup on unmount
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };
  }, []);

  const {
    ready,
    value,
    suggestions: { status, data },
    setValue,
    clearSuggestions,
  } = usePlacesAutocomplete({
    requestOptions: {
      types: ["establishment", "geocode"],
    },
    debounce: 300,
    cache: 86400,
    initOnMount: isLoaded,
  });

  useEffect(() => {
    if (defaultValue) {
      setValue(defaultValue, false);
    }
  }, [defaultValue, setValue]);

  const handleSelect = async (suggestion: google.maps.places.AutocompletePrediction) => {
    setValue(suggestion.description, false);
    clearSuggestions();

    try {
      const results = await getGeocode({ address: suggestion.description });
      if (results.length === 0) {
        console.error("No geocode results");
        return;
      }

      const firstResult = results[0];
      if (!firstResult) return;

      const { lat, lng } = await getLatLng(firstResult);
      const venueName = suggestion.structured_formatting.main_text;
      const formattedAddress = firstResult.formatted_address;

      const components = firstResult.address_components || [];
      const getComponent = (type: string, useShort = false) => {
        const comp = components.find((c) => c.types.includes(type));
        return comp ? (useShort ? comp.short_name : comp.long_name) : "";
      };

      onPlaceSelect({
        venueName,
        formattedAddress,
        latitude: lat,
        longitude: lng,
        city: getComponent("locality") || getComponent("sublocality"),
        state: getComponent("administrative_area_level_1", true),
        country: getComponent("country"),
        zipcode: getComponent("postal_code"),
      });
    } catch (error) {
      console.error("Error getting geocode:", error);
    }
  };

  // If API key not set, show regular input with warning
  if (loadError) {
    return (
      <div className="space-y-2">
        <div className="relative">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Enter venue or address..."
            className="pl-9"
            disabled
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Google Places API not configured. Contact administrator.
        </p>
      </div>
    );
  }

  const showSuggestions = status === "OK" && data.length > 0;

  return (
    <div className="relative">
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={ready ? "Search for venue or address..." : "Loading..."}
          disabled={!ready}
          className="pl-9"
        />
      </div>

      {showSuggestions && (
        <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-60 overflow-auto">
          {data.map((suggestion) => (
            <button
              key={suggestion.place_id}
              type="button"
              onClick={() => handleSelect(suggestion)}
              className={cn(
                "w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground",
                "border-b border-border last:border-b-0 cursor-pointer transition-colors"
              )}
            >
              <div className="flex items-start gap-2">
                <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                <div>
                  <div className="font-medium">
                    {suggestion.structured_formatting.main_text}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {suggestion.structured_formatting.secondary_text}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
