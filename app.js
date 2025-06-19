import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { getCiclones } from './services/noaa.service.js';
import { getRefugios } from './services/airtable.service.js';
import cron from 'node-cron';
import cors from 'cors';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// 🌐 Lista blanca de dominios permitidos
const whitelist = [
  'https://www.lazaro-cardenas.gob.mx',
  'https://lazaro-cardenas.gob.mx',
  'https://dev.lazaro-cardenas.gob.mx'
];

// 🔐 Configuración CORS
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || whitelist.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('No permitido por CORS'));
    }
  }
};

// Aplica CORS solo a las rutas necesarias
app.use('/api', cors(corsOptions));

// Configuración de EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Archivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Variables en caché
let ciclones = [];
let refugios = [];

// Ruta principal (no requiere CORS)
app.get('/', async (req, res) => {
  res.render('index', { ciclones, refugios });
});

// API pública para ciclones (protegida con CORS)
app.get('/api/ciclones', (req, res) => {
  res.json(ciclones);
});

// API pública para refugios (protegida con CORS)
app.get('/api/refugios', (req, res) => {
  res.json(refugios);
});

// Tarea programada cada 15 minutos
cron.schedule('*/15 * * * *', async () => {
  console.log('⏳ Actualizando datos de NOAA y Airtable...');
  try {
    ciclones = await getCiclones();
    // refugios = await getRefugios(); // Descomenta si deseas actualizar también refugios
    console.log(`✅ ${ciclones.length} ciclones cargados.`);
    // console.log(`✅ ${refugios.length} refugios cargados.`);
  } catch (err) {
    console.error('❌ Error al actualizar datos:', err.message);
  }
});

// Carga inicial al arrancar el servidor
(async () => {
  ciclones = await getCiclones();
  refugios = await getRefugios();
})();

// Inicio del servidor
app.listen(PORT, () => {
  console.log(`🌪️ Panel ciclones corriendo en http://localhost:${PORT}`);
});
