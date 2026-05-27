import { Component, Input, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule, NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PresupuestoService } from '../../../../core/services/presupuesto.service';
import { GastoService } from '../../../../core/services/gasto.service';
import { ProveedorService } from '../../../../core/services/proveedor.service';
import { ConfigService, Rubro, Subrubro } from '../../../../core/services/config.service';
import { ReservaService } from '../../../../core/services/reserva.service';
import { SolicitudService } from '../../../../core/services/solicitud.service';
import { ConfirmService } from '../../../../core/services/confirm.service';
import { ProjectService } from '../../../../core/services/project.service';
import { PlanObraEntry } from '../../../../shared/models/project.model';
import {
  Presupuesto, Gasto, Moneda, MetodoPago,
  METODO_LABELS, METODO_ICONS, METODO_HINT,
  Reserva, saldoReserva, totalPagadoGasto, estadoGasto,
  Solicitud, Cotizacion,
} from '../../../../shared/models/obra.model';
import { Proveedor } from '../../../../shared/models/proveedor.model';

@Component({
  selector: 'app-obra',
  standalone: true,
  imports: [CommonModule, NgTemplateOutlet, FormsModule],
  templateUrl: './obra.component.html',
  styleUrl: './obra.component.scss',
})
export class ObraComponent implements OnInit {
  @Input() projectId!: string;
  @Input() projectName = '';

  private presSvc      = inject(PresupuestoService);
  private gastoSvc     = inject(GastoService);
  private provSvc      = inject(ProveedorService);
  private cfgSvc       = inject(ConfigService);
  private reservaSvc   = inject(ReservaService);
  private solicitudSvc = inject(SolicitudService);
  private confirmSvc   = inject(ConfirmService);
  private projectSvc   = inject(ProjectService);

  // ── Data ────────────────────────────────────────────────
  presupuestos = signal<Presupuesto[]>([]);
  gastos       = signal<Gasto[]>([]);
  rubros       = signal<Rubro[]>([]);
  allSubrubros = signal<Subrubro[]>([]);
  reservas     = signal<Reserva[]>([]);

  // ── Presupuestos por estado ──────────────────────────────
  presPendientes = computed(() => this.presupuestos().filter(p => p.estado === 'pendiente'));
  presAprobados  = computed(() => this.presupuestos().filter(p => p.estado === 'aprobado'));
  presRechazados = computed(() => this.presupuestos().filter(p => p.estado === 'rechazado'));

  // ── Summary totals ───────────────────────────────────────
  totalPresupuestado = computed(() => this.presAprobados().reduce((s, p) => s + p.monto, 0));
  totalEjecutado     = computed(() => this.gastos().reduce((s, g) => s + g.monto, 0));
  totalPagado        = computed(() => this.gastos().reduce((s, g) => s + totalPagadoGasto(g), 0));
  totalPorPagar      = computed(() => this.totalEjecutado() - this.totalPagado());

  // ── Solicitudes ──────────────────────────────────────────
  solicitudes          = signal<Solicitud[]>([]);
  showSolicitudForm    = signal(false);
  savingSolicitud      = signal(false);
  solicitudForm        = { rubroId: '', subrubroId: '', descripcion: '' };
  solicitudFormSubs    = signal<Subrubro[]>([]);
  addingCotizacionId   = signal<string | null>(null);
  savingCotizacion     = signal(false);
  cotizacionForm: {
    proveedorId: string; monto: number | null; moneda: Moneda;
    notas: string; plazo: string; condiciones: string;
    archivos: File[]; provs: Proveedor[];
  } = { proveedorId: '', monto: null, moneda: 'ARS', notas: '', plazo: '', condiciones: '', archivos: [], provs: [] };

  // ── Plan de Obra (presupuesto arquitecto por subrubro) ──
  planObra        = signal<PlanObraEntry[]>([]);
  soloConDatos    = signal(false);

  // ── Finanzas de Obra: tabla agrupada rubro → subrubro ───
  finanzasData = computed(() => {
    const rubros      = this.rubros();
    const subs        = this.allSubrubros();
    const gastos      = this.gastos();
    const plan        = this.planObra();
    const soloConData = this.soloConDatos();

    return rubros.map(rubro => {
      const rubroIdStr = String(rubro._id);
      const rubroSubs  = subs.filter(s => String(s.rubroId?._id ?? '') === rubroIdStr);

      const rows = rubroSubs.map(sub => {
        const subIdStr   = String(sub._id);
        const subGastos  = gastos.filter(g => String(g.subrubroId?._id ?? '') === subIdStr);
        // realTotal = suma de montos de gastos (comprometido)
        const realTotal  = subGastos.reduce((acc, g) => acc + (g.monto ?? 0), 0);
        // realPagado = suma de pagos efectivamente realizados
        const realPagado = subGastos.reduce((acc, g) => acc + totalPagadoGasto(g), 0);
        const planEntry  = plan.find(p => p.subrubroId === subIdStr);
        const planMonto  = planEntry?.monto ?? 0;
        const planMoneda = planEntry?.moneda ?? 'ARS';
        const pct        = planMonto > 0 ? Math.min(999, Math.round(realPagado / planMonto * 100)) : null;
        const hasData    = realTotal > 0 || realPagado > 0 || planMonto > 0;
        return { sub, realTotal, realPagado, planMonto, planMoneda, pct, hasData };
      }).filter(r => !soloConData || r.hasData);
      // Mostrar siempre el rubro aunque sus subrubros no tengan datos
      const rubroRealTotal  = rows.reduce((acc, r) => acc + r.realTotal, 0);
      const rubroRealPagado = rows.reduce((acc, r) => acc + r.realPagado, 0);
      const rubroPlan       = rows.reduce((acc, r) => acc + r.planMonto, 0);
      const hasAnyData      = rows.some(r => r.hasData);
      return { rubro, rows, rubroRealTotal, rubroRealPagado, rubroPlan, hasAnyData };
    // Solo ocultar rubros que no tienen subrubros configurados
    }).filter(r => r.rows.length > 0);
  });

  finanzasTotals() {
    const data = this.finanzasData();
    return {
      plan:       data.reduce((acc, r) => acc + r.rubroPlan, 0),
      realTotal:  data.reduce((acc, r) => acc + r.rubroRealTotal, 0),
      realPagado: data.reduce((acc, r) => acc + r.rubroRealPagado, 0),
    };
  }

