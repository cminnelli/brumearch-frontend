import {
  Component,
  ElementRef,
  EventEmitter,
  OnDestroy,
  AfterViewInit,
  Output,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { GoogleMapsService } from '../../../core/services/google-maps.service';

export interface ParsedAddress {
  address: string;
  street: string;
  neighborhood: string;
  city: string;
  province: string;
  country: string;
  lat: number;
  lng: number;
}

declare const google: any;

@Component({
  selector: 'app-address-search',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="addr-search">
      <div class="addr-search__input-wrap">
        <input
          #addrInput
          class="addr-search__input"
          type="text"
          placeholder="Buscar dirección..."
          [class.addr-search__input--has-value]="result()"
        />
        @if (result()) {
          <button class="addr-search__clear" type="button" (click)="clear()">×</button>
        }
      </div>
      @if (result()) {
        <div class="addr-search__result">
          <span class="addr-search__result-text">{{ result()!.address }}</span>
        </div>
      }
    </div>
  `,
  styles: [`
    .addr-search {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
      font-family: var(--font);
    }

    .addr-search__input-wrap {
      position: relative;
      display: flex;
      align-items: center;
    }

    .addr-search__input {
      width: 100%;
      padding: 0.55rem 2.2rem 0.55rem 0.75rem;
      border: 1px solid var(--c-border);
      border-radius: var(--radius-sm);
      font-size: var(--text-base);
      font-family: var(--font);
      color: var(--c-text);
      background: var(--c-bg);
      transition: border-color 0.15s;
      outline: none;
      box-sizing: border-box;

      &:focus { border-color: var(--c-text); }
      &::placeholder { color: var(--c-text-muted); }
    }

    .addr-search__clear {
      position: absolute;
      right: 0.5rem;
      background: none;
      border: none;
      cursor: pointer;
      font-size: 1.1rem;
      color: var(--c-text-muted);
      padding: 0.1rem 0.3rem;
      line-height: 1;
      border-radius: var(--radius-sm);
      transition: color 0.15s;

      &:hover { color: var(--c-text); }
    }

    .addr-search__result {
      padding: 0.3rem 0.5rem;
      background: var(--c-surface);
      border: 1px solid var(--c-border);
      border-radius: var(--radius-sm);
    }

    .addr-search__result-text {
      font-size: var(--text-sm);
      color: var(--c-text-sub);
    }
  `],
})
export class AddressSearchComponent implements AfterViewInit, OnDestroy {
  @ViewChild('addrInput') addrInput!: ElementRef<HTMLInputElement>;

  @Output() addressSelected = new EventEmitter<ParsedAddress | null>();

  private gmaps = inject(GoogleMapsService);

  result = signal<ParsedAddress | null>(null);

  private autocomplete: any;
  private placeListener: any;

  async ngAfterViewInit() {
    await this.gmaps.load();
    this.initAutocomplete();
  }

  private initAutocomplete() {
    if (!this.addrInput?.nativeElement) return;
    this.autocomplete = new google.maps.places.Autocomplete(
      this.addrInput.nativeElement,
      {
        fields: ['formatted_address', 'geometry', 'address_components'],
        types: ['geocode', 'establishment'],
      }
    );
    this.placeListener = this.autocomplete.addListener('place_changed', () => {
      const place = this.autocomplete.getPlace();
      if (!place?.geometry?.location) return;
      const parsed = this.parsePlace(place);
      this.result.set(parsed);
      this.addressSelected.emit(parsed);
    });
  }

  private parsePlace(place: any): ParsedAddress {
    const components: any[] = place.address_components ?? [];

    const get = (...types: string[]): string => {
      for (const type of types) {
        const c = components.find((ac: any) => ac.types.includes(type));
        if (c) return c.long_name;
      }
      return '';
    };

    const streetNumber = get('street_number');
    const route = get('route');
    const street = route && streetNumber ? `${route} ${streetNumber}` : route || streetNumber;

    const neighborhood =
      get('sublocality_level_1') ||
      get('neighborhood') ||
      get('sublocality');

    const city =
      get('locality') ||
      get('administrative_area_level_2');

    const province = get('administrative_area_level_1');
    const country = get('country');

    return {
      address: place.formatted_address ?? '',
      street,
      neighborhood,
      city,
      province,
      country,
      lat: place.geometry.location.lat(),
      lng: place.geometry.location.lng(),
    };
  }

  clear() {
    this.result.set(null);
    if (this.addrInput) this.addrInput.nativeElement.value = '';
    this.addressSelected.emit(null);
  }

  ngOnDestroy() {
    if (this.placeListener) {
      google.maps.event.removeListener(this.placeListener);
    }
    if (this.autocomplete) {
      google.maps.event.clearInstanceListeners(this.autocomplete);
    }
  }
}
