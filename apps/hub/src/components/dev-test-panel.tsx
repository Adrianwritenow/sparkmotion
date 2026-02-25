"use client";

import { useState, useEffect, useRef } from "react";

interface Band {
  id: string;
  bandId: string;
}

interface Event {
  id: string;
  name: string;
  status: string;
  _count: { bands: number };
  bands: Band[];
}

interface Org {
  id: string;
  name: string;
  slug: string;
  events: Event[];
}

interface TestData {
  orgs: Org[];
}

export function DevTestPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [data, setData] = useState<TestData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedOrgId, setSelectedOrgId] = useState<string>("");
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [bandInput, setBandInput] = useState<string>("");
  const [showBandList, setShowBandList] = useState(false);
  const bandInputRef = useRef<HTMLDivElement>(null);

  // Fetch data when panel opens
  useEffect(() => {
    if (isOpen) {
      setData(null);
      setLoading(true);
      setError(null);
      fetch("/api/dev/test-data")
        .then((res) => res.json())
        .then((json) => {
          if (json.error) {
            setError(json.error);
          } else {
            setData(json);
          }
        })
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
    }
  }, [isOpen]);

  // Close band dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (bandInputRef.current && !bandInputRef.current.contains(event.target as Node)) {
        setShowBandList(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Reset downstream selections when parent changes
  useEffect(() => {
    setSelectedEventId("");
    setBandInput("");
  }, [selectedOrgId]);

  useEffect(() => {
    setBandInput("");
  }, [selectedEventId]);

  const selectedOrg = data?.orgs.find((o) => o.id === selectedOrgId);
  const selectedEvent = selectedOrg?.events.find((e) => e.id === selectedEventId);
  const canScan = bandInput.trim() !== "";

  const filteredBands = selectedEvent?.bands.filter((band) =>
    band.bandId.toLowerCase().includes(bandInput.toLowerCase())
  ) ?? [];

  const handleScan = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canScan || !selectedOrg) return;
    // Use current Hub origin with orgSlug query param (works on any deployment)
    // In production with *.sparkmotion.net, subdomain extraction takes priority
    const params = new URLSearchParams({
      bandId: bandInput.trim(),
      orgSlug: selectedOrg.slug,
    });
    if (selectedEventId) {
      params.set("eventId", selectedEventId);
    }
    window.open(`${window.location.origin}/e?${params.toString()}`, "_blank");
  };

  if (error === "Not available") {
    return null;
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-4 right-4 z-50 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg shadow-lg font-medium"
      >
        {isOpen ? "Close" : "Dev Test"}
      </button>

      {/* Panel */}
      {isOpen && (
        <div
          className="fixed bottom-16 right-4 z-50 w-80 bg-white border border-gray-200 rounded-lg shadow-xl p-4"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="font-semibold text-gray-900 mb-3">NFC Scan Simulator</h3>

          {loading && <p className="text-gray-500 text-sm">Loading...</p>}
          {error && <p className="text-red-500 text-sm">{error}</p>}

          {data && (
            <div className="space-y-3">
              {/* Org selector */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Organization
                </label>
                <select
                  value={selectedOrgId}
                  onChange={(e) => setSelectedOrgId(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                >
                  <option value="">Select org...</option>
                  {data.orgs.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name} ({org.events.length} events)
                    </option>
                  ))}
                </select>
              </div>

              {/* Event selector */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Event
                </label>
                <select
                  value={selectedEventId}
                  onChange={(e) => setSelectedEventId(e.target.value)}
                  disabled={!selectedOrgId}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm disabled:bg-gray-100"
                >
                  <option value="">Select event...</option>
                  {selectedOrg?.events.map((event) => (
                    <option key={event.id} value={event.id}>
                      {event.name} ({event._count.bands} bands) [{event.status === "ACTIVE" ? "Active" : "Upcoming"}]
                    </option>
                  ))}
                </select>
              </div>

              {/* Band input with searchable dropdown */}
              <div ref={bandInputRef} className="relative">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Band ID
                </label>
                <input
                  type="text"
                  value={bandInput}
                  onChange={(e) => {
                    setBandInput(e.target.value);
                    setShowBandList(true);
                  }}
                  onFocus={() => setShowBandList(true)}
                  disabled={!selectedOrgId}
                  placeholder={selectedEventId ? "Search existing or enter new..." : "Enter band ID..."}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm disabled:bg-gray-100"
                />
                {showBandList && bandInput.trim() && selectedEvent && (
                  <ul className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-40 overflow-y-auto">
                    {filteredBands.map((band) => (
                      <li
                        key={band.id}
                        onClick={() => {
                          setBandInput(band.bandId);
                          setShowBandList(false);
                        }}
                        className="px-3 py-1.5 text-sm cursor-pointer hover:bg-gray-100"
                      >
                        {band.bandId}
                      </li>
                    ))}
                    {filteredBands.length === 0 && (
                      <li className="px-3 py-1.5 text-sm text-gray-500">
                        No matches — will use &quot;{bandInput.trim()}&quot; as-is
                      </li>
                    )}
                  </ul>
                )}
              </div>

              {/* Scan button */}
              <button
                onClick={(e) => handleScan(e)}
                disabled={!canScan}
                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white px-4 py-2 rounded-md font-medium text-sm mt-2"
              >
                Simulate NFC Scan
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
