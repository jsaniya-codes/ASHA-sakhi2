import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { Loader2, MapPin, Search } from 'lucide-react';
import { KARNATAKA_DISTRICTS } from '../data/nfhs5Karnataka';
import { parseApiResponse } from '../utils/apiClient';
import type { FieldVisit, RiskLevel } from '../types';

interface AreaMapTrackerProps {
  visits: FieldVisit[];
  focusedVisit: FieldVisit | null;
}

interface GeocodeResult {
  label: string;
  lat: number;
  lng: number;
}

const RISK_HEX: Record<RiskLevel, string> = {
  High: '#DC2626',
  Moderate: '#D97706',
  Low: '#16A34A',
};

function buildSafePopupElement(visit: FieldVisit): HTMLElement {
  const root = document.createElement('div');
  root.className = 'text-xs text-slate-800 space-y-1.5 min-w-[200px]';

  const title = document.createElement('div');
  title.className = 'font-semibold text-sm text-slate-900';
  title.textContent = visit.beneficiary_name;
  root.appendChild(title);

  const meta = document.createElement('div');
  meta.className = 'text-slate-500';
  meta.textContent = `${visit.beneficiary_category} · ${visit.village}, ${visit.district}`;
  root.appendChild(meta);

  const risk = document.createElement('div');
  risk.className =
    visit.risk_level === 'High'
      ? 'font-semibold text-red-700'
      : visit.risk_level === 'Moderate'
      ? 'font-semibold text-amber-700'
      : 'font-semibold text-emerald-700';
  risk.textContent = `${visit.risk_level} Risk · ${visit.visit_date}`;
  root.appendChild(risk);

  const vitals = document.createElement('div');
  vitals.className = 'font-mono text-[11px] text-slate-700';
  const bpText =
    visit.bp_systolic && visit.bp_diastolic ? `BP ${visit.bp_systolic}/${visit.bp_diastolic}` : 'BP —';
  const hbText = visit.hemoglobin_gdl !== null ? `Hb ${visit.hemoglobin_gdl} g/dL` : 'Hb —';
  vitals.textContent = `${bpText} · ${hbText}`;
  root.appendChild(vitals);

  if (visit.recommended_action) {
    const action = document.createElement('div');
    action.className = 'pt-1 border-t border-slate-200 text-slate-700 leading-snug';
    action.textContent = visit.recommended_action;
    root.appendChild(action);
  }

  return root;
}

