import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';

const LAZARO_COORDS = { lat: 17.9567646, lon: -102.1943485 };

/**
 * Función principal para obtener ciclones activos con coordenadas y distancia.
 */
export async function getCiclones() {
  const url = 'https://www.nhc.noaa.gov/gtwo.xml?basin=epac&fdays=5';
  const parser = new XMLParser({ ignoreAttributes: false });

  try {
    const { data } = await axios.get(url);
    const parsed = parser.parse(data);
    const items = parsed?.rss?.channel?.item || [];

    const pacificoItem = items.find(item =>
      item.title.toLowerCase().includes('eastern north pacific')
    );

    if (!pacificoItem) {
      console.warn('⚠️ No se encontró el item del Pacífico Este');
      return [];
    }

    const rawDesc = pacificoItem.description;
    const descText = typeof rawDesc === 'string'
      ? rawDesc.replace(/<[^>]*>/g, '').replace(/\n/g, ' ').trim()
      : '';

    const matchesRaw = descText.match(/(Hurricane|Tropical Storm|Tropical Depression) [A-Z][a-z]+/g) || [];

    const nombres = [...new Set(
  matchesRaw
    .map(m => m.split(' ').pop()?.trim().toLowerCase())
    .filter(n => n && !['center', 'region', 'area', 'zone', 'coast'].includes(n))
)];


    const ciclones = await Promise.all(nombres.map(async name => {
      const result = await getCoordenadasDesdeIndexEP(name);

      return {
        title: capitalizeWords(name),
        link: pacificoItem.link,
        pubDate: pacificoItem.pubDate,
        description: descText,
        lat: result.lat,
        lon: result.lon,
        distanciaKM: result.distancia
      };
    }));

    console.log(`✅ ${ciclones.length} ciclones detectados:`, ciclones.map(c => c.title));
    return ciclones;
  } catch (error) {
    console.error('❌ Error leyendo el XML de NOAA:', error.message);
    return [];
  }
}

/**
 * Busca coordenadas de un ciclón activo desde index-ep.xml
 */
async function getCoordenadasDesdeIndexEP(nombre) {
  const url = 'https://www.nhc.noaa.gov/index-ep.xml';
  const parser = new XMLParser({ ignoreAttributes: false });

  try {
    const { data } = await axios.get(url);
    const parsed = parser.parse(data);
    const items = parsed?.rss?.channel?.item || [];

    const item = items.find(it => {
      const stormName = it?.['nhc:Cyclone']?.['nhc:name']?.toLowerCase();
      return stormName === nombre.toLowerCase();
    });

    const centro = item?.['nhc:Cyclone']?.['nhc:center'];
    if (centro) {
      const [latStr, lonStr] = centro.split(',').map(s => s.trim());
      const lat = parseFloat(latStr);
      const lon = parseFloat(lonStr);
      const distancia = calcularDistanciaKM(lat, lon, LAZARO_COORDS.lat, LAZARO_COORDS.lon);
      return { lat, lon, distancia };
    }

    return { lat: null, lon: null, distancia: null };
  } catch (err) {
    console.error('❌ Error al obtener coordenadas desde index-ep.xml:', err.message);
    return { lat: null, lon: null, distancia: null };
  }
}

/**
 * Calcula la distancia en kilómetros entre dos coordenadas.
 */
function calcularDistanciaKM(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = deg => deg * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

/**
 * Capitaliza la primera letra de cada palabra.
 */
function capitalizeWords(text) {
  return text.replace(/\b\w/g, c => c.toUpperCase());
}
