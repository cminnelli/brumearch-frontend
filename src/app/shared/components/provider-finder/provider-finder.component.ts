import { Component, EventEmitter, Input, Output, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PlacesService, PlaceResult } from '../../../core/services/places.service';
import { Rubro, Subrubro } from '../../../core/services/config.service';

export interface ProviderImport {
  nombre:      string;
  telefono?:   string;
  web?:        string;
  zona?:       { address: string; lat: number; lng: number };
  subrubroId?: string;
}

@Component({
  selector: 'app-provider-finder',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './provider-finder.component.html',
  styleUrl: './provider-finder.component.scss',
})
export class ProviderFinderComponent {
  @Input() rubros:    Rubro[]    = [];
  @Input() subrubros: Subrubro[] = [];

  @Output() importar = new EventEmitter<ProviderImport>();
  @Output() cerrar   = new EventEmitter<void>();

  private places = inject(PlacesService);

  rubroId    = signal('');
  subrubroId = signal('');
  location   = signal('');
  loading    = signal(false);
  resultados = signal<PlaceResult[]>([]);
  error      = signal('');
  buscado    = signal(false);

  subrubrosDe = computed(() =>
    this.subrubros.filter(s => s.rubroId?._id === this.rubroId())
  );

  rubroNombreSeleccionado = computed(() =>
    this.rubros.find(r => r._id === this.rubroId())?.nombre ?? ''
  );

  subrubroNombreSeleccionado = computed(() =>
    this.subrubros.find(s => s._id === this.subrubroId())?.nombre ?? ''
  );

  get queryLabel(): string {
    return this.subrubroNombreSeleccionado() || this.rubroNombreSeleccionado();
  }

  get canSearch(): boolean {
    return !!this.rubroId() && !this.loading();
  }

  selectRubro(id: string) {
    this.rubroId.set(id);
    this.subrubroId.set('');
    this.resultados.set([]);
    this.buscado.set(false);
    this.error.set('');
  }

  selectSubrubro(id: string) {
    this.subrubroId.set(this.subrubroId() === id ? '' : id);
    this.resultados.set([]);
    this.buscado.set(false);
  }

  buscar() {
    if (!this.canSearch) return;
    this.loading.set(true);
    this.error.set('');
    this.resultados.set([]);
    this.buscado.set(false);

    this.places.search(this.queryLabel, this.location()).subscribe({
      next: (data) => {
        this.resultados.set(data);
        this.buscado.set(true);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Error al buscar. Intentá de nuevo.');
        this.loading.set(false);
        this.buscado.set(true);
      },
    });
  }

  agregar(p: PlaceResult) {
    const payload: ProviderImport = {
      nombre:     p.nombre,
      telefono:   p.telefono ?? undefined,
      web:        p.web      ?? undefined,
      subrubroId: this.subrubroId() || undefined,
    };
    if (p.lat != null && p.lng != null) {
      payload.zona = { address: p.direccion, lat: p.lat, lng: p.lng };
    }
    this.importar.emit(payload);
  }

  trustLabel(grade: string): string {
    const map: Record<string, string> = { A: 'Muy confiable', B: 'Confiable', C: 'Regular', D: 'Pocos datos' };
    return map[grade] ?? '';
  }

  renderStars(rating: number | null): { filled: boolean }[] {
    if (!rating) return [];
    const rounded = Math.round(rating);
    return Array.from({ length: 5 }, (_, i) => ({ filled: i < rounded }));
  }
}