export function AreaMapTracker({ visits, focusedVisit }: AreaMapTrackerProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const searchMarkerRef = useRef<L.CircleMarker | null>(null);

  const [riskFilter, setRiskFilter] = useState<'All' | RiskLevel>('All');
  const [districtFilter, setDistrictFilter] = useState('All');
  const [geoQuery, setGeoQuery] = useState('');
  const [geoResults, setGeoResults] = useState<GeocodeResult[]>([]);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [activeVisitId, setActiveVisitId] = useState<number | null>(focusedVisit?.id ?? null);

  const visibleVisits = useMemo(() => {
    return visits.filter((v) => {
      if (riskFilter !== 'All' && v.risk_level !== riskFilter) return false;
      if (districtFilter !== 'All' && v.district !== districtFilter) return false;
      return true;
    });
  }, [visits, riskFilter, districtFilter]);

  // Initialize Leaflet map once
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [15.3173, 75.7139],
      zoom: 7,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 18,
    }).addTo(map);

    const layerGroup = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;
    markersLayerRef.current = layerGroup;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      markersLayerRef.current = null;
    };
  }, []);

  // Render visit markers cleanly whenever visibleVisits changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layer = markersLayerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();

    visibleVisits.forEach((visit) => {
      const color = RISK_HEX[visit.risk_level];
      const marker = L.circleMarker([visit.lat, visit.lng], {
        radius: visit.risk_level === 'High' ? 9 : 7,
        fillColor: color,
        color: '#ffffff',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.9,
      });

      marker.bindPopup(buildSafePopupElement(visit));
      marker.on('click', () => setActiveVisitId(visit.id));
      marker.addTo(layer);

      if (focusedVisit && focusedVisit.id === visit.id) {
        marker.openPopup();
      }
    });
  }, [visibleVisits, focusedVisit]);

  // Pan to focusedVisit when navigated from Field Register
  useEffect(() => {
    if (!focusedVisit || !mapInstanceRef.current) return;
    setActiveVisitId(focusedVisit.id);
    mapInstanceRef.current.flyTo([focusedVisit.lat, focusedVisit.lng], 11, {
      duration: 0.6,
    });
  }, [focusedVisit]);

  const handleFocusVisit = (visit: FieldVisit) => {
    setActiveVisitId(visit.id);
    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([visit.lat, visit.lng], 11, { duration: 0.6 });
    }
  };

  const handleDistrictJump = (districtName: string) => {
    setDistrictFilter(districtName);
    if (!mapInstanceRef.current) return;
    if (districtName === 'All') {
      mapInstanceRef.current.flyTo([15.3173, 75.7139], 7, { duration: 0.6 });
      return;
    }
    const found = KARNATAKA_DISTRICTS.find((d) => d.district === districtName);
    if (found) {
      mapInstanceRef.current.flyTo([found.lat, found.lng], 10, { duration: 0.6 });
    }
  };

  const handleGeocodeSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (geoQuery.trim().length < 2) return;
    setGeoLoading(true);
    setGeoError(null);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(geoQuery.trim())}`, {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      const data = await parseApiResponse<{ results?: GeocodeResult[] }>(
        res,
        'Geocoding failed.'
      );
      setGeoResults(data.results || []);
      if (!data.results || data.results.length === 0) {
        setGeoError('No matching Karnataka village or PHC found.');
      }
    } catch (err: unknown) {
      setGeoError(err instanceof Error ? err.message : 'Unable to search OpenStreetMap.');
    } finally {
      setGeoLoading(false);
    }
  };

  const handleSelectGeocode = (result: GeocodeResult) => {
    const map = mapInstanceRef.current;
    if (!map) return;
    if (searchMarkerRef.current) {
      searchMarkerRef.current.remove();
    }
    const pin = L.circleMarker([result.lat, result.lng], {
      radius: 8,
      fillColor: '#0F766E',
      color: '#ffffff',
      weight: 2,
      fillOpacity: 0.95,
    }).addTo(map);
    const popupEl = document.createElement('div');
    popupEl.className = 'text-xs font-medium text-slate-900';
    popupEl.textContent = result.label;
    pin.bindPopup(popupEl).openPopup();
    searchMarkerRef.current = pin;
    map.flyTo([result.lat, result.lng], 12, { duration: 0.6 });
    setGeoResults([]);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500">
            OpenStreetMap + Leaflet Spatial Surveillance · Nominatim Karnataka Village Geocoder
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            Area Map Tracker
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="inline-flex items-center rounded-lg bg-slate-200/70 p-1">
            {(['All', 'High', 'Moderate', 'Low'] as const).map((tier) => (
              <button
                key={tier}
                type="button"
                onClick={() => setRiskFilter(tier)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  riskFilter === tier
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tier === 'All' ? 'All Risks' : `${tier} Risk`}
              </button>
            ))}
          </div>

          <select
            aria-label="Jump to Karnataka district"
            value={districtFilter}
            onChange={(e) => handleDistrictJump(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 focus:border-teal-600 focus:outline-none"
          >
            <option value="All">All Karnataka</option>
            {KARNATAKA_DISTRICTS.map((d) => (
              <option key={d.district} value={d.district}>
                {d.district}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Map + Synchronized Side List */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <section className="xl:col-span-8 flex flex-col rounded-xl border border-slate-200 bg-white overflow-hidden">
          {/* Village / PHC Geocoder Bar */}
          <div className="border-b border-slate-200 px-4 py-3">
            <form onSubmit={handleGeocodeSearch} className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={geoQuery}
                  onChange={(e) => setGeoQuery(e.target.value)}
                  placeholder="Locate any Karnataka village, taluk, or PHC (e.g. Sindhanur, Nanjangud)..."
                  className="w-full rounded-lg border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={geoLoading}
                className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-teal-800 disabled:opacity-60 transition-colors whitespace-nowrap"
              >
                {geoLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MapPin className="h-3.5 w-3.5" />}
                Locate Village
              </button>
            </form>

            {geoError && <p className="mt-2 text-xs text-red-700">{geoError}</p>}

            {geoResults.length > 0 && (
              <div className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200 bg-slate-50">
                {geoResults.map((res, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSelectGeocode(res)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs hover:bg-white transition-colors"
                  >
                    <span className="text-slate-800 truncate">{res.label}</span>
                    <span className="font-mono text-[11px] text-slate-500 shrink-0 tabular-nums">
                      {res.lat.toFixed(3)}, {res.lng.toFixed(3)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Map Viewport */}
          <div ref={mapContainerRef} className="h-[520px] w-full bg-slate-100" />

          {/* Legend */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-2.5 text-xs text-slate-600">
            <div className="flex items-center gap-4">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-red-600" />
                High Risk Escalation
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-600" />
                Moderate Follow-up
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-600" />
                Low Risk Nominal
              </span>
            </div>
            <span className="font-mono text-slate-500 tabular-nums">
              {visibleVisits.length} plotted locations
            </span>
          </div>
        </section>

        {/* Right Column: Plotted Visit List */}
        <section className="xl:col-span-4 rounded-xl border border-slate-200 bg-white overflow-hidden flex flex-col max-h-[630px]">
          <div className="border-b border-slate-200 px-5 py-3.5">
            <h2 className="text-sm font-semibold text-slate-900">
              Mapped Field Visits ({visibleVisits.length})
            </h2>
            <p className="text-xs text-slate-500">Click any visit to center map coordinates</p>
          </div>

          <div className="flex-1 divide-y divide-slate-200 overflow-y-auto">
            {visibleVisits.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                No visits match the active map filters.
              </div>
            ) : (
              visibleVisits.map((v) => {
                const isSelected = activeVisitId === v.id;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => handleFocusVisit(v)}
                    className={`w-full px-5 py-3.5 text-left transition-colors ${
                      isSelected ? 'bg-teal-50/70' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-semibold text-slate-900">
                        {v.beneficiary_name}
                      </span>
                      <span
                        className={`text-xs font-semibold shrink-0 ${
                          v.risk_level === 'High'
                            ? 'text-red-700'
                            : v.risk_level === 'Moderate'
                            ? 'text-amber-700'
                            : 'text-emerald-700'
                        }`}
                      >
                        {v.risk_level} Risk
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {v.village}, {v.district} · {v.phc_center}
                    </p>
                    <p className="mt-1.5 text-xs text-slate-700 line-clamp-2">
                      {v.recommended_action || v.symptoms || 'Routine ASHA home visit'}
                    </p>
                    <div className="mt-1.5 font-mono text-[11px] text-slate-400 tabular-nums">
                      {v.visit_date} · {v.lat.toFixed(3)}°N, {v.lng.toFixed(3)}°E
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
