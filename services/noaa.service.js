import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';
import * as cheerio from 'cheerio';

const LAZARO_COORDS = { lat: 17.9567646, lon: -102.1943485 };

export async function getCiclones() {
  const url = 'https://www.nhc.noaa.gov/index-ep.xml';
  const parser = new XMLParser({ ignoreAttributes: false });

  try {
    const { data } = await axios.get(url);
    const parsed = parser.parse(data);
    const items = parsed?.rss?.channel?.item || [];

    const ciclonesPorNombre = new Map();

    for (const item of items) {
      const titulo = item.title;

      if (!/(Hurricane|Tropical Storm|Tropical Depression)/i.test(titulo)) continue;

      const rawDesc = item.description || '';
      const descText = typeof rawDesc === 'string'
        ? rawDesc.replace(/<[^>]*>/g, '').replace(/\n/g, ' ').trim()
        : '';

      const nombreBase = extraerNombreFenomeno(titulo);
      if (!nombreBase) continue;

      let entry = ciclonesPorNombre.get(nombreBase);

      if (!entry) {
        let lat = null, lon = null, distancia = null;
        const advisoryURL = item.link;

        if (advisoryURL) {
          const result = await obtenerCoordenadasYNombreDesdeAdvisory(advisoryURL, titulo);
          lat = result.lat;
          lon = result.lon;
          distancia = result.distancia;
        }

        entry = {
          title: nombreBase,
          link: item.link,
          pubDate: item.pubDate,
          description: descText,
          lat,
          lon,
          distanciaKM: distancia,
          otros: []
        };

        ciclonesPorNombre.set(nombreBase, entry);
      } else {
        entry.otros.push({
          title: titulo,
          link: item.link
        });
      }
    }

    const ciclones = Array.from(ciclonesPorNombre.values());
    console.log(`✅ ${ciclones.length} ciclones detectados:`, ciclones.map(c => c.title));
    return ciclones;
  } catch (error) {
    console.error('❌ Error leyendo el XML de NOAA:', error.message);
    return [];
  }
}

function extraerNombreFenomeno(titulo) {
  const match = titulo.match(/Hurricane ([A-Z][a-z]+)/) ||
                titulo.match(/Tropical Storm ([A-Z][a-z]+)/) ||
                titulo.match(/Tropical Depression ([A-Z][a-z]+)/);
  return match ? match[0] : null;
}

async function obtenerCoordenadasYNombreDesdeAdvisory(url, nombreBase) {
  try {
    console.log(`📥 Obteniendo advisory desde: ${url}`);
    const { data: html } = await axios.get(url);
    const $ = cheerio.load(html);
    const text = $('body').text();

    const match = text.match(/LOCATION\.*\.*\.*([0-9.]+)([NS])\s+([0-9.]+)([EW])/i);
    const lat = match ? parseFloat(match[1]) * (match[2].toUpperCase() === 'S' ? -1 : 1) : null;
    const lon = match ? parseFloat(match[3]) * (match[4].toUpperCase() === 'W' ? -1 : 1) : null;

    const distancia = (lat && lon)
      ? calcularDistanciaKM(lat, lon, LAZARO_COORDS.lat, LAZARO_COORDS.lon)
      : null;

    return { lat, lon, distancia, titulo: nombreBase };
  } catch (err) {
    console.error('❌ Error al procesar advisory:', err.message);
    return { lat: null, lon: null, distancia: null, titulo: nombreBase };
  }
}

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

function capitalizeWords(text) {
  return text.replace(/\b\w/g, c => c.toUpperCase());
}