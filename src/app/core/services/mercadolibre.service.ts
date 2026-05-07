import { Injectable } from '@angular/core';
import { Observable, from } from 'rxjs';

export interface MlListing {
  id:        string;
  nombre:    string;
  precio?:   number | null;
  web?:      string | null;
  telefono?: string | null;
  direccion: string;
  ciudad:    string;
  lat?:      number | null;
  lng?:      number | null;
}

const ML_BASE = 'https://api.mercadolibre.com';

@Injectable({ providedIn: 'root' })
export class MercadoLibreService {

  search(query: string, location: string): Observable<MlListing[]> {
    return from(this.fetchListings(query, location));
  }

  private async fetchListings(query: string, location: string): Promise<MlListing[]> {
    const q = encodeURIComponent(`${query} ${location || 'Argentina'}`);
    const url = `${ML_BASE}/sites/MLA/search?q=${q}&limit=8&category=MS1000`;

    const res  = await fetch(url);
    if (!res.ok) return [];
    const body = await res.json();

    return (body.results ?? []).map((item: any) => this.mapItem(item));
  }

  private mapItem(item: any): MlListing {
    const address = item.seller_address;
    const ciudad  = [address?.city?.name, address?.state?.name]
      .filter(Boolean).join(', ');

    return {
      id:        item.id,
      nombre:    item.title,
      precio:    item.price ?? null,
      web:       item.permalink ?? null,
      telefono:  null,
      direccion: ciudad,
      ciudad,
      lat:       item.seller?.geo_information?.city_lat  ?? null,
      lng:       item.seller?.geo_information?.city_lon  ?? null,
    };
  }
}