  // ── UI: editar celda Plan por subrubro ───────────────────
  editingPlanSubId = signal<string | null>(null);
  editPlanForm     = { monto: 0, moneda: 'ARS' };
  savingPlan       = signal(false);

  // ── Filter ──────────────────────────────────────────────
  obraFilter = signal<'todos' | 'cotizaciones' | 'pendiente' | 'aprobado' | 'rechazado' | 'gasto' | 'finanzas'>('todos');

  // ── Master/detail selection ──────────────────────────────
  selectedId   = signal<string | null>(null);
  selectedType = signal<'pres' | 'gasto' | 'sol' | null>(null);

  selectedPres  = computed(() => this.selectedType() === 'pres'  ? this.presupuestos().find(p => p._id === this.selectedId()) ?? null : null);
  selectedGasto = computed(() => this.selectedType() === 'gasto' ? this.gastos().find(g => g._id === this.selectedId()) ?? null : null);
  selectedSol   = computed(() => this.selectedType() === 'sol'   ? this.solicitudes().find(s => s._id === this.selectedId()) ?? null : null);

  // ── Paginación del historial de pagos ────────────────────
  readonly PAGO_PAGE    = 10;
  pagoVisibleCount      = signal(this.PAGO_PAGE);
  pagosVisibles         = computed(() => {
    const g = this.selectedGasto();
    return g ? [...g.pagos].reverse().slice(0, this.pagoVisibleCount()) : [];
  });
  hasMasPagos           = computed(() => {
    const g = this.selectedGasto();
    return !!g && g.pagos.length > this.pagoVisibleCount();
  });
  pagosRestantes        = computed(() => {
    const g = this.selectedGasto();
    return g ? Math.min(this.PAGO_PAGE, g.pagos.length - this.pagoVisibleCount()) : 0;
  });

  loadMorePagos() { this.pagoVisibleCount.update(n => n + this.PAGO_PAGE); }

  select(type: 'pres' | 'gasto' | 'sol', id: string) {
    if (this.selectedId() === id) { this.selectedId.set(null); this.selectedType.set(null); return; }
    this.selectedId.set(id);
    this.selectedType.set(type);
    this.editingPresId.set(null);
    this.generandoGastoPresId.set(null);
    this.activePagoGastoId.set(null);
    this.addingCotizacionId.set(null);
    this.editingPagoId.set(null);
    this.pagoVisibleCount.set(this.PAGO_PAGE);
    this.showPresForm.set(false);
    this.showSolicitudForm.set(false);
  }

  deselect() { this.selectedId.set(null); this.selectedType.set(null); }

  // ── UI: comprobante upload per gasto ─────────────────────
  uploadingComprobanteId = signal<string | null>(null);

  // ── UI: NEW presupuesto form ─────────────────────────────
  showPresForm  = signal(false);
  savingPres    = signal(false);
  presForm      = this.emptyPresForm();
  presFormSubs  = signal<Subrubro[]>([]);
  presFormProvs = signal<Proveedor[]>([]);

  // ── UI: EDIT presupuesto form ────────────────────────────
  editingPresId = signal<string | null>(null);
  editPresForm: any = {};
  editProvs     = signal<Proveedor[]>([]);
  savingEdit    = signal(false);

  // ── UI: Generar gasto (from presupuesto aprobado) ────────
  generandoGastoPresId = signal<string | null>(null);
  savingGenerar        = signal(false);
  generarError         = signal<string | null>(null);
  generarGastoForm: {
    fecha: string;
    comprobante: File | null;
    // Pago inmediato (opcional)
    registrarPago: boolean;
    pagoFecha: string;
    pagoMonto: number | null;
    pagoMetodo: MetodoPago | '';
    pagoReferencia: string;
    pagoNotas: string;
    pagoFuente: '' | 'reserva';
    pagoReservaId: string;
  } = { fecha: '', comprobante: null, registrarPago: false, pagoFecha: '', pagoMonto: null, pagoMetodo: '' as MetodoPago | '', pagoReferencia: '', pagoNotas: '', pagoFuente: '', pagoReservaId: '' };

  // ── UI: Edit gasto ──────────────────────────────────────
  editingGastoId = signal<string | null>(null);
  savingEditGasto = signal(false);
  editGastoForm: { monto: number | null; moneda: string; fecha: string; descripcion: string; notas: string; proveedorId: string } =
    { monto: null, moneda: 'ARS', fecha: '', descripcion: '', notas: '', proveedorId: '' };

  startEditGasto(g: Gasto) {
    this.editGastoForm = {
      monto:       g.monto,
      moneda:      g.moneda,
      fecha:       g.fecha ? g.fecha.substring(0, 10) : '',
      descripcion: g.descripcion ?? '',
      notas:       g.notas ?? '',
      proveedorId: (g.proveedorId as any)?._id ?? '',
    };
    this.editingGastoId.set(g._id);
  }

  cancelEditGasto() { this.editingGastoId.set(null); }

  saveEditGasto(g: Gasto) {
    if (!this.editGastoForm.monto || !this.editGastoForm.fecha) return;
    this.savingEditGasto.set(true);
    const data: any = {
      monto:       this.editGastoForm.monto,
      moneda:      this.editGastoForm.moneda,
      fecha:       this.editGastoForm.fecha,
      descripcion: this.editGastoForm.descripcion,
      notas:       this.editGastoForm.notas,
      proveedorId: this.editGastoForm.proveedorId || null,
    };
    this.gastoSvc.update(this.projectId, g._id, data).subscribe({
      next: updated => {
        this.gastos.update(l => l.map(x => x._id === g._id ? updated : x));
        this.editingGastoId.set(null);
        this.savingEditGasto.set(false);
      },
      error: () => this.savingEditGasto.set(false),
    });
  }

  // ── UI: Pago form ────────────────────────────────────────
  activePagoGastoId = signal<string | null>(null);
  pagoForm          = this.emptyPagoForm();
  savingPago        = signal(false);
  pagoError         = signal<string | null>(null);

  // ── UI: Editar pago existente ─────────────────────────────
  editingPagoId  = signal<string | null>(null);
  editPagoForm   = { referencia: '', notas: '' };
  savingEditPago = signal(false);

  // ── Constants for template ───────────────────────────────
  readonly metodoLabels = METODO_LABELS;
  readonly metodoIcons  = METODO_ICONS;
  readonly metodoHint   = METODO_HINT;
  readonly metodos = Object.keys(METODO_LABELS) as MetodoPago[];

