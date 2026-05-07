import { Component, Input, inject, signal, OnInit, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ArsNumPipe } from '../../../../../shared/pipes/ars-num.pipe';
import { GastoService } from '../../../../../core/services/gasto.service';
import { ProveedorService } from '../../../../../core/services/proveedor.service';
import { PresupuestoService } from '../../../../../core/services/presupuesto.service';
import { ConfigService, Rubro, Subrubro } from '../../../../../core/services/config.service';
import { Gasto, Presupuesto, estadoGasto, EstadoGasto } from '../../../../../shared/models/obra.model';
import { Proveedor } from '../../../../../shared/models/proveedor.model';

@Component({
  selector: 'app-gastos',
  standalone: true,
  imports: [CommonModule, FormsModule, ArsNumPipe],
  templateUrl: './gastos.component.html',
  styleUrl: './gastos.component.scss',
})
export class GastosComponent implements OnInit, OnChanges {
  @Input() projectId!: string;
  @Input() filtroSubrubro = '';

  private svc         = inject(GastoService);
  private provSvc     = inject(ProveedorService);
  private presSvc     = inject(PresupuestoService);
  private configSvc   = inject(ConfigService);

  items        = signal<Gasto[]>([]);
  rubros       = signal<Rubro[]>([]);
  allSubrubros = signal<Subrubro[]>([]);
  subrubros    = signal<Subrubro[]>([]);
  proveedores  = signal<Proveedor[]>([]);
  presupuestos = signal<Presupuesto[]>([]);
  showForm     = signal(false);
  saving       = signal(false);

  form = this.emptyForm();

  ngOnInit() {
    this.configSvc.getRubros().subscribe((d) => this.rubros.set(d));
    this.configSvc.getSubrubros().subscribe((d) => this.allSubrubros.set(d));
    this.provSvc.list().subscribe((d) => this.proveedores.set(d));
    this.presSvc.list(this.projectId, { estado: 'aprobado' }).subscribe((d) => this.presupuestos.set(d));
    this.load();
  }

  ngOnChanges() { this.load(); }

  load() {
    const filters: Record<string, string> = this.filtroSubrubro ? { subrubroId: this.filtroSubrubro } : {};
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
    if (!this.form.subrubroId || !this.form.monto || !this.form.fecha) return;
    this.saving.set(true);
    const fd = new FormData();
    fd.append('subrubroId', this.form.subrubroId);
    fd.append('monto',      String(this.form.monto));
    fd.append('moneda',     this.form.moneda);
    fd.append('fecha',      this.form.fecha);
    if (this.form.proveedorId)   fd.append('proveedorId',   this.form.proveedorId);
    if (this.form.presupuestoId) fd.append('presupuestoId', this.form.presupuestoId);
    if (this.form.descripcion)   fd.append('descripcion',   this.form.descripcion);
    if (this.form.notas)         fd.append('notas',         this.form.notas);
    if (this.form.comprobante)   fd.append('comprobante',   this.form.comprobante);

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

  getEstado(item: Gasto): EstadoGasto {
    return estadoGasto(item);
  }

  remove(item: Gasto) {
    if (!confirm(`¿Eliminar gasto "${item.descripcion || item.subrubroId.nombre}"?`)) return;
    this.svc.remove(this.projectId, item._id).subscribe(() => {
      this.items.update((l) => l.filter((x) => x._id !== item._id));
    });
  }

  onComprobante(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) this.form.comprobante = f;
  }

  formatMonto(monto: number, moneda: string) {
    return `${moneda} ${monto.toLocaleString('es-AR')}`;
  }

  formatFecha(fecha: string) {
    return new Date(fecha).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  totalGastado() {
    return this.items().reduce((s, g) => s + g.monto, 0);
  }

  todayISO() {
    return new Date().toISOString().substring(0, 10);
  }

  private emptyForm() {
    return {
      rubroId: '', subrubroId: '', proveedorId: '', presupuestoId: '',
      descripcion: '', monto: null as any, moneda: 'ARS',
      fecha: this.todayISO(), notas: '', comprobante: null as File | null,
    };
  }
}
