import { Component, Input, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SeleccionService } from '../../../../core/services/seleccion.service';
import { Seleccion, EstadoSeleccion, agruparSel, nombreSel, unidadSel, urgenciaSel } from '../../../../shared/models/seleccion.model';

/** Vista del propietario: todo lo que tiene que comprar por su cuenta, con fecha y su avance. */
@Component({
  selector: 'app-client-selecciones',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './client-selecciones.component.html',
  styleUrl: './client-selecciones.component.scss',
})
export class ClientSeleccionesComponent implements OnInit {
  @Input({ required: true }) projectId!: string;

  private svc = inject(SeleccionService);

  items = signal<Seleccion[]>([]);
  loading = signal(true);
  error = signal(false);
  editingNotasId = signal<string | null>(null);
  editingNotas = signal('');

  nombre = nombreSel; unidad = unidadSel; urgencia = (s: Seleccion) => urgenciaSel(s);
  readonly OPCIONES: { id: EstadoSeleccion; label: string }[] = [
    { id: 'buscando', label: 'Buscando' }, { id: 'seleccionado', label: 'Elegido' }, { id: 'comprado', label: 'Comprado' },
  ];

  grupos = computed(() => agruparSel(this.items()));
  total = computed(() => this.items().length);
  comprados = computed(() => this.items().filter(i => i.estadoCliente === 'comprado').length);
  faltan = computed(() => this.total() - this.comprados());
  progreso = computed(() => (this.total() ? Math.round(this.comprados() / this.total() * 100) : 0));
  /** Lo que hay que comprar primero: vencido o con fecha en los próximos 14 días. */
  urgentes = computed(() => this.items().filter(i => { const u = urgenciaSel(i); return u && u.tono !== 'ok'; }).length);

  ngOnInit() {
    this.svc.listCliente(this.projectId).subscribe({
      next: d => { this.items.set(d); this.loading.set(false); },
      error: () => { this.error.set(true); this.loading.set(false); },
    });
  }

  /** Marca el estado; tocar el que ya está marcado lo vuelve a "pendiente". */
  poner(item: Seleccion, estado: EstadoSeleccion) {
    const nuevo: EstadoSeleccion = item.estadoCliente === estado ? 'pendiente' : estado;
    const anterior = item.estadoCliente;
    this.items.update(l => l.map(i => (i._id === item._id ? { ...i, estadoCliente: nuevo } : i)));
    this.svc.updateEstado(this.projectId, item._id, nuevo, item.notasCliente).subscribe({
      next: u => this.items.update(l => l.map(i => (i._id === u._id ? u : i))),
      error: () => this.items.update(l => l.map(i => (i._id === item._id ? { ...i, estadoCliente: anterior } : i))),
    });
  }
  /** El círculo: comprado / no comprado, en un toque. */
  tildar(item: Seleccion) { this.poner(item, 'comprado'); }

  editarNota(item: Seleccion) { this.editingNotasId.set(item._id); this.editingNotas.set(item.notasCliente ?? ''); }
  guardarNota(item: Seleccion) {
    if (this.editingNotasId() !== item._id) return;
    const notas = this.editingNotas().trim() || undefined;
    this.items.update(l => l.map(i => (i._id === item._id ? { ...i, notasCliente: notas } : i)));
    this.svc.updateEstado(this.projectId, item._id, item.estadoCliente, notas).subscribe();
    this.editingNotasId.set(null);
  }
}
