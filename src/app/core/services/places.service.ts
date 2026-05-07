import { Injectable, inject } from '@angular/core';
import { Observable, from } from 'rxjs';
import { GoogleMapsService } from './google-maps.service';

export interface TrustBreakdown {
  total:      number;   // 0–100
  grade:      'A' | 'B' | 'C' | 'D';
  rating:     number;   // 0–35  (Bayesian rating)
  volumen:    number;   // 0–35  (review count, log scale)
  perfil:     number;   // 0–20  (profile completeness: phone, web, hours)
  actividad:  number;   // 0–10  (OPERATIONAL status)
}

export interface PlaceResult {
  nombre:      string;
  rating:      number | null;
  ratingCount: number;
  direccion:   string;
  telefono?:   string | null;
  web?:        string | null;
  whatsapp?:   string | null;
  tieneHorario: boolean;
  lat:         number | null;
  lng:         number | null;
  trust:       TrustBreakdown;
}

declare const google: any;

// ── Trust score helpers ─────────────────────────────────────────────────────

/**
 * Bayesian rating: pulls scores toward the mean when review count is low.
 * C = confidence parameter (# reviews at which prior/observed are equally weighted)
 * m = prior mean (average for the industry in Argentina)
 */
function bayesianRating(rating: number, count: number, m = 3.5, C = 50): number {
  return (C * m + count * rating) / (C + count);
}

function scoreRating(rating: number | null, count: number): number {
  if (!rating || !count) return 0;
  const bay = bayesianRating(rating, count);
  // Map [3.5, 5.0] → [0, 35]. Below 3.5 = 0.
  return Math.max(0, Math.round(((bay - 3.5) / 1.5) * 35));
}

function scoreVolumen(count: number): number {
  if (count <= 0)   return 0;
  if (count < 5)    return 5;
  if (count < 20)   return 12;
  if (count < 50)   return 20;
  if (count < 150)  return 27;
  if (count < 400)  return 32;
  return 35;
}

function scorePerfil(hasPhone: boolean, hasWeb: boolean, hasHours: boolean): number {
  return (hasPhone ? 8 : 0) + (hasWeb ? 7 : 0) + (hasHours ? 5 : 0);
}

function scoreActividad(status: string | undefined): number {
  if (!status || status === 'OPERATIONAL') return 10;
  if (status === 'CLOSED_TEMPORARILY')     return 3;
  return 0;
}

function calcTrust(
  rating: number | null,
  count: number,
  hasPhone: boolean,
  hasWeb: boolean,
  hasHours: boolean,
  status: string | undefined,
): TrustBreakdown {
  const r = scoreRating(rating, count);
  const v = scoreVolumen(count);
  const p = scorePerfil(hasPhone, hasWeb, hasHours);
  const a = scoreActividad(status);
  const total = Math.min(100, r + v + p + a);
  const grade: TrustBreakdown['grade'] =
    total >= 75 ? 'A' : total >= 55 ? 'B' : total >= 35 ? 'C' : 'D';
  return { total, grade, rating: r, volumen: v, perfil: p, actividad: a };
}

// ── WhatsApp helper ─────────────────────────────────────────────────────────
// Argentine mobile numbers for WhatsApp need "9" inserted after country code:
// +54 341 123-4567 → wa.me/5493411234567
function toWhatsApp(raw: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  // Already has country code 54
  if (digits.startsWith('54') && digits.length >= 12) {
    const withMobile = digits.startsWith('549') ? digits : `549${digits.slice(2)}`;
    return `https://wa.me/${withMobile}`;
  }
  // Local number (starts with 0)
  const local = digits.startsWith('0') ? digits.slice(1) : digits;
  return `https://wa.me/549${local}`;
}

// ── Service ──────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class PlacesService {
  private gmaps = inject(GoogleMapsService);

  search(query: string, location: string): Observable<PlaceResult[]> {
    return from(this.searchInternal(query, location));
  }

  private async searchInternal(query: string, location: string): Promise<PlaceResult[]> {
    await this.gmaps.load();

    const textQuery = location?.trim()
      ? `${query} ${location.trim()}`
      : `${query} Argentina`;

    try {
      const results = await this.searchNew(textQuery);
      if (results.length > 0) return results;
      return await this.searchLegacy(textQuery);
    } catch {
      return this.searchLegacy(textQuery);
    }
  }

  /** Places API (New) */
  private async searchNew(textQuery: string): Promise<PlaceResult[]> {
    const { places } = await google.maps.places.Place.searchByText({
      textQuery,
      fields: [
        'displayName', 'rating', 'userRatingCount',
        'formattedAddress', 'location',
        'nationalPhoneNumber', 'websiteURI',
        'businessStatus', 'regularOpeningHours',
      ],
      maxResultCount: 10,
    });

    return (places ?? [])
      .filter((p: any) => !p.businessStatus || p.businessStatus !== 'CLOSED_PERMANENTLY')
      .map((p: any) => this.mapNew(p))
      .sort((a: PlaceResult, b: PlaceResult) => b.trust.total - a.trust.total);
  }

  private mapNew(p: any): PlaceResult {
    const hasPhone  = !!p.nationalPhoneNumber;
    const hasWeb    = !!p.websiteURI;
    const hasHours  = !!(p.regularOpeningHours?.periods?.length);
    return {
      nombre:      p.displayName      ?? '',
      rating:      p.rating           ?? null,
      ratingCount: p.userRatingCount  ?? 0,
      direccion:   p.formattedAddress ?? '',
      telefono:    p.nationalPhoneNumber ?? null,
      web:         p.websiteURI       ?? null,
      whatsapp:    toWhatsApp(p.nationalPhoneNumber ?? null),
      tieneHorario: hasHours,
      lat:         p.location?.lat()  ?? null,
      lng:         p.location?.lng()  ?? null,
      trust: calcTrust(p.rating ?? null, p.userRatingCount ?? 0,
                       hasPhone, hasWeb, hasHours, p.businessStatus),
    };
  }

  /** Places API legacy — fallback */
  private searchLegacy(textQuery: string): Promise<PlaceResult[]> {
    return new Promise((resolve) => {
      const svc = new google.maps.places.PlacesService(document.createElement('div'));
      svc.textSearch({ query: textQuery }, (results: any[], status: string) => {
        if (status !== google.maps.places.PlacesServiceStatus.OK) { resolve([]); return; }
        const mapped = (results ?? []).map((p: any) => {
          const hasPhone = !!p.formatted_phone_number;
          const hasWeb   = !!p.website;
          const hasHours = !!(p.opening_hours?.periods?.length);
          return {
            nombre:       p.name              ?? '',
            rating:       p.rating            ?? null,
            ratingCount:  p.user_ratings_total ?? 0,
            direccion:    p.formatted_address  ?? '',
            telefono:     p.formatted_phone_number ?? null,
            web:          p.website           ?? null,
            whatsapp:     toWhatsApp(p.formatted_phone_number ?? null),
            tieneHorario: hasHours,
            lat:          p.geometry?.location?.lat() ?? null,
            lng:          p.geometry?.location?.lng() ?? null,
            trust: calcTrust(p.rating ?? null, p.user_ratings_total ?? 0,
                             hasPhone, hasWeb, hasHours, p.business_status),
          } as PlaceResult;
        });
        resolve(mapped.sort((a, b) => b.trust.total - a.trust.total));
      });
    });
  }
}
