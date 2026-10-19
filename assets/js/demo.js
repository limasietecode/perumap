import { DEPARTAMENTOS, lngLatToPixel } from './geo.js';
import { placeholderImage } from './images.js';
import { CONFIG } from './config.js';
import { mulberry32 } from './util.js';

// Sample data so the map can be previewed with a full class (40 students, 10 groups).
// Not saved anywhere; disable with CONFIG.demoData = false or ?demo=0.

const FIRST = ['Ana', 'Luis', 'María', 'José', 'Lucía', 'Diego', 'Camila', 'Jorge', 'Valeria', 'Andrés', 'Sofía', 'Carlos', 'Daniela', 'Renzo', 'Fernanda', 'Mateo', 'Paola', 'Sebastián', 'Alejandra', 'Gonzalo', 'Ximena', 'Rodrigo', 'Mariana', 'Bruno', 'Claudia', 'Piero', 'Gabriela', 'Hugo', 'Andrea', 'Álvaro', 'Rosa', 'Iván', 'Natalia', 'César', 'Elena', 'Franco', 'Milagros', 'Raúl', 'Inés', 'Tomás'];
const LAST = ['Quispe', 'Mamani', 'García', 'Flores', 'Rojas', 'Huamán', 'Torres', 'Vargas', 'Castillo', 'Chávez', 'Ramos', 'Mendoza', 'Salazar', 'Paredes', 'Gutiérrez', 'Ccori', 'Condori', 'Ríos', 'Vega', 'Silva'];

const ARTEFACTOS = ['Atrapanieblas', 'Módulo de sombra', 'Pabellón de totora', 'Secadero solar', 'Torre de agua', 'Refugio de altura', 'Estructura de bambú', 'Mirador plegable', 'Cubierta captadora', 'Muro trombe'];
const UNIDADES = ['Vivienda productiva', 'Casa patio', 'Vivienda de adobe reforzado', 'Vivienda palafítica', 'Taller comunal', 'Casa en el talud', 'Vivienda bioclimática', 'Escuela rural', 'Casa de quincha', 'Casa del pescador', 'Centro de acopio', 'Vivienda en pendiente', 'Comedor popular', 'Biblioteca de barrio', 'Albergue andino', 'Mercado itinerante'];

const COSTA = ['Tumbes', 'Piura', 'Lambayeque', 'La Libertad', 'Lima', 'Callao', 'Ica', 'Moquegua', 'Tacna'];
const SELVA = ['Loreto', 'Ucayali', 'Madre de Dios', 'San Martín', 'Amazonas'];
const TAGS = {
  costa: ['costa', 'desierto', 'clima árido', 'neblina', 'sismo', 'quincha', 'borde marino', 'arena'],
  sierra: ['sierra', 'altura', 'heladas', 'piedra', 'adobe', 'pendiente', 'agricultura', 'tapial'],
  selva: ['selva', 'lluvias', 'inundación', 'madera', 'bambú', 'humedad', 'río', 'palafito'],
};
const DESCRIPTIONS = {
  costa: ['Responde a la escasez de lluvia con muros gruesos y patios de sombra.', 'Capta la neblina costera y la convierte en agua para huertos.', 'Estructura liviana y antisísmica frente al viento del mar.'],
  sierra: ['Aprovecha la radiación solar del día para enfrentar las heladas nocturnas.', 'Se escalona sobre la pendiente siguiendo los andenes existentes.', 'Recupera técnicas locales de piedra y adobe con refuerzos.'],
  selva: ['Se eleva sobre pilotes para convivir con la crecida del río.', 'Cubierta ventilada de gran alero frente a lluvias intensas.', 'Usa madera y bambú locales en un sistema modular.'],
};

const ACCENT = { artefacto: '#d9480f', unidad: '#1f5fbf' };

export function makeDemoProjects() {
  const r = mulberry32(2026);
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const students = FIRST.map((f, i) => `${f} ${LAST[(i * 7) % LAST.length]}`);
  const { width: W, height: H } = CONFIG.map;
  const projects = [];

  const make = (type, idx, names) => {
    const dept = pick(DEPARTAMENTOS);
    const city = pick(dept.cities);
    const region = COSTA.includes(dept.name) ? 'costa' : SELVA.includes(dept.name) ? 'selva' : 'sierra';
    const [px, py] = lngLatToPixel(city.lng, city.lat);
    const jx = (r() - 0.5) * 70;
    const jy = (r() - 0.5) * 70;
    const tags = [...new Set([region, pick(TAGS[region]), pick(TAGS[region]), pick(TAGS[region])])];
    const nImg = 3 + Math.floor(r() * 2);
    const seed = projects.length + 1;
    const images = Array.from({ length: nImg }, (_, i) => {
      const url = placeholderImage(seed, i, ACCENT[type]);
      return { id: `demo-${seed}-${i}`, w: 800, h: 600, url, thumb: url };
    });
    const day = new Date(Date.UTC(2026, 8, 1 + Math.floor(r() * 45)));
    projects.push({
      id: `demo-${seed}`,
      demo: true,
      type,
      title: `${type === 'artefacto' ? ARTEFACTOS[idx % ARTEFACTOS.length] : UNIDADES[idx % UNIDADES.length]} en ${city.name}`,
      students: names,
      departamento: dept.name,
      ciudad: city.name,
      x: Math.min(1, Math.max(0, (px + jx) / W)),
      y: Math.min(1, Math.max(0, (py + jy) / H)),
      description: pick(DESCRIPTIONS[region]),
      tags,
      images,
      created_at: day.toISOString(),
      updated_at: day.toISOString(),
    });
  };

  for (let g = 0; g < 10; g++) make('artefacto', g, students.slice(g * 4, g * 4 + 4));
  students.forEach((name, i) => make('unidad', i, [name]));
  return projects;
}
