import { Component, EventEmitter, Input, OnInit, Output, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ConfigService, EtapaPlantilla } from '../../../../core/services/config.service';
import { avanceObra } from '../../../../shared/utils/avance';
import { analizarCronograma, fmtCorta, fmtLarga, diasEntre } from '../../../../shared/utils/desvios';
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
  avance?:      number | null;
  fechaInicioReal?: string | null;
  fechaFinReal?:    string | null;
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
  /** Solo editores y superadmin cambian el estado y el avance. */
  @Input() canEdit = true;
  @Output() etapasChange = new EventEmitter<{ nombre?: string; orden: number; estado: EstadoEtapa; fechaInicio?: string | null; duracion?: number | null; avance?: number | null }[]>();

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
  /** Avance de obra: promedio del avance de cada etapa, ponderado por su duración. */
  completedPct = computed(() => avanceObra(this.assigned()));
  ponderado    = computed(() => this.assigned().length > 0 && this.assigned().every(a => (a.duracion ?? 0) > 0));
  enCurso      = computed(() => this.assigned().filter(a => a.estado === 'activa').length);

  readonly ESTADOS: { id: EstadoEtapa; label: string }[] = [
    { id: 'pendiente', label: 'Pendiente' }, { id: 'activa', label: 'En curso' }, { id: 'completada', label: 'Completada' },
  ];

  /** Cambia el estado de una etapa, completa las fechas reales y guarda en el momento. */
  setEstado(id: string, estado: EstadoEtapa) {
    const hoy = new Date().toISOString().split('T')[0];
    this.assigned.update(list => list.map(a => {
      if (a._id !== id) return a;
      const inicio = a.fechaInicioReal || a.fechaInicio || hoy;
      return {
        ...a, estado,
        avance: estado === 'activa' ? (a.avance ?? null) : null,
        fechaInicioReal: estado === 'pendiente' ? null : inicio,
        fechaFinReal: estado === 'completada' ? (a.fechaFinReal || hoy) : null,
      };
    }));
    this.save();
  }
  /** Corrige a mano una fecha real (la fecha en que se marcó puede no ser la fecha en que ocurrió). */
  setReal(id: string, campo: 'fechaInicioReal' | 'fechaFinReal', valor: string) {
    this.assigned.update(list => list.map(a => a._id !== id ? a : { ...a, [campo]: valor || null }));
    this.save();
  }
  setAvance(id: string, valor: number) {
    const avance = Math.max(0, Math.min(100, Math.round(valor) || 0));
    this.assigned.update(list => list.map(a => a._id !== id ? a : { ...a, avance }));
    this.save();
  }
  // ── Plan vs. real ──
  fmtCorta = fmtCorta; fmtLarga = fmtLarga;
  analisis = computed(() => analizarCronograma(this.assigned().map(a => ({
    id: a._id!, nombre: a.nombre, orden: a.orden, estado: a.estado, avance: a.avance, fechaInicio: a.fechaInicio, duracion: a.duracion,
    fechaInicioReal: a.fechaInicioReal, fechaFinReal: a.fechaFinReal,
  }))));
  analisisPorId = computed(() => Object.fromEntries(this.analisis().etapas.map(x => [x.id, x])));
  readonly TONO_PILL = { ok: 'pill--good', warn: 'pill--warn', bad: 'pill--bad', none: '' } as const;
  /** Posición (%) de una fecha en el gráfico. */
  pos(d: Date | null): number {
    const an = this.analisis();
    if (!d || !an.desde || !an.hasta) return 0;
    const total = Math.max(1, diasEntre(an.desde, an.hasta));
    return Math.max(0, Math.min(100, diasEntre(an.desde, d) / total * 100));
  }
  ancho(a: Date | null, b: Date | null): number { return a && b ? Math.max(0.8, this.pos(b) - this.pos(a)) : 0; }
  hoy() { return new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()); }
  hoyPos() { return this.pos(this.hoy()); }
  /** Marcas de mes del eje. */
  meses = computed(() => {
    const an = this.analisis(); const out: { label: string; left: number }[] = [];
    if (!an.desde || !an.hasta) return out;
    const d = new Date(an.desde.getFullYear(), an.desde.getMonth() + 1, 1);
    while (d <= an.hasta) { out.push({ label: d.toLocaleDateString('es-AR', { month: 'short' }), left: this.pos(d) }); d.setMonth(d.getMonth() + 1); }
    return out;
  });
  pctEtapa(a: ProyectoEtapa) { return a.estado === 'completada' ? 100 : a.estado === 'activa' ? (a.avance ?? 50) : 0; }

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
          avance:      d.avance ?? null,
          fechaInicioReal: d.fechaInicioReal ? new Date(d.fechaInicioReal).toISOString().split('T')[0] : null,
          fechaFinReal:    d.fechaFinReal ? new Date(d.fechaFinReal).toISOString().split('T')[0] : null,
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
      avance:      a.estado === 'activa' ? (a.avance ?? null) : null,
      fechaInicioReal: a.fechaInicioReal || null,
      fechaFinReal:    a.fechaFinReal || null,
    }));
    this.http.put<any[]>(`${this.base}/projects/${this.projectId}/etapas`, body).subscribe({
      next: data => {
        this.assigned.set(data.map(d => ({
          ...d,
          nombre: d.nombre || d.etapaId.nombre,
          estado: (d.estado as EstadoEtapa) || 'pendiente',
        })));
        this.etapasChange.emit(data);
        this.saving.set(false);
        this.dirty.set(false);
        this.catalogOpen.set(false);
      },
      error: () => this.saving.set(false),
    });
  }
}
