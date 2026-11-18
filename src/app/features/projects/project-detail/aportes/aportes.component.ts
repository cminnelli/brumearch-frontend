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
import { buildDetalleAporteHtml } from '../../../../shared/utils/comprobante-aporte';
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
  /** Gastos marcados para pagar con este aporte, cada uno con su monto y la moneda en que se pagó. */
  lineas: { gastoId: string; monto: number | null; moneda: 'ARS' | 'USD' }[] = [];
  metodo: 'efectivo' | 'transferencia' | 'cheque' = 'efectivo';
  fechaAsig = hoyISO();
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
  nombreGasto(g: Gasto) { return g.proveedorId?.nombre || g.descripcion || g.subrubroId?.nombre || 'Gasto'; }

  /** Pasa un monto de una moneda a otra con el tipo de cambio ÚNICO del aporte. null si hace falta y no hay. */
  conv(monto: number, desde: string, hacia: string, tc?: number | null): number | null {
    if (desde === hacia) return monto;
    if (!tc || tc <= 0) return null;
    return desde === 'ARS' ? monto / tc : monto * tc;
  }
  fm(n: number, mon: string) { return `${mon} ${(Math.round(n * 100) / 100).toLocaleString('es-AR', { maximumFractionDigits: 2 })}`; }

  abrirPanel(a: Aporte, tipo: 'asignar' | 'utilidad') {
    this.errorPanel.set(''); this.busca.set(''); this.lineas = []; this.metodo = 'efectivo'; this.fechaAsig = hoyISO();
    this.formUtil = { monto: Math.round((a.saldo ?? 0) * 100) / 100 || null, nota: '' };
    this.panel.set(this.panel()?.id === a._id && this.panel()?.tipo === tipo ? null : { id: a._id, tipo });
    this.cargarGastos();
  }
  cerrarPanel() { this.panel.set(null); this.errorPanel.set(''); this.lineas = []; }

  linea(g: Gasto) { return this.lineas.find(l => l.gastoId === g._id) ?? null; }
  estaSel(g: Gasto) { return !!this.linea(g); }
  /** Marca o desmarca un gasto. Al marcarlo propone pagar lo que falta, en la moneda del gasto. */
  toggleGasto(g: Gasto, a: Aporte) {
    this.errorPanel.set('');
    if (this.estaSel(g)) { this.lineas = this.lineas.filter(l => l.gastoId !== g._id); return; }
    const l = { gastoId: g._id, monto: null as number | null, moneda: (g.moneda === 'USD' ? 'USD' : 'ARS') as 'ARS' | 'USD' };
    this.lineas = [...this.lineas, l];
    this.llenar(l, g, a);
  }
  /** Pone en el monto todo lo que falta del gasto, expresado en la moneda elegida. */
  llenar(l: { monto: number | null; moneda: 'ARS' | 'USD' }, g: Gasto, a: Aporte) {
    const v = this.conv(this.pendiente(g), g.moneda, l.moneda, a.tipoCambio);
    l.monto = v === null ? null : Math.round(v * 100) / 100;
  }
  /** Cuánto descuenta del saldo en total (en la moneda del aporte). null si falta un monto o un tipo de cambio. */
  totalDescuenta(a: Aporte): number | null {
    let t = 0;
    for (const l of this.lineas) { if (!l.monto || l.monto <= 0) return null; const d = this.conv(l.monto, l.moneda, a.moneda, a.tipoCambio); if (d === null) return null; t += d; }
    return this.lineas.length ? t : null;
  }
  puedeAsignar(a: Aporte) { const d = this.totalDescuenta(a); return d !== null && d <= (a.saldo ?? 0) + 0.005 && !this.trabajando(); }
  asignar(a: Aporte) {
    if (!this.puedeAsignar(a)) return;
    this.trabajando.set(true); this.errorPanel.set('');
    const items = this.lineas.map(l => ({ gastoId: l.gastoId, montoOperacion: l.monto!, monedaOperacion: l.moneda }));
    this.svc.asignar(this.projectId, a._id, { items, metodoPago: this.metodo, fecha: this.fechaAsig }).subscribe({
      next: r => { this.resumen.set(r); this.trabajando.set(false); this.cerrarPanel(); this.cargarGastos(); this.cambio.emit(); },
      error: (e: HttpErrorResponse) => { this.trabajando.set(false); this.errorPanel.set(e.error?.message ?? 'No se pudo asignar.'); },
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

  /** Detalle del pago (a qué gastos se asignó, utilidad y saldo): para ver en pantalla o bajar en PDF. Es interno. */
  verDetalle(a: Aporte) {
    const w = window.open('', '_blank'); if (!w) return;
    w.document.write(buildDetalleAporteHtml(a, this.projectName)); w.document.close();
  }
  detallePdf(a: Aporte) { descargarPdf(buildDetalleAporteHtml(a, this.projectName)); }
  fechaCorta(d: string) { return new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'UTC' }); }

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
  metodoLabel(id?: string) { return this.metodos.find(x => x.id === id)?.l ?? ''; }
  fmtFecha(d: string) { return new Date(d).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }); }
  enVista(a: Aporte) { return this.m.fmt(a.equiv[this.m.vista()], this.m.vista()); }
  esOtra(a: Aporte) { return a.moneda !== this.m.vista(); }
}
