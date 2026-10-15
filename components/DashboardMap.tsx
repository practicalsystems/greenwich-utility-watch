'use client'

import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { format, parseISO } from 'date-fns'

const PIN = L.divIcon({
  html: `<svg viewBox="0 0 24 36" width="24" height="36" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 0C5.4 0 0 5.4 0 12c0 9.6 12 24 12 24S24 21.6 24 12C24 5.4 18.6 0 12 0z"
      fill="#f59e0b" stroke="#92400e" stroke-width="1.5"/>
    <circle cx="12" cy="12" r="4" fill="white"/>
  </svg>`,
  className: '',
  iconSize: [24, 36],
  iconAnchor: [12, 36],
  popupAnchor: [0, -36],
})

export type MapReport = {
  id: string
  latitude: number
  longitude: number
  address: string
  problem_type: string | null
  created_at: string
}

// Greenwich, CT center
const GREENWICH_CENTER: [number, number] = [41.026, -73.628]

export default function DashboardMap({ reports }: { reports: MapReport[] }) {
  return (
    <MapContainer
      center={GREENWICH_CENTER}
      zoom={13}
      scrollWheelZoom={true}
      style={{ height: '450px', width: '100%', borderRadius: '8px' }}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      {reports.map((r) => (
        <Marker key={r.id} position={[r.latitude, r.longitude]} icon={PIN}>
          <Popup>
            <div className="text-sm">
              <p className="font-semibold">{r.address}</p>
              {r.problem_type && <p className="text-slate-600">{r.problem_type}</p>}
              <p className="text-slate-500 text-xs mt-1">
                {format(parseISO(r.created_at), 'MMM d, yyyy')}
              </p>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  )
}