  ngOnInit() {
    this.cfgSvc.getRubros().subscribe(d => this.rubros.set(d));
    this.cfgSvc.getSubrubros().subscribe(d => this.allSubrubros.set(d));
    this.reservaSvc.list(this.projectId).subscribe(d => this.reservas.set(d));
    this.solicitudSvc.list(this.projectId).subscribe(d => this.solicitudes.set(d));
    this.projectSvc.getById(this.projectId).subscribe(p => this.planObra.set(p.planObra ?? []));
    this.reload();
  }

  reload() {
    this.presSvc.list(this.projectId).subscribe(d => this.presupuestos.set(d));
    this.gastoSvc.list(this.projectId).subscribe(d => this.gastos.set(d));
  }

  // ── (expand replaced by master-detail selection) ─────────

  // ── Presupuesto CRUD ─────────────────────────────────────
  onPresRubroChange() {
    this.presForm.subrubroId = '';
    this.presFormSubs.set(this.allSubrubros().filter(s => s.rubroId._id === this.presForm.rubroId));
    this.presFormProvs.set([]);
  }

  onPresSubChange() {
    if (this.presForm.subrubroId)
      this.provSvc.list(this.presForm.subrubroId).subscribe(d => this.presFormProvs.set(d));
  }

  onPresFiles(e: Event) {
    const files = (e.target as HTMLInputElement).files;
    if (files) this.presForm.archivos = Array.from(files);
  }

  savePres() {
    if (!this.presForm.subrubroId || !this.presForm.monto) return;
    this.savingPres.set(true);
    const fd = new FormData();
    fd.append('subrubroId', this.presForm.subrubroId);
    fd.append('monto',      String(this.presForm.monto));
    fd.append('moneda',     this.presForm.moneda);
    if (this.presForm.proveedorId) fd.append('proveedorId', this.presForm.proveedorId);
    if (this.presForm.descripcion) fd.append('descripcion', this.presForm.descripcion);
    if (this.presForm.notas)       fd.append('notas',       this.presForm.notas);
    for (const f of this.presForm.archivos) fd.append('archivos', f);
    this.presSvc.create(this.projectId, fd).subscribe({
      next: item => {
        this.presupuestos.update(l => [item, ...l]);
        this.presForm = this.emptyPresForm();
        this.presFormSubs.set([]); this.presFormProvs.set([]);
        this.showPresForm.set(false);
        this.savingPres.set(false);
        this.selectedId.set(item._id); this.selectedType.set('pres');
      },
      error: () => this.savingPres.set(false),
    });
  }

  startEditPres(p: Presupuesto) {
    this.selectedId.set(p._id); this.selectedType.set('pres');
    this.editingPresId.set(p._id);
    this.editPresForm = {
      descripcion: p.descripcion || '', monto: p.monto,
      moneda: p.moneda, proveedorId: p.proveedorId?._id || '', notas: p.notas || '',
    };
    this.provSvc.list(p.subrubroId._id).subscribe(d => this.editProvs.set(d));
  }

  cancelEditPres() { this.editingPresId.set(null); }

  saveEditPres(id: string) {
    this.savingEdit.set(true);
    this.presSvc.update(this.projectId, id, this.editPresForm).subscribe({
      next: updated => {
        this.presupuestos.update(l => l.map(x => x._id === id ? updated : x));
        this.editingPresId.set(null);
        this.savingEdit.set(false);
      },
      error: () => this.savingEdit.set(false),
    });
  }

  aprobar(p: Presupuesto) {
    this.presSvc.patchEstado(this.projectId, p._id, 'aprobado').subscribe(updated => {
      this.presupuestos.update(l => l.map(x => x._id === p._id ? updated : x));
    });
  }

  rechazar(p: Presupuesto) {
    this.presSvc.patchEstado(this.projectId, p._id, 'rechazado').subscribe(updated => {
      this.presupuestos.update(l => l.map(x => x._id === p._id ? updated : x));
    });
  }

  reactivar(p: Presupuesto) {
    this.presSvc.patchEstado(this.projectId, p._id, 'pendiente').subscribe(updated => {
      this.presupuestos.update(l => l.map(x => x._id === p._id ? updated : x));
    });
  }

  async removePres(p: Presupuesto) {
    if (!await this.confirmSvc.confirm('Esta acción no se puede deshacer.', '¿Eliminar presupuesto?')) return;
    this.presSvc.remove(this.projectId, p._id).subscribe(() => {
      this.presupuestos.update(l => l.filter(x => x._id !== p._id));
      if (this.selectedId() === p._id) this.deselect();
    });
  }

  // ── Generar Gasto desde Presupuesto ─────────────────────
  tieneGasto(presId: string): boolean {
    return this.gastos().some(g => g.presupuestoId?._id === presId);
  }

  startGenerarGasto(p: Presupuesto) {
    this.selectedId.set(p._id); this.selectedType.set('pres');
    const today = this.todayISO();
    this.generarGastoForm = {
      fecha: today, comprobante: null,
      registrarPago: false,
      pagoFecha: today, pagoMonto: p.monto,
      pagoMetodo: 'transferencia',
      pagoReferencia: '', pagoNotas: '',
      pagoFuente: '', pagoReservaId: '',
    };
    this.generarError.set(null);
    this.generandoGastoPresId.set(p._id);
  }

  cancelGenerarGasto() {
    this.generandoGastoPresId.set(null);
    this.generarError.set(null);
  }

