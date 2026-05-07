import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { PlacesService, PlaceResult } from './places.service';
import { MercadoLibreService, MlListing } from './mercadolibre.service';

export type ProviderSource = 'google' | 'mercadolibre';

export interface ProviderCandidate {
  fuente:       ProviderSource;
  nombre:       string;
  rating:       number | null;
  ratingCount:  number;
  descripcion?: string;
  direccion:    string;
  telefono?:    string | null;
  web?:         string | null;
  lat?:         number | null;
  lng?:         number | null;
  precioDesde?: number | null;
}

@Injectable({ providedIn: 'root' })
export class ProviderSearchService {
  private places = inject(PlacesService);
  private ml     = inject(MercadoLibreService);

  search(query: string, location: string): Observable<ProviderCandidate[]> {
    const google$  = this.places.search(query, location).pipe(
      map(list => list.map(p => this.fromGoogle(p))),
      catchError(() => of([] as ProviderCandidate[])),
    );

    const ml$ = this.ml.search(query, location).pipe(
      map(list => list.map(l => this.fromMl(l))),
      catchError(() => of([] as ProviderCandidate[])),
    );

    return forkJoin([google$, ml$]).pipe(
      map(([googleResults, mlResults]) => this.merge(googleResults, mlResults)),
    );
  }

  private fromGoogle(p: PlaceResult): ProviderCandidate {
    return {
      fuente:      'google',
      nombre:      p.nombre,
      rating:      p.rating,
      ratingCount: p.ratingCount,
      direccion:   p.direccion,
      telefono:    p.telefono,
      web:         p.web,
      lat:         p.lat,
      lng:         p.lng,
    };
  }

  private fromMl(l: MlListing): ProviderCandidate {
    return {
      fuente:      'mercadolibre',
      nombre:      l.nombre,
      rating:      null,
      ratingCount: 0,
      direccion:   l.direccion,
      telefono:    l.telefono,
      web:         l.web,
      lat:         l.lat,
      lng:         l.lng,
      precioDesde: l.precio,
    };
  }

  /** Google results first (sorted by rating), then ML results */
  private merge(
    google: ProviderCandidate[],
    ml:     ProviderCandidate[],
  ): ProviderCandidate[] {
    const sortedGoogle = google.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    return [...sortedGoogle, ...ml];
  }
}
