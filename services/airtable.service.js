// services/airtable.service.js
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const API_KEY = process.env.AIRTABLE_API_KEY;
const BASE_ID = process.env.AIRTABLE_BASE_ID;
const TABLE_NAME = process.env.AIRTABLE_TABLE_NAME;

const airtableURL = `https://api.airtable.com/v0/${BASE_ID}/${TABLE_NAME}`;

export async function getRefugios() {
  try {
    const { data } = await axios.get(airtableURL, {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
      },
    });
    console.log(`📥 Obteniendo refugios desde Airtable: ${data} registros encontrados`)  ;

    return data.records.map(r => ({
      nombre: r.fields.nombre,
      direccion: r.fields.direccion,
      lat: r.fields.lat,
      lon: r.fields.lon,
      capacidad: r.fields.capacidad_personas,
      estatus: r.fields.estatus
    }));


  } catch (err) {
    console.error("❌ Error obteniendo datos de Airtable:", err.message);
    return [];
  }
}
