import { Component, Input, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ReservaService } from '../../../../core/services/reserva.service';
import {
  Reserva, Movimiento, Moneda, TipoMovimiento, MetodoMovimiento,
  saldoReserva, ingresadoReserva, egresadoReserva,
} from '../../../../shared/models/obra.model';

@Component({
  selector: 'app-caja',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './caja.component.html',
  styleUrl: './caja.component.scss',
})
export class CajaComponent implements OnInit {
  @Input({ required: true }) projectId!: string;

  private reservaSvc = inject(ReservaService);

  reservas  = signal<Reserva[]>([]);
  loading   = signal(true);

  // Nueva reserva
  showReservaForm = signal(false);
  savingReserva   = signal(false);
  reservaForm = this.emptyReservaForm();

  // Reserva seleccionada (panel de detalle)
  selectedReservaId  = signal<string | null>(null);
  activeReserva      = computed(() => this.reservas().find(r => r._id === this.selectedReservaId()) ?? null);

  // Movimiento por reserva
  activeMovReservaId = signal<string | null>(null);
  savingMov          = signal(false);
  movForm = this.emptyMovForm();

  // Editar reserva (nombre)
  editingReservaId = signal<string | null>(null);
  editReservaForm = { nombre: '', descripcion: '' };

  readonly MONEDA_OPTS: Moneda[] = ['ARS', 'USD', 'EUR'];

  // Expose helpers to template
  saldo      = saldoReserva;
  ingresado  = ingresadoReserva;
  egresado   = egresadoReserva;

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    this.reservaSvc.list(this.projectId).subscribe({
      next: data => { this.reservas.set(data); this.loading.set(false); },
      error: ()   => this.loading.set(false),
    });
  }

  // ── Reserva CRUD ─────────────────────────────────
  saveReserva() {
    if (!this.reservaForm.nombre.trim()) return;
    this.savingReserva.set(true);
    this.reservaSvc.create(this.projectId, this.reservaForm).subscribe({
      next: r => {
        this.reservas.update(list => [...list, r]);
        this.savingReserva.set(false);
        this.showReservaForm.set(false);
        this.reservaForm = this.emptyReservaForm();
        this.selectedReservaId.set(r._id);
      },
      error: () => this.savingReserva.set(false),
    });
  }

  startEditReserva(r: Reserva) {
    this.editingReservaId.set(r._id);
    this.editReservaForm = { nombre: r.nombre, descripcion: r.descripcion || '' };
  }

  saveEditReserva(id: string) {
    this.reservaSvc.update(this.projectId, id, this.editReservaForm).subscribe(updated => {
      this.reservas.update(list => list.map(r => r._id === id ? updated : r));
      this.editingReservaId.set(null);
    });
  }

  removeReserva(id: string, nombre: string) {
    if (!confirm(`¿Eliminar la reserva "${nombre}" y todos sus movimientos?`)) return;
    this.reservaSvc.remove(this.projectId, id).subscribe(() => {
      this.reservas.update(list => list.filter(r => r._id !== id));
    });
  }

  // ── Movimientos ──────────────────────────────────
  openMovForm(reservaId: string, tipo: TipoMovimiento) {
    this.movForm = this.emptyMovForm();
    this.movForm.tipo = tipo;
    this.activeMovReservaId.set(reservaId);
    this.selectedReservaId.set(reservaId);
  }

  closeMovForm() {
    this.activeMovReservaId.set(null);
    this.movForm = this.emptyMovForm();
  }

  saveMov() {
    const id = this.activeMovReservaId();
    if (!id || !this.movForm.monto || !this.movForm.fecha) return;
    this.savingMov.set(true);
    const body: Partial<Movimiento> = {
      tipo:     this.movForm.tipo as TipoMovimiento,
      monto:    +this.movForm.monto,
      fecha:    this.movForm.fecha,
      concepto: this.movForm.concepto || undefined,
      origen:   this.movForm.tipo === 'ingreso' ? (this.movForm.origen || undefined) : undefined,
      destino:  this.movForm.tipo === 'egreso'  ? (this.movForm.destino || undefined) : undefined,
      notas:    this.movForm.notas || undefined,
    };
    this.reservaSvc.addMovimiento(this.projectId, id, body).subscribe({
      next: updated => {
        this.reservas.update(list => list.map(r => r._id === id ? updated : r));
        this.savingMov.set(false);
        this.closeMovForm();
      },
      error: () => this.savingMov.set(false),
    });
  }

  removeMov(reservaId: string, movId: string) {
    if (!confirm('¿Eliminar este movimiento?')) return;
    this.reservaSvc.removeMovimiento(this.projectId, reservaId, movId).subscribe(updated => {
      this.reservas.update(list => list.map(r => r._id === reservaId ? updated : r));
    });
  }

  // ── UI helpers ───────────────────────────────────
  selectReserva(id: string) {
    this.selectedReservaId.set(this.selectedReservaId() === id ? null : id);
    this.closeMovForm();
    this.editingReservaId.set(null);
  }

  movimientos(r: Reserva) {
    return [...r.movimientos].sort(
      (a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()
    );
  }

  fmt(monto: number, moneda: Moneda) {
    return moneda + ' ' + monto.toLocaleString('es-AR', { maximumFractionDigits: 0 });
  }

  fmtFecha(fecha: string) {
    return new Date(fecha).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  }

  cancelNewReserva() {
    this.showReservaForm.set(false);
    this.reservaForm = this.emptyReservaForm();
  }

  private emptyReservaForm() {
    return { nombre: '', moneda: 'ARS' as Moneda, descripcion: '' };
  }

  private emptyMovForm() {
    return {
      tipo:     'ingreso' as TipoMovimiento,
      monto:    null as number | null,
      fecha:    new Date().toISOString().substring(0, 10),
      concepto: '',
      origen:   '',
      destino:  '',
      notas:    '',
      metodo:   '' as MetodoMovimiento | '',
    };
  }
}