  onGenerarComprobante(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) this.generarGastoForm.comprobante = f;
  }

  confirmarGenerarGasto(p: Presupuesto) {
    if (!this.generarGastoForm.fecha) return;

    const { registrarPago, pagoFuente, pagoReservaId, pagoMonto } = this.generarGastoForm;

    // Validar saldo de reserva si se va a registrar un pago desde reserva
    if (registrarPago && pagoFuente === 'reserva' && pagoReservaId) {
      const rv = this.reservas().find(r => r._id === pagoReservaId);
      if (rv && saldoReserva(rv) < (pagoMonto ?? p.monto)) {
        this.generarError.set(`Saldo insuficiente en "${rv.nombre}": disponible ${this.fmt(saldoReserva(rv), rv.moneda)}`);
        return;
      }
    }

    this.generarError.set(null);
    this.savingGenerar.set(true);
    const fd = new FormData();
    fd.append('subrubroId',    p.subrubroId._id);
    fd.append('presupuestoId', p._id);
    fd.append('monto',         String(p.monto));
    fd.append('moneda',        p.moneda);
    fd.append('fecha',         this.generarGastoForm.fecha);
    if (p.proveedorId)                     fd.append('proveedorId', p.proveedorId._id);
    if (p.descripcion)                     fd.append('descripcion', p.descripcion);
    if (p.notas)                           fd.append('notas',       p.notas);
    if (this.generarGastoForm.comprobante) fd.append('comprobante', this.generarGastoForm.comprobante);

    this.gastoSvc.create(this.projectId, fd).subscribe({
      next: item => {
        this.gastos.update(l => [item, ...l]);

        // Registrar pago inmediato si el usuario lo activó
        if (registrarPago) {
          const { pagoFecha, pagoMonto: pm, pagoMetodo, pagoReferencia, pagoNotas } = this.generarGastoForm;
          const pagoBody: any = {
            fecha:      pagoFecha || this.generarGastoForm.fecha,
            monto:      pm ?? p.monto,
            metodoPago: pagoMetodo || 'efectivo',
          };
          if (pagoReferencia)                                pagoBody.referencia = pagoReferencia;
          if (pagoNotas)                                     pagoBody.notas      = pagoNotas;
          if (pagoFuente === 'reserva' && pagoReservaId)     pagoBody.reservaId  = pagoReservaId;
          this.gastoSvc.addPago(this.projectId, item._id, pagoBody).subscribe({
            next: updatedGasto => {
              this.gastos.update(l => l.map(g => g._id === item._id ? updatedGasto : g));
              if (pagoBody.reservaId) this.reservaSvc.list(this.projectId).subscribe(d => this.reservas.set(d));
            },
          });
        }

        // Quitar el presupuesto de la lista (el backend lo elimina/desasocia)
        this.presupuestos.update(l => l.filter(x => x._id !== p._id));
        this.savingGenerar.set(false);
        this.generandoGastoPresId.set(null);
        this.selectedId.set(item._id); this.selectedType.set('gasto');
      },
      error: () => this.savingGenerar.set(false),
    });
  }

  async removeGasto(g: Gasto) {
    if (!await this.confirmSvc.confirm('Esta acción no se puede deshacer.', '¿Eliminar este gasto?')) return;
    this.gastoSvc.remove(this.projectId, g._id).subscribe(() => {
      this.gastos.update(l => l.filter(x => x._id !== g._id));
      if (this.selectedId() === g._id) this.deselect();
    });
  }

  // ── Pagos ────────────────────────────────────────────────
  openPagoForm(g: Gasto) {
    this.selectedId.set(g._id); this.selectedType.set('gasto');
    this.activePagoGastoId.set(g._id);
    const restante = Math.max(0, g.monto - totalPagadoGasto(g));
    this.pagoForm = { ...this.emptyPagoForm(), monto: restante > 0 ? restante : (null as any) };
  }

  cancelPago() { this.activePagoGastoId.set(null); this.pagoError.set(null); }

  savePago(g: Gasto) {
    if (!this.pagoForm.monto || !this.pagoForm.fecha) return;

    if (this.pagoForm.reservaId) {
      const rv = this.reservas().find(r => r._id === this.pagoForm.reservaId);
      if (rv && saldoReserva(rv) < this.pagoForm.monto) {
        this.pagoError.set(`Saldo insuficiente en "${rv.nombre}": disponible ${this.fmt(saldoReserva(rv), rv.moneda)}`);
        return;
      }
    }

    this.pagoError.set(null);
    this.savingPago.set(true);
    this.gastoSvc.addPago(this.projectId, g._id, this.pagoForm).subscribe({
      next: updated => {
        this.gastos.update(l => l.map(x => x._id === g._id ? updated : x));
        if (this.pagoForm.reservaId) {
          this.reservaSvc.list(this.projectId).subscribe(d => this.reservas.set(d));
        }
        this.activePagoGastoId.set(null);
        this.pagoForm = this.emptyPagoForm();
        this.savingPago.set(false);
      },
      error: () => this.savingPago.set(false),
    });
  }

  reservaNombre(reservaId: string): string {
    return this.reservas().find(r => r._id === reservaId)?.nombre ?? '';
  }

  reservaSaldo(reservaId: string): string {
    const rv = this.reservas().find(r => r._id === reservaId);
    return rv ? this.fmt(saldoReserva(rv), rv.moneda) : '';
  }

  onAddComprobante(g: Gasto, event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.uploadingComprobanteId.set(g._id);
    this.gastoSvc.addComprobante(this.projectId, g._id, file).subscribe({
      next: updated => {
        this.gastos.update(l => l.map(x => x._id === g._id ? updated : x));
        this.uploadingComprobanteId.set(null);
        (event.target as HTMLInputElement).value = '';
      },
      error: () => this.uploadingComprobanteId.set(null),
    });
  }

  removeComprobanteFile(g: Gasto, comprobanteId: string) {
    this.gastoSvc.removeComprobante(this.projectId, g._id, comprobanteId).subscribe(updated =>
      this.gastos.update(l => l.map(x => x._id === g._id ? updated : x))
    );
  }

  deletePago(g: Gasto, pagoId: string) {
    // Guardar el pagoId eliminado para poder refrescar la reserva si correspondía
    const pagoEliminado = g.pagos.find(p => p._id === pagoId);
    this.gastoSvc.removePago(this.projectId, g._id, pagoId).subscribe({
      next: updated => {
        this.gastos.update(l => l.map(x => x._id === g._id ? updated : x));
        // Si el pago estaba vinculado a una reserva, refrescarla
        if (pagoEliminado?.reservaId) {
          this.reservaSvc.list(this.projectId).subscribe(d => this.reservas.set(d));
        }
      },
      error: () => {
        // No modificar el estado local si el backend falla
        console.error('Error al eliminar el pago');
      },
    });
  }

  // Ventana de edición: 7 días desde la fecha de pago
  canEditPago(pago: { fecha: string }): boolean {
    const [y, m, d] = pago.fecha.substring(0, 10).split('-').map(Number);
    const pagoDate = new Date(y, m - 1, d);
    pagoDate.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = (today.getTime() - pagoDate.getTime()) / (1000 * 60 * 60 * 24);
    return diffDays <= 7;
  }

  startEditPago(pago: { _id: string; referencia?: string; notas?: string }) {
    this.editingPagoId.set(pago._id);
    this.editPagoForm = { referencia: pago.referencia ?? '', notas: pago.notas ?? '' };
  }

  cancelEditPago() { this.editingPagoId.set(null); }

  saveEditPago(g: Gasto, pago: { _id: string }) {
    this.savingEditPago.set(true);
    this.gastoSvc.updatePago(this.projectId, g._id, pago._id, this.editPagoForm).subscribe({
      next: updated => {
        this.gastos.update(l => l.map(x => x._id === g._id ? updated : x));
        this.editingPagoId.set(null);
        this.savingEditPago.set(false);
      },
      error: () => this.savingEditPago.set(false),
    });
  }

  // Visualizar comprobante en nueva pestaña (con botón de imprimir)
  visualizarPago(g: Gasto, pago: import('../../../../shared/models/obra.model').Pago) {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(this.buildComprobanteHtml(g, pago));
    w.document.close();
  }

  // Descargar PDF directo para un pago específico
  descargarPago(g: Gasto, pago: import('../../../../shared/models/obra.model').Pago) {
    this.descargarPdf(this.buildComprobanteHtml(g, pago));
  }

  // ── Solicitudes de Cotización ────────────────────────────
  onSolicitudRubroChange() {
    this.solicitudForm.subrubroId = '';
    this.solicitudFormSubs.set(this.allSubrubros().filter(s => s.rubroId._id === this.solicitudForm.rubroId));
  }

  saveSolicitud() {
    if (!this.solicitudForm.subrubroId) return;
    this.savingSolicitud.set(true);
    const body: any = { subrubroId: this.solicitudForm.subrubroId };
    if (this.solicitudForm.descripcion) body.descripcion = this.solicitudForm.descripcion;
    this.solicitudSvc.create(this.projectId, body).subscribe({
      next: item => {
        this.solicitudes.update(l => [item, ...l]);
        this.solicitudForm = { rubroId: '', subrubroId: '', descripcion: '' };
        this.solicitudFormSubs.set([]);
        this.showSolicitudForm.set(false);
        this.savingSolicitud.set(false);
        this.selectedId.set(item._id); this.selectedType.set('sol');
      },
      error: () => this.savingSolicitud.set(false),
    });
  }

  openAddCotizacion(s: Solicitud) {
    this.selectedId.set(s._id); this.selectedType.set('sol');
    this.cotizacionForm = { proveedorId: '', monto: null, moneda: 'ARS', notas: '', plazo: '', condiciones: '', archivos: [], provs: [] };
    this.provSvc.list(s.subrubroId._id).subscribe(d => { this.cotizacionForm.provs = d; });
    this.addingCotizacionId.set(s._id);
  }

  cancelAddCotizacion() { this.addingCotizacionId.set(null); }

  onCotizacionFiles(e: Event) {
    const files = (e.target as HTMLInputElement).files;
    if (files) this.cotizacionForm.archivos = Array.from(files);
  }

  saveAddCotizacion(s: Solicitud) {
    this.savingCotizacion.set(true);
    const fd = new FormData();
    fd.append('moneda', this.cotizacionForm.moneda);
    if (this.cotizacionForm.proveedorId) fd.append('proveedorId', this.cotizacionForm.proveedorId);
    if (this.cotizacionForm.monto != null) fd.append('monto', String(this.cotizacionForm.monto));
    if (this.cotizacionForm.notas) fd.append('notas', this.cotizacionForm.notas);
    if (this.cotizacionForm.plazo) fd.append('plazo', this.cotizacionForm.plazo);
    if (this.cotizacionForm.condiciones) fd.append('condiciones', this.cotizacionForm.condiciones);
    for (const f of this.cotizacionForm.archivos) fd.append('archivos', f);
    this.solicitudSvc.addCotizacion(this.projectId, s._id, fd).subscribe({
      next: updated => {
        this.solicitudes.update(l => l.map(x => x._id === s._id ? updated : x));
        this.addingCotizacionId.set(null);
        this.savingCotizacion.set(false);
      },
      error: () => this.savingCotizacion.set(false),
    });
  }

  analizarConIA(s: Solicitud) {
    const payload = {
      solicitud: {
        subrubro: s.subrubroId.nombre,
        descripcion: s.descripcion ?? '',
      },
      cotizaciones: s.cotizaciones.map(c => ({
        proveedor: c.proveedorId?.nombre ?? 'Sin proveedor',
        monto: c.monto != null ? `${c.moneda} ${c.monto}` : 'Sin monto',
        plazo: c.plazo ?? '',
        condiciones: c.condiciones ?? '',
        notas: c.notas ?? '',
        archivos: c.archivos.map(f => f.originalName),
      })),
    };
    console.log('[IA] Payload listo para análisis:', JSON.stringify(payload, null, 2));
    // TODO: conectar con el servicio de IA
  }

  removeCotizacion(s: Solicitud, cotId: string) {
    this.solicitudSvc.removeCotizacion(this.projectId, s._id, cotId).subscribe(updated =>
      this.solicitudes.update(l => l.map(x => x._id === s._id ? updated : x))
    );
  }

  seleccionar(s: Solicitud, cotId: string) {
    this.solicitudSvc.seleccionar(this.projectId, s._id, cotId).subscribe(res => {
      this.solicitudes.update(l => l.map(x => x._id === s._id ? res.solicitud : x));
      this.presupuestos.update(l => [res.presupuesto, ...l]);
      this.deselect();
    });
  }

  // ── Plan de Obra: edición inline ─────────────────────────
  getPlanEntry(subId: string): PlanObraEntry | undefined {
    return this.planObra().find(p => p.subrubroId === String(subId));
  }

  startEditPlan(sub: Subrubro) {
    const subId = String(sub._id);
    const entry = this.getPlanEntry(subId);
    this.editPlanForm = { monto: entry?.monto ?? 0, moneda: entry?.moneda ?? 'ARS' };
    this.editingPlanSubId.set(subId);
  }

  cancelEditPlan() { this.editingPlanSubId.set(null); }

  savePlan(sub: Subrubro) {
    const subId = String(sub._id);
    // Guard: evitar doble llamada (Enter dispara blur)
    if (this.editingPlanSubId() !== subId || this.savingPlan()) return;
    const monto = this.editPlanForm.monto;
    if (monto == null || isNaN(+monto)) { this.cancelEditPlan(); return; }
    this.savingPlan.set(true);
    this.projectSvc.updatePlanObra(this.projectId, subId, +monto, this.editPlanForm.moneda).subscribe({
      next: entries => {
        this.planObra.set(entries);
        this.editingPlanSubId.set(null);
        this.savingPlan.set(false);
      },
      error: () => { this.editingPlanSubId.set(null); this.savingPlan.set(false); },
    });
  }

  finPct(pct: number | null): string {
    if (pct === null) return '—';
    return Math.round(pct) + '%';
  }

  finPctClass(pct: number | null): string {
    if (pct === null) return 'fin-pct--none';
    if (pct >= 100) return 'fin-pct--over';
    if (pct >= 75)  return 'fin-pct--warn';
    return 'fin-pct--ok';
  }

  rubroRawPct(ejecutado: number, plan: number): number {
    if (!plan) return 0;
    return Math.round(ejecutado / plan * 100);
  }

  // ── Helpers ─────────────────────────────────────────────
  totalPagadoG(g: Gasto)  { return totalPagadoGasto(g); }
  estadoG(g: Gasto)        { return estadoGasto(g); }
  pctPagado(g: Gasto)      { return g.monto ? Math.min(100, Math.round(totalPagadoGasto(g) / g.monto * 100)) : 0; }
  restante(g: Gasto)        { return Math.max(0, g.monto - totalPagadoGasto(g)); }

  getPresById(id: string | null)   { return id ? this.presupuestos().find(p => p._id === id) ?? null : null; }
  getGastoById(id: string | null)  { return id ? this.gastos().find(g => g._id === id) ?? null : null; }

  fileUrl(filename: string) { return `/uploads/${filename}`; }
  fileIcon(mime: string)    { return mime?.includes('pdf') ? '📄' : mime?.includes('sheet') || mime?.includes('excel') || mime?.includes('csv') ? '📊' : mime?.includes('word') ? '📝' : mime?.includes('image') ? '🖼️' : '📎'; }
  fmtSize(b: number)        { return b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.round(b / 1024) + ' KB'; }

  fmt(monto: number, moneda = 'ARS') {
    return `${moneda} ${monto.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
  }

  fmtFecha(fecha: string) {
    // Parsear como fecha local para evitar el desfase UTC-3 (new Date("YYYY-MM-DD") lo toma como UTC)
    const [y, m, d] = fecha.substring(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  todayISO() { return new Date().toISOString().substring(0, 10); }

  // Visualizar comprobante general del gasto en nueva pestaña
  visualizarComprobante(g: Gasto) {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(this.buildComprobanteHtml(g));
    w.document.close();
  }

  // Descargar PDF directo del gasto completo
  imprimirComprobante(g: Gasto) {
    this.descargarPdf(this.buildComprobanteHtml(g));
  }

  // ── Descarga PDF directa (sin diálogo de impresión) ─────
  private async descargarPdf(htmlStr: string): Promise<void> {
    const parser  = new DOMParser();
    const parsed  = parser.parseFromString(htmlStr, 'text/html');
    const filename = (parsed.querySelector('title')?.textContent ?? 'Comprobante') + '.pdf';

    // Montar estilos + .doc en un contenedor oculto fuera de la pantalla
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position:fixed;top:-99999px;left:0;width:680px;background:#fff;z-index:-1';

    const styleTag = document.createElement('style');
    styleTag.textContent = parsed.querySelector('style')?.textContent ?? '';
    wrapper.appendChild(styleTag);

    const docEl = parsed.querySelector('.doc') as HTMLElement;
    docEl.style.borderRadius = '0';
    docEl.style.boxShadow    = 'none';
    docEl.style.border       = 'none';
    docEl.style.maxWidth     = '100%';
    wrapper.appendChild(docEl);
    document.body.appendChild(wrapper);

    // Esperar un tick para que el DOM pinte
    await new Promise(r => setTimeout(r, 80));

    const html2canvas = (await import('html2canvas')).default;
    const { jsPDF }   = await import('jspdf');

    const canvas = await html2canvas(docEl, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
    });

    document.body.removeChild(wrapper);

    const imgData  = canvas.toDataURL('image/png');
    const pdf      = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
    const pageW    = pdf.internal.pageSize.getWidth();
    const pageH    = pdf.internal.pageSize.getHeight();
    // scale=2 → cada px CSS = 2px canvas → dividir por 2 para mm reales
    const mmPerPx  = pageW / (canvas.width / 2);
    const totalH   = (canvas.height / 2) * mmPerPx;

    let yRendered = 0;
    while (yRendered < totalH) {
      if (yRendered > 0) pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, -yRendered, pageW, totalH);
      yRendered += pageH;
    }

    pdf.save(filename);
  }

  private buildComprobanteHtml(g: Gasto, heroPago?: import('../../../../shared/models/obra.model').Pago): string {
    const fmtM = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 0 });
    const fmtFechaLocal = (f: string) => {
      const [y, m, d] = f.substring(0, 10).split('-').map(Number);
      return new Date(y, m - 1, d).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
    };
    const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

    const fechaEmision = new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
    const rubroNombre  = g.subrubroId.rubroId?.nombre ?? '';
    const logoUrl = `${window.location.origin}/assets/logo%20brume%20vector2.png`;

    const metodoLabel: Record<string, string> = {
      efectivo: 'Efectivo', transferencia: 'Transferencia', cheque: 'Cheque',
      tarjeta_credito: 'Tarjeta crédito', tarjeta_debito: 'Tarjeta débito',
    };

    // El código interno del subrubro no se muestra en el comprobante

    // Si se imprime un pago específico, cortar el historial hasta ese pago (inclusive)
    // y recalcular los totales al momento de ese pago — no mostrar pagos futuros
    const lastPago = heroPago ?? (g.pagos.length ? g.pagos[g.pagos.length - 1] : null);
    const heroPagoIdx = heroPago ? g.pagos.findIndex(p => p._id === heroPago._id) : -1;
    const pagosHasta  = heroPagoIdx >= 0 ? g.pagos.slice(0, heroPagoIdx + 1) : g.pagos;

    const totalPag = pagosHasta.reduce((s, p) => s + p.monto, 0);
    const restante = Math.max(0, g.monto - totalPag);

    // Estado al momento del comprobante (no el estado actual del gasto)
    const estadoSnap = totalPag === 0 ? 'sin_pago' : totalPag < g.monto ? 'parcial' : 'pagado';
    const eColor = estadoSnap === 'pagado' ? '#166534' : estadoSnap === 'parcial' ? '#92400e' : '#666';
    const eBg    = estadoSnap === 'pagado' ? '#f0fdf4' : estadoSnap === 'parcial' ? '#fffbeb' : '#f5f5f5';
    const eTxt   = estadoSnap === 'pagado' ? 'Pagado' : estadoSnap === 'parcial' ? 'Pago parcial' : 'Pendiente';

    const lastFecha = lastPago ? fmtFechaLocal(lastPago.fecha) : fechaEmision;

    // Nombre del archivo PDF (lo usa el browser como título de pestaña → nombre al guardar)
    const provSlug  = (g.proveedorId?.nombre ?? 'SinProveedor').replace(/\s+/g, '_');
    const fechaSlug = (lastPago?.fecha ?? new Date().toISOString()).substring(0, 10);
    const pdfTitle  = `Comprobante_${provSlug}_${fechaSlug}`;

    const histRows = [...pagosHasta].reverse().map(p => `
      <tr>
        <td>${fmtFechaLocal(p.fecha)}</td>
        <td>${metodoLabel[p.metodoPago] ?? p.metodoPago}</td>
        <td>${p.notas ?? '—'}</td>
        <td class="tr">${g.moneda} ${fmtM(p.monto)}</td>
      </tr>`).join('');
    const histSection = pagosHasta.length ? `
      <div class="sec">
        <div class="sec-lbl">Historial de pagos</div>
        <table class="tbl">
          <thead><tr><th>Fecha</th><th>Método</th><th>Observación</th><th class="tr">Monto</th></tr></thead>
          <tbody>${histRows}</tbody>
        </table>
      </div>` : '';

    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>${pdfTitle}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Inter',system-ui,sans-serif;background:#f2f2f0;color:#111;-webkit-font-smoothing:antialiased}

  /* ── Top bar ── */
  .bar{position:fixed;top:0;left:0;right:0;height:48px;background:#111;display:flex;align-items:center;
    justify-content:space-between;padding:0 1.75rem;z-index:10}
  .bar-brand{color:#fff;font-size:0.68rem;font-weight:800;letter-spacing:0.16em;text-transform:uppercase}
  .bar-actions{display:flex;gap:0.4rem}
  .btn{padding:0.32rem 0.85rem;border-radius:5px;font-size:0.72rem;font-weight:600;font-family:inherit;cursor:pointer;border:none;line-height:1}
  .btn-sec{background:transparent;color:rgba(255,255,255,0.6);border:1px solid rgba(255,255,255,0.18)}
  .btn-sec:hover{color:#fff;border-color:rgba(255,255,255,0.4)}
  .btn-pri{background:#fff;color:#111}
  .btn-pri:hover{background:#efefef}

  /* ── Page wrapper ── */
  .page{padding:60px 1.25rem 3rem;display:flex;justify-content:center;min-height:100vh}
  .doc{background:#fff;width:100%;max-width:620px;border-radius:12px;
    box-shadow:0 1px 14px rgba(0,0,0,0.08);border:1px solid #e4e4e4;height:fit-content;overflow:hidden}

  /* ── Doc header ── */
  .doc-head{display:flex;justify-content:space-between;align-items:flex-start;
    padding:1.5rem 2rem 1.25rem;border-bottom:1px solid #f0f0f0}
  .brand-logo{height:26px;width:auto;display:block;margin-bottom:0.3rem}
  .brand-sub{font-size:0.58rem;color:#ccc;font-weight:400;letter-spacing:0.02em}
  .doc-meta{text-align:right}
  .doc-title{font-size:0.68rem;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;color:#111;margin-bottom:0.22rem}
  .doc-info{font-size:0.65rem;color:#bbb;line-height:1.6}
  .doc-project{font-size:0.7rem;font-weight:600;color:#555;margin-top:0.12rem}

  /* ── Sections ── */
  .sec{padding:1.25rem 2rem;border-bottom:1px solid #f0f0f0}
  .sec:last-child{border-bottom:none}
  .sec-lbl{font-size:0.55rem;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#ccc;margin-bottom:0.75rem}

  /* ── Concepto ── */
  .concept-row{display:flex;justify-content:space-between;align-items:flex-start;gap:1rem}
  .concept-rubro{display:inline-block;font-size:0.57rem;font-weight:700;text-transform:uppercase;
    letter-spacing:0.1em;color:#888;background:#f4f4f2;padding:0.16rem 0.5rem;
    border-radius:20px;margin-bottom:0.45rem}
  .concept-nombre{font-size:1rem;font-weight:800;color:#111;line-height:1.2;margin-bottom:0.3rem}
  .concept-codigo{font-size:0.65rem;color:#ccc;font-weight:400;margin-left:0.3rem}
  .concept-prov{font-size:0.73rem;color:#777;margin-top:0.18rem}
  .concept-prov strong{font-weight:600;color:#444}
  .concept-desc{font-size:0.72rem;color:#999;line-height:1.5;margin-top:0.18rem}
  .concept-notes{font-size:0.66rem;color:#bbb;font-style:italic;margin-top:0.1rem}
  .estado-pill{display:inline-flex;align-items:center;gap:0.28rem;font-size:0.58rem;font-weight:700;
    letter-spacing:0.08em;text-transform:uppercase;padding:0.2rem 0.6rem;border-radius:20px;
    white-space:nowrap;flex-shrink:0;margin-top:0.15rem}
  .estado-dot{width:4px;height:4px;border-radius:50%;background:currentColor}

  /* ── Pago hero ── */
  .pago-row{display:flex;justify-content:space-between;align-items:center;gap:1rem;padding:1.25rem 2rem;border-bottom:1px solid #f0f0f0}
  .pago-lbl{font-size:0.55rem;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#ccc;margin-bottom:0.28rem}
  .pago-amount{font-size:1.9rem;font-weight:900;color:#111;font-variant-numeric:tabular-nums;letter-spacing:-0.02em;line-height:1}
  .pago-right{text-align:right;flex-shrink:0}
  .pago-fecha{font-size:0.78rem;font-weight:600;color:#444;margin-bottom:0.18rem}
  .pago-metodo{font-size:0.68rem;color:#999}
  .pago-extra{display:flex;flex-direction:column;gap:0.22rem;padding:0.75rem 2rem;
    border-bottom:1px solid #f0f0f0;background:#fafafa}
  .pago-extra-row{display:flex;align-items:baseline;gap:0.5rem;font-size:0.74rem}
  .pago-extra-lbl{font-size:0.57rem;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;
    color:#bbb;white-space:nowrap;flex-shrink:0;padding-top:0.05rem}
  .pago-extra-val{color:#444;line-height:1.4}

  /* ── Resumen ── */
  .resumen-grid{display:grid;grid-template-columns:1fr auto;row-gap:0.3rem;column-gap:2rem}
  .r-label{font-size:0.74rem;color:#aaa}
  .r-val{font-size:0.74rem;font-weight:600;font-variant-numeric:tabular-nums;color:#888;text-align:right}
  .r-label--main{color:#444;font-weight:500}
  .r-val--main{color:#111;font-size:0.82rem;font-weight:700}
  .r-divider{grid-column:1/-1;height:1px;background:#f4f4f4;margin:0.2rem 0}

  /* ── Historial table ── */
  .tbl{width:100%;border-collapse:collapse}
  .tbl th{text-align:left;font-size:0.54rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;
    color:#ccc;padding:0 0.35rem 0.55rem;border-bottom:1px solid #f0f0f0}
  .tbl td{font-size:0.72rem;padding:0.4rem 0.35rem;color:#999;border-bottom:1px solid #f8f8f8;font-variant-numeric:tabular-nums}
  .tbl tr:last-child td{border-bottom:none}
  .tr{text-align:right;font-weight:600;color:#555!important}

  /* ── Firmas ── */
  .sigs{display:grid;grid-template-columns:1fr 1fr;gap:2.5rem;padding:1.5rem 2rem 1.25rem;border-bottom:1px solid #f0f0f0}
  .sig-space{height:2.5rem}
  .sig-line{height:1px;background:#ddd;margin-bottom:0.4rem}
  .sig-name{font-size:0.76rem;font-weight:700;color:#111}
  .sig-role{font-size:0.6rem;color:#bbb;margin-top:0.08rem}

  /* ── Footer ── */
  .doc-foot{padding:0.7rem 2rem;background:#fafafa;font-size:0.55rem;color:#ccc;
    text-align:center;letter-spacing:0.04em}

  @media print{
    .bar{display:none!important}
    body{background:#fff}
    .page{padding:0}
    .doc{box-shadow:none;border:none;border-radius:0;max-width:100%}
    @page{margin:1.5cm 2cm;size:A4}
  }
</style>
</head>
<body>

<div class="bar">
  <span class="bar-brand">Brumelab Arch</span>
  <div class="bar-actions">
    <button class="btn btn-sec" onclick="window.close()">Cerrar</button>
    <button class="btn btn-pri" onclick="window.print()">Imprimir / PDF</button>
  </div>
</div>

<div class="page"><div class="doc">

  <!-- Header -->
  <div class="doc-head">
    <div>
      <img src="${logoUrl}" alt="Brumelab Arch" class="brand-logo" />
    </div>
    <div class="doc-meta">
      <div class="doc-title">Comprobante de pago</div>
      <div class="doc-info">Emitido el ${fechaEmision}</div>
      ${this.projectName ? `<div class="doc-project">${this.projectName}</div>` : ''}
    </div>
  </div>

  <!-- Concepto -->
  <div class="sec">
    <div class="concept-row">
      <div>
        ${rubroNombre ? `<span class="concept-rubro">${rubroNombre}</span>` : ''}
        <div class="concept-nombre">${g.subrubroId.nombre}</div>
        ${g.proveedorId ? `<div class="concept-prov">Proveedor · <strong>${g.proveedorId.nombre}</strong></div>` : ''}
      </div>
      <div class="estado-pill" style="color:${eColor};background:${eBg}">
        <span class="estado-dot"></span>${eTxt}
      </div>
    </div>
  </div>

  <!-- Pago hero -->
  <div class="pago-row">
    <div>
      <div class="pago-lbl">${lastPago ? 'Este pago' : 'Total del gasto'}</div>
      <div class="pago-amount">${g.moneda} ${fmtM(lastPago ? lastPago.monto : g.monto)}</div>
    </div>
    <div class="pago-right">
      <div class="pago-fecha">${lastFecha}</div>
      ${lastPago ? `<div class="pago-metodo">${metodoLabel[lastPago.metodoPago] ?? lastPago.metodoPago}</div>` : ''}
    </div>
  </div>
  ${lastPago?.notas ? `
  <div class="pago-extra">
    <div class="pago-extra-row"><span class="pago-extra-lbl">Observación</span><span class="pago-extra-val">${lastPago.notas}</span></div>
  </div>` : ''}

  <!-- Resumen -->
  <div class="sec">
    <div class="sec-lbl">Resumen del gasto</div>
    <div class="resumen-grid">
      <span class="r-label r-label--main">Total del gasto</span>
      <span class="r-val r-val--main">${g.moneda} ${fmtM(g.monto)}</span>
      ${totalPag > 0 ? `<div class="r-divider"></div>
      <span class="r-label">Pagado acumulado</span>
      <span class="r-val">${g.moneda} ${fmtM(totalPag)}</span>` : ''}
      ${restante > 0 ? `
      <span class="r-label">Saldo pendiente</span>
      <span class="r-val">${g.moneda} ${fmtM(restante)}</span>` : ''}
    </div>
  </div>

  <!-- Historial -->
  ${histSection}

  <!-- Firmas -->
  <div class="sigs">
    <div>
      <div class="sig-space"></div>
      <div class="sig-line"></div>
      <div class="sig-name">Brumelab Arch</div>
      <div class="sig-role">Firma del Emisor</div>
    </div>
    <div>
      <div class="sig-space"></div>
      <div class="sig-line"></div>
      <div class="sig-name">${g.proveedorId?.nombre ?? 'Proveedor'}</div>
      <div class="sig-role">Firma del Receptor</div>
    </div>
  </div>

  <!-- Footer -->
  <div class="doc-foot">
    Emitido el ${fechaEmision} &middot; Brumelab Arch &middot; Conservar original firmado por ambas partes
  </div>

</div></div>
</body>
</html>`;
  }

  private emptyPresForm() {
    return { rubroId: '', subrubroId: '', proveedorId: '', descripcion: '', monto: null as any, moneda: 'ARS' as Moneda, notas: '', archivos: [] as File[] };
  }

  onPagoFuenteChange() {
    if (this.pagoForm.fuente !== 'reserva') this.pagoForm.reservaId = '';
    this.pagoError.set(null);
  }

  private emptyPagoForm() {
    return {
      fecha:      this.todayISO(),
      monto:      null as any,
      metodoPago: 'transferencia' as MetodoPago | '',
      referencia: '',
      notas:      '',
      reservaId:  '',
      fuente:     'cliente' as '' | 'reserva' | 'cliente',
    };
  }
}
