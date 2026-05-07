import { Injectable } from '@angular/core';
import { Observable, from } from 'rxjs';

export interface WeatherCurrent {
  temp:          number;
  precipitation: number;
  windSpeed:     number;
  code:          number;
  description:   string;
  isDay:         boolean;
}

export interface WeatherDay {
  date:              string;        // ISO
  label:             string;        // 'Lun 14'
  tempMax:           number;
  tempMin:           number;
  precipitation:     number;        // mm
  precipHours:       number;        // hours of rain
  windMax:           number;        // km/h
  code:              number;
  description:       string;
  aptaObra:          'si' | 'precaucion' | 'no';
  aptaObraRazon?:    string;
}

export interface WeatherData {
  ciudad:   string;
  lat:      number;
  lng:      number;
  current:  WeatherCurrent;
  forecast: WeatherDay[];
}

// WMO weather codes → human description
const WMO: Record<number, string> = {
  0: 'Despejado', 1: 'Mayormente despejado', 2: 'Parcialmente nublado', 3: 'Nublado',
  45: 'Niebla', 48: 'Niebla con escarcha',
  51: 'Llovizna leve', 53: 'Llovizna moderada', 55: 'Llovizna intensa',
  61: 'Lluvia leve', 63: 'Lluvia moderada', 65: 'Lluvia intensa',
  71: 'Nieve leve', 73: 'Nieve moderada', 75: 'Nieve intensa',
  77: 'Granizo', 80: 'Chaparrones leves', 81: 'Chaparrones', 82: 'Chaparrones fuertes',
  85: 'Nevadas leves', 86: 'Nevadas intensas',
  95: 'Tormenta eléctrica', 96: 'Tormenta con granizo', 99: 'Tormenta fuerte con granizo',
};

function wmoDesc(code: number): string {
  return WMO[code] ?? 'Condición desconocida';
}

function evaluarDia(day: WeatherDay): { aptaObra: WeatherDay['aptaObra']; razon?: string } {
  if ([95, 96, 99].includes(day.code))         return { aptaObra: 'no', razon: 'Tormenta eléctrica' };
  if (day.precipitation > 5)                   return { aptaObra: 'no', razon: `Lluvia: ${day.precipitation}mm` };
  if (day.windMax > 60)                         return { aptaObra: 'no', razon: `Viento fuerte: ${day.windMax}km/h` };
  if (day.tempMax > 40)                         return { aptaObra: 'no', razon: `Calor extremo: ${day.tempMax}°C` };
  if (day.tempMin < 2)                          return { aptaObra: 'no', razon: `Helada: ${day.tempMin}°C` };
  if (day.precipitation > 1 || day.precipHours > 1) return { aptaObra: 'precaucion', razon: `Posible lluvia (${day.precipitation}mm)` };
  if (day.windMax > 40)                         return { aptaObra: 'precaucion', razon: `Viento moderado: ${day.windMax}km/h` };
  if (day.tempMax > 35)                         return { aptaObra: 'precaucion', razon: `Calor intenso: ${day.tempMax}°C` };
  return { aptaObra: 'si' };
}

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function labelFecha(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  return `${DIAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]}`;
}

@Injectable({ providedIn: 'root' })
export class WeatherService {

  search(ciudad: string): Observable<WeatherData> {
    return from(this.fetchWeather(ciudad));
  }

  searchByCoords(lat: number, lng: number): Observable<WeatherData> {
    return from(this.fetchByCoords(lat, lng));
  }

  private async fetchByCoords(lat: number, lng: number): Promise<WeatherData> {
    // Reverse geocode via Open-Meteo
    const geoRes  = await fetch(
      `https://geocoding-api.open-meteo.com/v1/reverse?latitude=${lat}&longitude=${lng}&language=es`
    );
    const geoBody = await geoRes.json();
    const place   = geoBody.results?.[0];
    const ciudad  = place ? `${place.name}, ${place.country}` : `${lat.toFixed(2)}, ${lng.toFixed(2)}`;
    return this.buildForecast(lat, lng, ciudad);
  }

  private async fetchWeather(ciudad: string): Promise<WeatherData> {
    // 1. Geocoding via Open-Meteo (free, no key)
    const geoRes = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(ciudad)}&count=1&language=es`
    );
    const geoBody = await geoRes.json();
    const place   = geoBody.results?.[0];
    if (!place) throw new Error(`Ciudad "${ciudad}" no encontrada`);

    const { latitude: lat, longitude: lng, name, country } = place;
    return this.buildForecast(lat, lng, `${name}, ${country}`);
  }

  private async buildForecast(lat: number, lng: number, ciudad: string): Promise<WeatherData> {
    const params = new URLSearchParams({
      latitude:  String(lat),
      longitude: String(lng),
      current:   'temperature_2m,precipitation,wind_speed_10m,weather_code,is_day',
      daily:     'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_hours,wind_speed_10m_max',
      timezone:  'America/Argentina/Buenos_Aires',
      forecast_days: '10',
    });
    const wxRes  = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
    const wx     = await wxRes.json();

    const cur = wx.current;
    const d   = wx.daily;

    const current: WeatherCurrent = {
      temp:          cur.temperature_2m,
      precipitation: cur.precipitation,
      windSpeed:     cur.wind_speed_10m,
      code:          cur.weather_code,
      description:   wmoDesc(cur.weather_code),
      isDay:         cur.is_day === 1,
    };

    const forecast: WeatherDay[] = (d.time as string[]).map((date, i) => {
      const day: WeatherDay = {
        date,
        label:         labelFecha(date),
        tempMax:       d.temperature_2m_max[i],
        tempMin:       d.temperature_2m_min[i],
        precipitation: d.precipitation_sum[i],
        precipHours:   d.precipitation_hours[i],
        windMax:       d.wind_speed_10m_max[i],
        code:          d.weather_code[i],
        description:   wmoDesc(d.weather_code[i]),
        aptaObra:      'si',
      };
      const eval_ = evaluarDia(day);
      day.aptaObra      = eval_.aptaObra;
      day.aptaObraRazon = eval_.razon;
      return day;
    });

    return { ciudad, lat, lng, current, forecast };
  }
}
