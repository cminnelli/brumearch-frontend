import { Component, EventEmitter, Input, OnInit, Output, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { AporteService } from '../../../../core/services/aporte.service';
import { MonedaService } from '../../../../core/services/moneda.service';
import { ConfirmService } from '../../../../core/services/confirm.service';
import { Aporte, AsignacionAporte, ResumenAportes } from '../../../../shared/models/gasto-vario.model';
import { GastoService } from '../../../../core/services/gasto.service';
import { Gasto } from '../../../../shared/models/obra.model';
import { buildComprobanteHtml, descargarPdf } from '../../../../shared/utils/comprobante-pago';
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
  @Input() projectName = '';
  /** Avisa que cambió algo que afecta los totales del proyecto (por ejemplo un pago asignado). */
  @Output() cambio = new EventEmitter<void>();

  private svc = inject(AporteService);
  private gastoSvc = inject(GastoService);
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

  ngOnInit() { this.cargar(); this.cargarGastos(); }
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
  // ═══ Asignar plata del aporte a gastos y pasar saldo a utilidad (solo equipo) ═══
  gastos = signal<Gasto[]>([]);
  panel = signal<{ id: string; tipo: 'asignar' | 'utilidad' } | null>(null);
  busca = signal('');
  gastoSelId = signal<string | null>(null);
  formAsig: { moneda: 'ARS' | 'USD'; monto: number | null; fecha: string; concepto: string } = { moneda: 'ARS', monto: null, fecha: hoyISO(), concepto: '' };
  formUtil: { monto: number | null; nota: string } = { monto: null, nota: '' };
  errorPanel = signal('');
  trabajando = signal(false);

  cargarGastos() { this.gastoSvc.list(this.projectId).subscribe(l => this.gastos.set(l)); }

  /** Lo que falta pagar de un gasto, en la moneda del gasto. */
  pendiente(g: Gasto) { return Math.max(0, g.monto - (g.pagos ?? []).reduce((t, p) => t + (p.monto || 0), 0)); }
  gastosConSaldo = computed(() => {
    const q = this.busca().trim().toLowerCase();
    return this.gastos().filter(g => this.pendiente(g) > 0.005)
      .filter(g => !q || `${g.proveedorId?.nombre ?? ''} ${g.descripcion ?? ''} ${g.subrubroId?.nombre ?? ''} ${g.subrubroId?.rubroId?.nombre ?? ''}`.toLowerCase().includes(q));
  });
  gastoSel = computed(() => this.gastos().find(g => g._id === this.gastoSelId()) ?? null);
  nombreGasto(g: Gasto) { return g.proveedorId?.nombre || g.descripcion || g.subrubroId?.nombre || 'Gasto'; }

  /** Pasa un monto de una moneda a otra con el tipo de cambio ÚNICO del aporte. null si hace falta y no hay. */
  conv(monto: number, desde: string, hacia: string, tc?: number | null): number | null {
    if (desde === hacia) return monto;
    if (!tc || tc <= 0) return null;
    return desde === 'ARS' ? monto / tc : monto * tc;
  }
  fm(n: number, mon: string) { return `${mon} ${(Math.round(n * 100) / 100).toLocaleString('es-AR', { maximumFractionDigits: 2 })}`; }

  abrirPanel(a: Aporte, tipo: 'asignar' | 'utilidad') {
    this.errorPanel.set(''); this.busca.set(''); this.gastoSelId.set(null);
    this.formAsig = { moneda: 'ARS', monto: null, fecha: hoyISO(), concepto: '' };
    this.formUtil = { monto: Math.round((a.saldo ?? 0) * 100) / 100 || null, nota: '' };
    this.panel.set(this.panel()?.id === a._id && this.panel()?.tipo === tipo ? null : { id: a._id, tipo });
    this.cargarGastos();
  }
  cerrarPanel() { this.panel.set(null); this.errorPanel.set(''); }
  elegirGasto(g: Gasto) { this.gastoSelId.set(g._id); this.errorPanel.set(''); }

  /** Atajo: pagar todo lo que falta del gasto elegido, en la moneda de la operación. */
  pagarLoQueFalta(a: Aporte) {
    const g = this.gastoSel(); if (!g) return;
    const v = this.conv(this.pendiente(g), g.moneda, this.formAsig.moneda, a.tipoCambio);
    this.formAsig.monto = v === null ? null : Math.round(v * 100) / 100;
  }
  /** Cuánto descuenta del saldo la operación que se está armando (en la moneda del aporte). */
  descuentaPreview(a: Aporte): number | null {
    const m = this.formAsig.monto; if (!m || m <= 0) return null;
    return this.conv(m, this.formAsig.moneda, a.moneda, a.tipoCambio);
  }
  puedeAsignar(a: Aporte) {
    const d = this.descuentaPreview(a);
    return !!this.gastoSel() && d !== null && d <= (a.saldo ?? 0) + 0.005 && !this.trabajando();
  }
  asignar(a: Aporte) {
    const g = this.gastoSel(); if (!g || !this.puedeAsignar(a)) return;
    this.trabajando.set(true); this.errorPanel.set('');
    this.svc.asignar(this.projectId, a._id, { gastoId: g._id, monedaOperacion: this.formAsig.moneda, montoOperacion: this.formAsig.monto!, fecha: this.formAsig.fecha, concepto: this.formAsig.concepto || undefined }).subscribe({
      next: r => { this.resumen.set(r); this.trabajando.set(false); this.cerrarPanel(); this.cargarGastos(); this.cambio.emit(); },
      error: (e: HttpErrorResponse) => { this.trabajando.set(false); this.errorPanel.set(e.error?.message ?? 'No se pudo asignar el pago.'); },
    });
  }
  async quitarAsignacion(a: Aporte, x: AsignacionAporte) {
    if (!await this.confirmSvc.confirm('Se borra el pago en Compras y el monto vuelve al saldo del aporte.', '¿Quitar esta asignación?')) return;
    this.svc.quitarAsignacion(this.projectId, a._id, x._id).subscribe(r => { this.resumen.set(r); this.cargarGastos(); this.cambio.emit(); });
  }
  /** Comprobante PDF del pago que salió de este aporte (el mismo formato que en Compras). */
  comprobante(x: AsignacionAporte) {
    const g = this.gastos().find(y => y._id === x.gastoId); if (!g) return;
    const pago = g.pagos.find(p => p._id === x.pagoId) ?? g.pagos[g.pagos.length - 1];
    descargarPdf(buildComprobanteHtml(g, this.projectName, pago));
  }

  guardarUtilidad(a: Aporte) {
    const m = this.formUtil.monto;
    if (!m || m <= 0) { this.errorPanel.set('Poné cuánto pasás a utilidad.'); return; }
    if (m > (a.saldo ?? 0) + 0.005) { this.errorPanel.set(`Solo quedan ${this.fm(a.saldo ?? 0, a.moneda)} de saldo.`); return; }
    this.trabajando.set(true); this.errorPanel.set('');
    this.svc.crearUtilidad(this.projectId, a._id, { monto: m, nota: this.formUtil.nota || undefined }).subscribe({
      next: r => { this.resumen.set(r); this.trabajando.set(false); this.cerrarPanel(); },
      error: (e: HttpErrorResponse) => { this.trabajando.set(false); this.errorPanel.set(e.error?.message ?? 'No se pudo guardar la utilidad.'); },
    });
  }
  async quitarUtilidad(a: Aporte, uid: string) {
    if (!await this.confirmSvc.confirm('El monto vuelve al saldo del aporte.', '¿Deshacer esta utilidad?')) return;
    this.svc.quitarUtilidad(this.projectId, a._id, uid).subscribe(r => this.resumen.set(r));
  }
  /** Reparto del aporte para la barra: asignado / utilidad / saldo, en %. */
  reparto(a: Aporte) {
    const t = a.monto || 1;
    return { asig: Math.min(100, (a.asignado ?? 0) / t * 100), util: Math.min(100, (a.utilidad ?? 0) / t * 100), saldo: Math.max(0, (a.saldo ?? 0) / t * 100) };
  }

  metodoLabel(id?: string) { return this.metodos.find(x => x.id === id)?.l ?? ''; }
  fmtFecha(d: string) { return new Date(d).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }); }
  enVista(a: Aporte) { return this.m.fmt(a.equiv[this.m.vista()], this.m.vista()); }
  esOtra(a: Aporte) { return a.moneda !== this.m.vista(); }
}
