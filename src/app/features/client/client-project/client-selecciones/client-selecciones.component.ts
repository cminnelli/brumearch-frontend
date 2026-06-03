import { Component, Input, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SeleccionService } from '../../../../core/services/seleccion.service';
import {
  Seleccion,
  EstadoSeleccion,
  ESTADO_SELECCION_LABELS,
  ESTADO_SELECCION_NEXT,
} from '../../../../shared/models/seleccion.model';

@Component({
  selector: 'app-client-selecciones',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './client-selecciones.component.html',
  styleUrl: './client-selecciones.component.scss',
})
export class ClientSeleccionesComponent implements OnInit {
  @Input({ required: true }) projectId!: string;

  private svc = inject(SeleccionService);

  items   = signal<Seleccion[]>([]);
  loading = signal(true);

  editingNotasId = signal<string | null>(null);
  editingNotas   = signal('');

  readonly ESTADO_LABELS = ESTADO_SELECCION_LABELS;

  // Grouped by rubro → subrubro
  rubroGroups = computed(() => {
    const map = new Map<string, { rubroNombre: string; subrubroGroups: Map<string, { subrubroNombre: string; items: Seleccion[] }> }>();
    for (const s of this.items()) {
      const rId  = s.itemId?.subrubroId?.rubroId?._id   ?? 'otros';
      const rNom = s.itemId?.subrubroId?.rubroId?.nombre ?? 'Otros';
      const sId  = s.itemId?.subrubroId?._id   ?? 'otros';
      const sNom = s.itemId?.subrubroId?.nombre ?? 'Otros';
      if (!map.has(rId)) map.set(rId, { rubroNombre: rNom, subrubroGroups: new Map() });
      const rGroup = map.get(rId)!;
      if (!rGroup.subrubroGroups.has(sId)) rGroup.subrubroGroups.set(sId, { subrubroNombre: sNom, items: [] });
      rGroup.subrubroGroups.get(sId)!.items.push(s);
    }
    return Array.from(map.entries()).map(([rId, g]) => ({
      rubroId: rId,
      rubroNombre: g.rubroNombre,
      subrubroGroups: Array.from(g.subrubroGroups.entries()).map(([sId, sg]) => ({
        subrubroId: sId,
        subrubroNombre: sg.subrubroNombre,
        items: sg.items,
      })),
    }));
  });

  total     = computed(() => this.items().length);
  comprados = computed(() => this.items().filter(i => i.estadoCliente === 'comprado').length);
  progreso  = computed(() => {
    const t = this.total();
    return t ? Math.round(this.comprados() / t * 100) : 0;
  });

  ngOnInit() {
    this.svc.listCliente(this.projectId).subscribe({
      next: data => { this.items.set(data); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  ciclarEstado(item: Seleccion) {
    const siguiente = ESTADO_SELECCION_NEXT[item.estadoCliente];
    this.items.update(list =>
      list.map(i => i._id === item._id ? { ...i, estadoCliente: siguiente } : i)
    );
    this.svc.updateEstado(this.projectId, item._id, siguiente, item.notasCliente).subscribe({
      next: updated => {
        this.items.update(list => list.map(i => i._id === updated._id ? updated : i));
      },
      error: () => {
        this.items.update(list =>
          list.map(i => i._id === item._id ? { ...i, estadoCliente: item.estadoCliente } : i)
        );
      },
    });
  }

  startEditNotas(item: Seleccion) {
    this.editingNotasId.set(item._id);
    this.editingNotas.set(item.notasCliente ?? '');
  }

  commitNotas(item: Seleccion) {
    if (this.editingNotasId() !== item._id) return;
    const notas = this.editingNotas().trim() || undefined;
    this.items.update(list =>
      list.map(i => i._id === item._id ? { ...i, notasCliente: notas } : i)
    );
    this.svc.updateEstado(this.projectId, item._id, item.estadoCliente, notas).subscribe();
    this.editingNotasId.set(null);
  }

  cancelNotas() { this.editingNotasId.set(null); }

  estadoClass(estado: EstadoSeleccion) { return `estado-chip--${estado}`; }

  unidadEfectiva(s: Seleccion): string {
    return s.unidad || s.itemId?.unidad || '';
  }
}
