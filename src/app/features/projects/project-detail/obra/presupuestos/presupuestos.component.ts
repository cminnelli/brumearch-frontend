import { Component, Input, inject, signal, OnInit, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ArsNumPipe } from '../../../../../shared/pipes/ars-num.pipe';
import { PresupuestoService } from '../../../../../core/services/presupuesto.service';
import { ProveedorService } from '../../../../../core/services/proveedor.service';
import { ConfigService, Rubro, Subrubro } from '../../../../../core/services/config.service';
import { Presupuesto, EstadoPresupuesto } from '../../../../../shared/models/obra.model';
import { Proveedor } from '../../../../../shared/models/proveedor.model';

const ESTADO_NEXT: Record<EstadoPresupuesto, EstadoPresupuesto> = {
  pendiente: 'aprobado',
  aprobado:  'rechazado',
  rechazado: 'pendiente',
};

@Component({
  selector: 'app-presupuestos',
  standalone: true,
  imports: [CommonModule, FormsModule, ArsNumPipe],
  templateUrl: './presupuestos.component.html',
  styleUrl: './presupuestos.component.scss',
})
export class PresupuestosComponent implements OnInit, OnChanges {
  @Input() projectId!: string;
  @Input() filtroSubrubro = '';

  private svc        = inject(PresupuestoService);
  private provSvc    = inject(ProveedorService);
  private configSvc  = inject(ConfigService);

  items        = signal<Presupuesto[]>([]);
  rubros       = signal<Rubro[]>([]);
  allSubrubros = signal<Subrubro[]>([]);
  subrubros    = signal<Subrubro[]>([]);
  proveedores  = signal<Proveedor[]>([]);
  showForm     = signal(false);
  saving       = signal(false);

  form = this.emptyForm();

  ngOnInit() {
    this.configSvc.getRubros().subscribe((d) => this.rubros.set(d));
    this.configSvc.getSubrubros().subscribe((d) => this.allSubrubros.set(d));
    this.provSvc.list().subscribe((d) => this.proveedores.set(d));
    this.load();
  }

  ngOnChanges() { this.load(); }

  load() {
    const filters = this.filtroSubrubro ? { subrubroId: this.filtroSubrubro } : {};
    this.svc.list(this.projectId, filters).subscribe((d) => this.items.set(d));
  }

  onRubroChange() {
    this.form.subrubroId = '';
    this.subrubros.set(
      this.allSubrubros().filter(s => s.rubroId._id === this.form.rubroId)
    );
    this.proveedores.set([]);
  }

  onSubrubroChange() {
    const sid = this.form.subrubroId;
    if (sid) this.provSvc.list(sid).subscribe((d) => this.proveedores.set(d));
  }

  save() {
    if (!this.form.subrubroId || !this.form.monto) return;
    this.saving.set(true);
    const fd = new FormData();
    fd.append('subrubroId',  this.form.subrubroId);
    fd.append('monto',       String(this.form.monto));
    fd.append('moneda',      this.form.moneda);
    if (this.form.proveedorId) fd.append('proveedorId', this.form.proveedorId);
    if (this.form.descripcion) fd.append('descripcion', this.form.descripcion);
    if (this.form.notas)       fd.append('notas',       this.form.notas);
    for (const f of this.form.archivos) fd.append('archivos', f);

    this.svc.create(this.projectId, fd).subscribe({
      next: (item) => {
        this.items.update((l) => [item, ...l]);
        this.form = this.emptyForm();
        this.showForm.set(false);
        this.saving.set(false);
      },
      error: () => this.saving.set(false),
    });
  }

  cycleEstado(item: Presupuesto) {
    const next = ESTADO_NEXT[item.estado];
    this.svc.patchEstado(this.projectId, item._id, next).subscribe((updated) => {
      this.items.update((l) => l.map((x) => x._id === item._id ? updated : x));
    });
  }

  remove(item: Presupuesto) {
    if (!confirm(`¿Eliminar presupuesto "${item.descripcion || item.subrubroId.nombre}"?`)) return;
    this.svc.remove(this.projectId, item._id).subscribe(() => {
      this.items.update((l) => l.filter((x) => x._id !== item._id));
    });
  }

  onFiles(e: Event) {
    const files = (e.target as HTMLInputElement).files;
    if (files) this.form.archivos = Array.from(files);
  }

  formatMonto(monto: number, moneda: string) {
    return `${moneda} ${monto.toLocaleString('es-AR')}`;
  }

  totalAprobado() {
    return this.items().filter((p) => p.estado === 'aprobado').reduce((s, p) => s + p.monto, 0);
  }

  private emptyForm() {
    return { rubroId: '', subrubroId: '', proveedorId: '', descripcion: '', monto: null as any, moneda: 'ARS', notas: '', archivos: [] as File[] };
  }
}
