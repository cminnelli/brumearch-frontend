import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  AfterViewInit,
  Output,
  SimpleChanges,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { GoogleMapsService } from '../../../core/services/google-maps.service';

export interface MapLocation {
  address: string;
  lat: number;
  lng: number;
}

declare const google: any;

@Component({
  selector: 'app-map-picker',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './map-picker.component.html',
  styleUrl: './map-picker.component.scss',
})
export class MapPickerComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('addrInput') addrInput!: ElementRef<HTMLInputElement>;

  /** Valor inicial (para modo edición) */
  @Input() value: MapLocation | null = null;
  /** Restricción de país, default Argentina */
  @Input() country = 'ar';

  @Output() valueChange = new EventEmitter<MapLocation | null>();

  private gmaps = inject(GoogleMapsService);

  location = signal<MapLocation | null>(null);

  private autocomplete: any;
  private placeListener: any;

  async ngAfterViewInit() {
    await this.gmaps.load();
    this.initAutocomplete();
    if (this.location()) {
      this.addrInput.nativeElement.value = this.location()!.address;
    }
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['value'] && changes['value'].currentValue) {
      this.location.set(changes['value'].currentValue);
      if (this.addrInput) {
        this.addrInput.nativeElement.value = changes['value'].currentValue.address;
      }
    }
  }

  private initAutocomplete() {
    if (!this.addrInput?.nativeElement) return;
    this.autocomplete = new google.maps.places.Autocomplete(
      this.addrInput.nativeElement,
      {
        fields: ['formatted_address', 'geometry'],
        componentRestrictions: { country: this.country },
        types: ['geocode', 'establishment'],
      }
    );
    this.placeListener = this.autocomplete.addListener('place_changed', () => {
      const place = this.autocomplete.getPlace();
      if (!place?.geometry?.location) return;
      const loc: MapLocation = {
        address: place.formatted_address,
        lat: place.geometry.location.lat(),
        lng: place.geometry.location.lng(),
      };
      this.location.set(loc);
      this.valueChange.emit(loc);
    });
  }

  clear() {
    this.location.set(null);
    if (this.addrInput) this.addrInput.nativeElement.value = '';
    this.valueChange.emit(null);
  }

  mapsLink(): string {
    const loc = this.location();
    if (!loc) return '#';
    return this.gmaps.mapsLink(loc.lat, loc.lng);
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
