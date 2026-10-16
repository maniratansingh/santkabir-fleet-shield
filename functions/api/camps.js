// Cloudflare Pages Function: /api/camps
// Sant Kabir Eye Hospital Base (Engineered by Mani Ratan Singh • mrps.in)

export const BASE_HOSPITAL = {
  id: 'BASE-HOSPITAL',
  name: 'Sant Kabir Eye Hospital (Base)',
  organization: 'Pragati India Eye Care Society (PIECS)',
  address: 'Bansi Road, near Pindari Hospital, Katra, Basti, UP 272001',
  lat: 26.797313,
  lon: 82.718401,
  googleMapsUrl: 'https://maps.app.goo.gl/NDr27v6mEnooeBE99',
  phone: '+91 94151 40719',
  isBase: true,
};

export async function onRequest() {
  return new Response(JSON.stringify({ 
    base: BASE_HOSPITAL, 
    camps: [],
    developer: 'Mani Ratan Singh (mrps.in)'
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache',
      'X-Powered-By': 'Sant Kabir Fleet Shield (mrps.in)',
    },
  });
}
