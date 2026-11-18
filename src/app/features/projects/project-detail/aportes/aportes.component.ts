import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { AporteService } from '../../../../core/services/aporte.service';
import { MonedaService } from '../../../../core/services/moneda.service';
import { ConfirmService } from '../../../../core/services/confirm.service';
import { Aporte, ResumenAportes } from '../../../../shared/models/gasto-vario.model';
import { AportesResumenComponent } from '../../../../shared/components/aportes-resumen/aportes-resumen.component';
import { TipoCambioComponent } from '../../../../shared/components/tipo-cambio/tipo-cambio.component';
import { fileUrl } from '../../../../shared/utils/file-url';

const hoyISO = () => new Date().toISOString().split('T')[0];
const METODOS = [{ id: 'transferencia', l: 'Transferencia' }, { id: 'efectivo', l: 'Efectivo' }, { id: 'cheque', l: 'Cheque' }, { id: 'otro', l: 'Otro' }];

/** Aportes del propietario: lo que paga el cliente y cómo se va usando en la obra. Independiente de los gastos. */
@Component({
  selector: 'app-aportes',
  standalone: true,
  imports: [FormsModule, AportesResumenComponent, TipoCambioComponent],
  templateUrl: './aportes.component.html',
  styleUrl: './aportes.component.scss',
})
export class AportesComponent implements OnInit {
  @Input({ required: true }) projectId!: string;
  @Input() canEdit = false;
  /** Nombre del propietario para sugerirlo como origen del aporte. */
  @Input() propietario = '';

  private svc = inject(AporteService);
  private confirmSvc = inject(ConfirmService);
  m = inject(MonedaService);
  fileUrl = fileUrl;
  metodos = METODOS;

  resumen = signal<ResumenAportes | null>(null);
  loading = signal(true);
  abierto = signal(false);
  guardando = signal(false);
  error = signal('');
  editandoId = signal<string | null>(null);
  form = this.vacio();
  archivo: File | null = null;

  private vacio() { return { fecha: hoyISO(), monto: null as number | null, moneda: 'ARS', tipoCambio: null as number | null, metodo: 'transferencia', concepto: '', origen: this.propietario, referencia: '', notas: '' }; }

  ngOnInit() { this.cargar(); }
  cargar() { this.svc.resumen(this.projectId).subscribe({ next: r => { this.resumen.set(r); this.loading.set(false); }, error: () => this.loading.set(false) }); }

  nuevo() { this.editandoId.set(null); this.form = this.vacio(); this.archivo = null; this.error.set(''); this.abierto.set(true); setTimeout(() => document.getElementById('ap-monto')?.focus()); }
  cerrar() { this.abierto.set(false); this.editandoId.set(null); this.error.set(''); }
  editar(a: Aporte) {
    this.editandoId.set(a._id); this.archivo = null; this.error.set('');
    this.form = { fecha: a.fecha.substring(0, 10), monto: a.monto, moneda: a.moneda, tipoCambio: a.tipoCambio ?? null, metodo: a.metodo ?? 'transferencia', concepto: a.concepto ?? '', origen: a.origen ?? '', referencia: a.referencia ?? '', notas: a.notas ?? '' };
    this.abierto.set(true);
  }

  guardar() {
    const f = this.form;
    if (!f.monto || f.monto <= 0 || this.guardando()) { this.error.set('Cargá el monto del pago.'); return; }
    this.error.set(''); this.guardando.set(true);
    const fd = new FormData();
    fd.append('fecha', f.fecha); fd.append('monto', String(f.monto)); fd.append('moneda', f.moneda); fd.append('metodo', f.metodo);
    if (f.tipoCambio) fd.append('tipoCambio', String(f.tipoCambio));
    for (const k of ['concepto', 'origen', 'referencia', 'notas'] as const) if (f[k]) fd.append(k, f[k]);
    if (this.archivo) fd.append('comprobante', this.archivo);
    const id = this.editandoId();
    (id ? this.svc.update(this.projectId, id, fd) : this.svc.create(this.projectId, fd)).subscribe({
      next: () => { this.guardando.set(false); this.cerrar(); this.cargar(); },
      error: (e: HttpErrorResponse) => { this.guardando.set(false); this.error.set(e.error?.message ?? 'No se pudo guardar el pago.'); },
    });
  }
  async eliminar(a: Aporte) {
    if (!await this.confirmSvc.confirm('Esta acción no se puede deshacer.', '¿Eliminar este pago?')) return;
    this.svc.remove(this.projectId, a._id).subscribe(() => this.cargar());
  }
  onArchivo(e: Event) { this.archivo = (e.target as HTMLInputElement).files?.[0] ?? null; }

  private f(d: string) { return new Date(d); }
  dia(d: string) { return this.f(d).getUTCDate(); }
  mes(d: string) { return this.f(d).toLocaleDateString('es-AR', { month: 'short', timeZone: 'UTC' }).replace('.', ''); }
  anio(d: string) { return this.f(d).getUTCFullYear(); }
  metodoLabel(id?: string) { return this.metodos.find(x => x.id === id)?.l ?? ''; }
  fmtFecha(d: string) { return new Date(d).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }); }
  enVista(a: Aporte) { return this.m.fmt(a.equiv[this.m.vista()], this.m.vista()); }
  esOtra(a: Aporte) { return a.moneda !== this.m.vista(); }
}
