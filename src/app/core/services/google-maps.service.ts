import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

declare const google: any;

export interface PlaceResult {
  address: string;
  lat: number;
  lng: number;
}

const API_KEY = environment.googleMapsApiKey;

@Injectable({ providedIn: 'root' })
export class GoogleMapsService {
  private loaded = false;
  private loading = false;
  private queue: Array<() => void> = [];

  load(): Promise<void> {
    if (this.loaded) return Promise.resolve();
    return new Promise((resolve) => {
      this.queue.push(resolve);
      if (this.loading) return;
      this.loading = true;
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${API_KEY}&libraries=places&loading=async`;
      script.async = true;
      script.onload = async () => {
        // With loading=async, importLibrary ensures the library is fully initialized
        if ((google.maps as any).importLibrary) {
          await (google.maps as any).importLibrary('places');
        }
        this.loaded = true;
        this.loading = false;
        this.queue.forEach(cb => cb());
        this.queue = [];
      };
      document.head.appendChild(script);
    });
  }

  isReady(): boolean {
    return this.loaded;
  }

  /** Genera link a Google Maps a partir de coordenadas */
  mapsLink(lat: number, lng: number): string {
    return `https://www.google.com/maps?q=${lat},${lng}`;
  }

  /** Genera link a Google Maps a partir de dirección */
  mapsLinkByAddress(address: string): string {
    return `https://www.google.com/maps/search/${encodeURIComponent(address)}`;
  }
}
