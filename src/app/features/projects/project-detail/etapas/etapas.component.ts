import { Component, Input, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ConfigService, EtapaPlantilla } from '../../../../core/services/config.service';
import { environment } from '../../../../../environments/environment';

type EstadoEtapa = 'pendiente' | 'activa' | 'completada';

interface ProyectoEtapa {
  _id?: string;
  etapaId: EtapaPlantilla;
  orden: number;
  nombre: string;
  estado: EstadoEtapa;
  fechaInicio?: string | null;
  duracion?:    number | null;
}

const ESTADO_NEXT: Record<EstadoEtapa, EstadoEtapa> = {
  pendiente:   'activa',
  activa:      'completada',
  completada:  'pendiente',
};

@Component({
  selector: 'app-etapas',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './etapas.component.html',
  styleUrl: './etapas.component.scss',
})
export class EtapasComponent implements OnInit {
  @Input({ required: true }) projectId!: string;

  private http      = inject(HttpClient);
  private configSvc = inject(ConfigService);

  plantillas  = signal<EtapaPlantilla[]>([]);
  assigned    = signal<ProyectoEtapa[]>([]);
  loading     = signal(true);
  saving      = signal(false);
  dirty       = signal(false);

  catalogOpen   = signal(false);

  editingId     = signal<string | null>(null);
  editingNombre = signal('');

  dragIndex     = signal<number | null>(null);
  dragOverIndex = signal<number | null>(null);

  completadas  = computed(() => this.assigned().filter(a => a.estado === 'completada').length);
  completedPct = computed(() => {
    const total = this.assigned().length;
    return total ? Math.round(this.completadas() / total * 100) : 0;
  });

  private base = environment.apiUrl;

  ngOnInit() {
    this.configSvc.getEtapas().subscribe(data => {
      this.plantillas.set(data);
      this.loadAssigned();
    });
  }

  loadAssigned() {
    this.http.get<any[]>(`${this.base}/projects/${this.projectId}/etapas`).subscribe({
      next: data => {
        this.assigned.set(data.map(d => ({
          ...d,
          nombre:      d.nombre || d.etapaId.nombre,
          estado:      (d.estado as EstadoEtapa) || 'pendiente',
          fechaInicio: d.fechaInicio ? new Date(d.fechaInicio).toISOString().split('T')[0] : null,
          duracion:    d.duracion ?? null,
        })));
        if (data.length === 0) this.catalogOpen.set(true);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  usageCount(plantillaId: string): number {
    return this.assigned().filter(a => a.etapaId._id === plantillaId).length;
  }

  add(plantilla: EtapaPlantilla) {
    const count = this.usageCount(plantilla._id);
    const nombre = count > 0 ? `${plantilla.nombre} (${count + 1})` : plantilla.nombre;
    const tempId = crypto.randomUUID();
    const maxOrden = this.assigned().reduce((m, a) => Math.max(m, a.orden), 0);
    this.assigned.update(list => [
      ...list,
      { _id: tempId, etapaId: plantilla, orden: maxOrden + 1, nombre, estado: 'pendiente' },
    ]);
    this.dirty.set(true);
  }

  remove(id: string) {
    this.assigned.update(list => list.filter(a => a._id !== id));
    this.reorder();
    this.dirty.set(true);
  }

  cycleEstado(id: string) {
    this.assigned.update(list =>
      list.map(a => a._id !== id ? a : { ...a, estado: ESTADO_NEXT[a.estado] })
    );
    this.dirty.set(true);
  }

  private reorder() {
    this.assigned.update(list => list.map((a, i) => ({ ...a, orden: i + 1 })));
  }

  startEditNombre(a: ProyectoEtapa) {
    this.editingId.set(a._id!);
    this.editingNombre.set(a.nombre);
  }

  commitEditNombre(a: ProyectoEtapa) {
    if (this.editingId() !== a._id) return;
    const nombre = this.editingNombre().trim() || a.etapaId.nombre;
    this.assigned.update(list => list.map(x => x._id === a._id ? { ...x, nombre } : x));
    this.editingId.set(null);
    this.dirty.set(true);
  }

  cancelEditNombre() { this.editingId.set(null); }

  updateEtapaField(id: string, field: 'fechaInicio' | 'duracion', value: any) {
    this.assigned.update(list => {
      const updated = list.map(a => a._id !== id ? a : { ...a, [field]: value || null });
      return this.propagateDates(updated);
    });
    this.dirty.set(true);
  }

  private propagateDates(list: ProyectoEtapa[]): ProyectoEtapa[] {
    const sorted = [...list].sort((a, b) => a.orden - b.orden);
    for (let i = 0; i < sorted.length - 1; i++) {
      const cur = sorted[i];
      if (cur.fechaInicio && cur.duracion) {
        const d = new Date(cur.fechaInicio);
        d.setDate(d.getDate() + cur.duracion * 7);
        sorted[i + 1] = { ...sorted[i + 1], fechaInicio: d.toISOString().split('T')[0] };
      }
    }
    return sorted;
  }

  fechaFin(a: ProyectoEtapa): string | null {
    if (!a.fechaInicio || !a.duracion) return null;
    const d = new Date(a.fechaInicio);
    d.setDate(d.getDate() + a.duracion * 7);
    return d.toISOString().split('T')[0];
  }

  onDragStart(index: number) { this.dragIndex.set(index); }

  onDragOver(event: DragEvent, index: number) {
    event.preventDefault();
    this.dragOverIndex.set(index);
  }

  onDrop(event: DragEvent, targetIndex: number) {
    event.preventDefault();
    const fromIndex = this.dragIndex();
    if (fromIndex === null || fromIndex === targetIndex) {
      this.dragIndex.set(null);
      this.dragOverIndex.set(null);
      return;
    }
    this.assigned.update(list => {
      const result = [...list];
      const [moved] = result.splice(fromIndex, 1);
      result.splice(targetIndex, 0, moved);
      return result.map((a, i) => ({ ...a, orden: i + 1 }));
    });
    this.dragIndex.set(null);
    this.dragOverIndex.set(null);
    this.dirty.set(true);
  }

  onDragEnd() {
    this.dragIndex.set(null);
    this.dragOverIndex.set(null);
  }

  save() {
    this.saving.set(true);
    const body = this.assigned().map(a => ({
      etapaId:     a.etapaId._id,
      orden:       a.orden,
      nombre:      a.nombre,
      estado:      a.estado,
      fechaInicio: a.fechaInicio || null,
      duracion:    a.duracion    || null,
    }));
    this.http.put<any[]>(`${this.base}/projects/${this.projectId}/etapas`, body).subscribe({
      next: data => {
        this.assigned.set(data.map(d => ({
          ...d,
          nombre: d.nombre || d.etapaId.nombre,
          estado: (d.estado as EstadoEtapa) || 'pendiente',
        })));
        this.saving.set(false);
        this.dirty.set(false);
        this.catalogOpen.set(false);
      },
      error: () => this.saving.set(false),
    });
  }
}
