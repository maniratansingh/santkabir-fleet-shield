// Sant Kabir Eye Hospital Base Configuration & Spatial Calculations
// Engineered by Mani Ratan Singh (https://mrps.in | https://github.com/maniratansingh)

export const BASE_HOSPITAL = {
  id: 'BASE-HOSPITAL',
  name: 'Sant Kabir Eye Hospital',
  address: 'Bansi Road, near Pindari Hospital, Katra, Basti, UP 272001',
  lat: 26.797313,
  lon: 82.718401,
  googleMapsUrl: 'https://maps.app.goo.gl/NDr27v6mEnooeBE99',
  phone: '+91 94151 40719',
  isBase: true,
};

// Calculate Great-Circle Distance in Kilometers between two coordinates
export function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}
