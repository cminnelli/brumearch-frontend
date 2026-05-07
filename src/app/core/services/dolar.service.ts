import { Injectable } from '@angular/core';
import { Observable, from } from 'rxjs';

export interface DolarRate {
  casa:               string;
  nombre:             string;
  compra:             number | null;
  venta:              number | null;
  fechaActualizacion: string;
}

// Subset we care about for construction (materials often priced in USD)
const CASAS_RELEVANTES = ['oficial', 'blue', 'bolsa', 'tarjeta', 'mayorista'];

const ALIAS: Record<string, string> = {
  oficial:         'Oficial',
  blue:            'Blue',
  bolsa:           'MEP (Bolsa)',
  contadoconliqui: 'CCL',
  tarjeta:         'Tarjeta',
  mayorista:       'Mayorista',
  cripto:          'Cripto',
};

@Injectable({ providedIn: 'root' })
export class DolarService {

  getRates(): Observable<DolarRate[]> {
    return from(this.fetchRates());
  }

  private async fetchRates(): Promise<DolarRate[]> {
    const res  = await fetch('https://dolarapi.com/v1/dolares');
    if (!res.ok) throw new Error('No se pudieron obtener las cotizaciones');
    const data: DolarRate[] = await res.json();
    return data
      .filter(d => CASAS_RELEVANTES.includes(d.casa))
      .map(d => ({ ...d, nombre: ALIAS[d.casa] ?? d.nombre }))
      .sort((a, b) => CASAS_RELEVANTES.indexOf(a.casa) - CASAS_RELEVANTES.indexOf(b.casa));
  }
}
