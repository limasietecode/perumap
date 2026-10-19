import { normalize } from './util.js';

// final_map.png (4560×6080) is a Web-Mercator render. Pixel position from longitude/latitude:
//   px = AX[0]·λ + AX[1]·y + AX[2]     py = AY[0]·λ + AY[1]·y + AY[2]
// with λ = longitude in radians and y = ln(tan(π/4 + φ/2)).
// Least-squares fit on 6 control points (Putumayo, Punta Balcones, Santa Rosa, Puno, Concordia,
// Paracas); mean error ≈ 30 px. Only used to drop the initial pin — students then drag it.
const AX = [17044.0928, -24.2932, 24589.6997];
const AY = [-31.1762, -16650.9747, 294.7458];

const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

export function lngLatToPixel(lng, lat) {
  const X = rad(lng);
  const Y = Math.log(Math.tan(Math.PI / 4 + rad(lat) / 2));
  return [AX[0] * X + AX[1] * Y + AX[2], AY[0] * X + AY[1] * Y + AY[2]];
}

export function pixelToLngLat(px, py) {
  const det = AX[0] * AY[1] - AX[1] * AY[0];
  const bx = px - AX[2];
  const by = py - AY[2];
  const X = (bx * AY[1] - AX[1] * by) / det;
  const Y = (AX[0] * by - bx * AY[0]) / det;
  return [deg(X), deg(2 * Math.atan(Math.exp(Y)) - Math.PI / 2)];
}

// [city, lat, lng] — first city of each departamento is its capital.
export const DEPARTAMENTOS = [
  ['Amazonas', [['Chachapoyas', -6.2317, -77.869], ['Bagua Grande', -5.7553, -78.4417], ['Bagua', -5.6389, -78.5311]]],
  ['Áncash', [['Huaraz', -9.5278, -77.5278], ['Chimbote', -9.0745, -78.5936], ['Caraz', -9.0486, -77.8106], ['Casma', -9.4747, -78.3044], ['Huarmey', -10.0681, -78.1522]]],
  ['Apurímac', [['Abancay', -13.6339, -72.8814], ['Andahuaylas', -13.6556, -73.3872], ['Chalhuanca', -14.2953, -73.2442]]],
  ['Arequipa', [['Arequipa', -16.3989, -71.535], ['Camaná', -16.6228, -72.7111], ['Mollendo', -17.0231, -72.0147], ['Chivay', -15.6383, -71.6014]]],
  ['Ayacucho', [['Ayacucho', -13.1631, -74.2236], ['Huanta', -12.9397, -74.2475], ['Puquio', -14.6939, -74.1244]]],
  ['Cajamarca', [['Cajamarca', -7.1638, -78.5003], ['Jaén', -5.7083, -78.8083], ['Chota', -6.5614, -78.6497], ['Cutervo', -6.3772, -78.8197]]],
  ['Callao', [['Callao', -12.0566, -77.1181]]],
  ['Cusco', [['Cusco', -13.532, -71.9675], ['Sicuani', -14.2694, -71.2261], ['Quillabamba', -12.8628, -72.6922], ['Urubamba', -13.3047, -72.1158], ['Pisac', -13.4214, -71.8497], ['Ollantaytambo', -13.2583, -72.2633]]],
  ['Huancavelica', [['Huancavelica', -12.7864, -74.9764], ['Lircay', -12.9822, -74.7203], ['Pampas', -12.3956, -74.8667]]],
  ['Huánuco', [['Huánuco', -9.9306, -76.2422], ['Tingo María', -9.295, -75.9978], ['La Unión', -9.8278, -76.8]]],
  ['Ica', [['Ica', -14.0678, -75.7286], ['Pisco', -13.71, -76.2031], ['Nazca', -14.8309, -74.9389], ['Chincha Alta', -13.4099, -76.1323], ['Paracas', -13.834, -76.2508]]],
  ['Junín', [['Huancayo', -12.0651, -75.2049], ['Tarma', -11.4194, -75.69], ['Jauja', -11.775, -75.5], ['La Merced', -11.0583, -75.3283], ['Satipo', -11.2522, -74.6386]]],
  ['La Libertad', [['Trujillo', -8.1116, -79.0288], ['Huamachuco', -7.8122, -78.0489], ['Pacasmayo', -7.4006, -79.5714], ['Huanchaco', -8.0797, -79.1217]]],
  ['Lambayeque', [['Chiclayo', -6.7714, -79.8409], ['Lambayeque', -6.7011, -79.9061], ['Ferreñafe', -6.6389, -79.7889]]],
  ['Lima', [['Lima', -12.0464, -77.0428], ['Huacho', -11.1067, -77.605], ['Huaral', -11.495, -77.2078], ['Barranca', -10.75, -77.7667], ['Cañete', -13.0775, -76.3872], ['Matucana', -11.8447, -76.3864]]],
  ['Loreto', [['Iquitos', -3.7437, -73.2516], ['Yurimaguas', -5.9022, -76.1225], ['Nauta', -4.5083, -73.5833], ['Requena', -5.0631, -73.85], ['Caballococha', -3.9067, -70.5156]]],
  ['Madre de Dios', [['Puerto Maldonado', -12.5933, -69.1892], ['Iberia', -11.41, -69.488], ['Iñapari', -10.9514, -69.5928]]],
  ['Moquegua', [['Moquegua', -17.1958, -70.9353], ['Ilo', -17.6394, -71.3375]]],
  ['Pasco', [['Cerro de Pasco', -10.6864, -76.2622], ['Oxapampa', -10.5772, -75.4053], ['Villa Rica', -10.7386, -75.27]]],
  ['Piura', [['Piura', -5.1945, -80.6328], ['Sullana', -4.9039, -80.6853], ['Talara', -4.5772, -81.2719], ['Paita', -5.0892, -81.1144], ['Máncora', -4.1078, -81.0475], ['Chulucanas', -5.0925, -80.1625]]],
  ['Puno', [['Puno', -15.8402, -70.0219], ['Juliaca', -15.5, -70.1333], ['Ilave', -16.0833, -69.6333], ['Azángaro', -14.9089, -70.1964]]],
  ['San Martín', [['Moyobamba', -6.0342, -76.9717], ['Tarapoto', -6.4875, -76.36], ['Juanjuí', -7.1772, -76.7272], ['Rioja', -6.0597, -77.1681]]],
  ['Tacna', [['Tacna', -18.0066, -70.2463], ['Tarata', -17.4744, -70.0322]]],
  ['Tumbes', [['Tumbes', -3.5669, -80.4515], ['Zorritos', -3.6806, -80.6781], ['Zarumilla', -3.5014, -80.2753]]],
  ['Ucayali', [['Pucallpa', -8.3791, -74.5539], ['Atalaya', -10.7297, -73.755], ['Aguaytía', -9.0381, -75.5097]]],
].map(([name, cities]) => ({ name, cities: cities.map(([c, lat, lng]) => ({ name: c, lat, lng })) }));

export function getDepartamento(name) {
  const n = normalize(name);
  return DEPARTAMENTOS.find((d) => normalize(d.name) === n) || null;
}

/** Known city of a departamento (accent/case-insensitive), or null. */
export function findCity(deptName, cityName) {
  const d = getDepartamento(deptName);
  if (!d || !cityName) return null;
  const n = normalize(cityName);
  return d.cities.find((c) => normalize(c.name) === n) || null;
}
