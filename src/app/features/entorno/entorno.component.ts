import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DolarService, DolarRate } from '../../core/services/dolar.service';
import { WeatherService, WeatherData, WeatherDay } from '../../core/services/weather.service';

// Buenos Aires as default fallback
const BSAS = { lat: -34.6037, lng: -58.3816 };

@Component({
  selector: 'app-entorno',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './entorno.component.html',
  styleUrl: './entorno.component.scss',
})
export class EntornoComponent implements OnInit {
  private dolarSvc   = inject(DolarService);
  private weatherSvc = inject(WeatherService);

  // Dólar
  tasas        = signal<DolarRate[]>([]);
  dolarLoading = signal(true);
  dolarError   = signal('');
  dolarTs      = signal('');

  // Clima
  ciudadInput  = signal('');
  weather      = signal<WeatherData | null>(null);
  wxLoading    = signal(true);
  wxError      = signal('');

  ngOnInit() {
    this.loadDolar();
    this.loadClimaConGeolocalizacion();
  }

  private loadClimaConGeolocalizacion() {
    this.ciudadInput.set('Buenos Aires');
    this.buscarClima();
  }

  private buscarPorCoords(lat: number, lng: number) {
    this.wxLoading.set(true);
    this.wxError.set('');
    this.weatherSvc.searchByCoords(lat, lng).subscribe({
      next: (data) => {
        this.weather.set(data);
        this.ciudadInput.set(data.ciudad);
        this.wxLoading.set(false);
      },
      error: () => {
        this.wxError.set('No se pudo obtener el clima');
        this.wxLoading.set(false);
      },
    });
  }

  buscarClima() {
    const ciudad = this.ciudadInput().trim();
    if (!ciudad) return;
    this.wxLoading.set(true);
    this.wxError.set('');
    this.weatherSvc.search(ciudad).subscribe({
      next: (data) => {
        this.weather.set(data);
        this.ciudadInput.set(data.ciudad);
        this.wxLoading.set(false);
      },
      error: (err) => {
        this.wxError.set(err?.message ?? 'No se pudo obtener el clima');
        this.wxLoading.set(false);
      },
    });
  }

  loadDolar() {
    this.dolarLoading.set(true);
    this.dolarError.set('');
    this.dolarSvc.getRates().subscribe({
      next: (rates) => {
        this.tasas.set(rates);
        this.dolarLoading.set(false);
        this.dolarTs.set(new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }));
      },
      error: () => {
        this.dolarError.set('No se pudieron cargar las cotizaciones');
        this.dolarLoading.set(false);
      },
    });
  }

  spread(rate: DolarRate): number | null {
    if (rate.compra == null || rate.venta == null) return null;
    return Math.round(((rate.venta - rate.compra) / rate.compra) * 100 * 10) / 10;
  }

  wmoEmoji(code: number): string {
    if (code === 0)   return '☀️';
    if (code <= 3)    return '⛅';
    if (code <= 48)   return '🌫️';
    if (code <= 55)   return '🌦️';
    if (code <= 65)   return '🌧️';
    if (code <= 77)   return '❄️';
    if (code <= 82)   return '🌦️';
    if (code <= 86)   return '🌨️';
    return '⛈️';
  }

  aptaLabel(day: WeatherDay): string {
    if (day.aptaObra === 'si')         return '✓ Apto';
    if (day.aptaObra === 'precaucion') return '⚠ Precaución';
    return '✗ No apto';
  }

  countAptas(): number {
    return this.weather()?.forecast.filter(d => d.aptaObra === 'si').length ?? 0;
  }

  isToday(date: string): boolean {
    return date === new Date().toISOString().slice(0, 10);
  }
}
