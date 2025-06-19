import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';
import * as cheerio from 'cheerio';

const LAZARO_COORDS = { lat: 17.9567646, lon: -102.1943485 };

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
      console.warn('⚠️ No se encontró el item del Pacífico Este en el XML');
      return [];
    }

    const rawDesc = pacificoItem.description;
    const descText = typeof rawDesc === 'string'
      ? rawDesc.replace(/<[^>]*>/g, '').replace(/\n/g, ' ').trim()
      : '';

    const matchesRaw = descText.match(/(Hurricane|Tropical Storm|Tropical Depression) [A-Z][a-z]+/g) || [];
    const matches = [...new Set(
      matchesRaw.filter(name => {
        const cycloneName = name.split(' ').pop()?.toLowerCase();
        return cycloneName && !['center', 'region', 'area'].includes(cycloneName);
      })
    )];

    const ciclones = await Promise.all(matches.map(async name => {
      const advisoryURL = extraerCodigoAdvisoryPorNombre(name, descText);
      console.log(`🌐 ${name} -> ${advisoryURL}`);

      let lat = null, lon = null, distancia = null, tituloReal = name;

      if (advisoryURL) {
        const result = await obtenerCoordenadasYNombreDesdeAdvisory(advisoryURL, name);
        lat = result.lat;
        lon = result.lon;
        distancia = result.distancia;
        tituloReal = result.titulo;
      }

      return {
        title: tituloReal,
        link: pacificoItem.link,
        pubDate: pacificoItem.pubDate,
        description: descText,
        lat,
        lon,
        distanciaKM: distancia
      };
    }));

    console.log(`✅ ${ciclones.length} ciclones detectados:`, ciclones.map(c => c.title));
    return ciclones;
  } catch (error) {
    console.error('❌ Error leyendo el XML de NOAA:', error.message);
    return [];
  }
}

function extraerCodigoAdvisoryPorNombre(nombre, descripcion) {
  const soloNombre = nombre.split(' ').pop()?.toLowerCase();
  const lines = descripcion.split('\n');

  const line = lines.find(line =>
    soloNombre &&
    line.toLowerCase().includes(soloNombre) &&
    line.includes('MIATCPEP')
  );

  if (line) {
    const match = line.match(/MIATCPEP(\d)/i);
    if (match) {
      const num = match[1];
      return `https://www.nhc.noaa.gov/text/MIATCPEP${num}.shtml`;
    }
  }

  const fallbackMap = {
    barbara: '2',
    cosme: '3'
  };

  if (soloNombre && fallbackMap[soloNombre]) {
    return `https://www.nhc.noaa.gov/text/MIATCPEP${fallbackMap[soloNombre]}.shtml`;
  }

  return null;
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

    const statusMatch = text.match(/(HURRICANE|TROPICAL STORM|TROPICAL DEPRESSION)[\s\.]+([A-Z]+)/i);
    const tipo = statusMatch ? capitalizeWords(statusMatch[1].toLowerCase()) : null;
    const nombre = statusMatch ? capitalizeWords(statusMatch[2].toLowerCase()) : null;

    let titulo = nombreBase;
    if (tipo && nombre && nombreBase.toLowerCase().includes(nombre.toLowerCase())) {
      titulo = `${tipo} ${nombre}`;
    }

    return { lat, lon, distancia, titulo };
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
