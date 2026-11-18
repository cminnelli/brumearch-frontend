import { Component, Input, computed, inject, signal } from '@angular/core';
import { MonedaService } from '../../../core/services/moneda.service';
import { ResumenAportes } from '../../models/gasto-vario.model';

/**
 * Cuánto pagó el propietario hasta hoy. No cruza con gastos: el propietario no ve costos ni margen.
 */
@Component({
  selector: 'app-aportes-resumen',
  standalone: true,
  templateUrl: './aportes-resumen.component.html',
  styleUrl: './aportes-resumen.component.scss',
})
export class AportesResumenComponent {
  m = inject(MonedaService);
  private _r = signal<ResumenAportes | null>(null);
  @Input({ required: true }) set resumen(r: ResumenAportes | null) { this._r.set(r); }
  /** Texto de ayuda según quién lo mira. */
  @Input() paraPropietario = false;

  r = computed(() => this._r());
  vista = computed(() => this.m.vista());
  otra = computed(() => (this.m.vista() === 'ARS' ? 'USD' : 'ARS') as 'ARS' | 'USD');

  /** Valor de un par {ARS, USD} en la moneda elegida, y su equivalente en la otra. */
  /** Sin ningún tipo de cambio no se puede pasar de una moneda a otra: se muestra "—" en vez de un 0 engañoso. */
  sinConversion = computed(() => { const r = this._r(); return !!r && r.tcReferencia === null && r.sinTC > 0 && !this.m.tcProyecto(); });
  principal(e: { ARS: number; USD: number }) { return this.vista() === 'USD' && this.sinConversion() ? '—' : this.m.fmt(e[this.vista()], this.vista()); }
  secundario(e: { ARS: number; USD: number }) { return this.sinConversion() ? '—' : this.m.fmt(e[this.otra()], this.otra()); }

  ultimo() { const f = this._r()?.aportes?.[0]?.fecha; return f ? new Date(f).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' }) : ''; }
  /** Un pago = una barra (en orden cronológico), para ver el ritmo de cobros de un vistazo. */
  barras = computed(() => {
    const r = this._r(); if (!r) return [];
    const v = this.vista();
    const l = [...r.aportes].sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime()).slice(-12);
    const max = Math.max(1, ...l.map(a => a.equiv[v]));
    return l.map(a => ({ id: a._id, alto: Math.max(8, a.equiv[v] / max * 100), mes: new Date(a.fecha).toLocaleDateString('es-AR', { month: 'short', timeZone: 'UTC' }).replace('.', ''),
      titulo: `${new Date(a.fecha).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })} · ${this.m.fmt(a.equiv[v], v)}` }));
  });
  sinAportes = computed(() => (this._r()?.aportes.length ?? 0) === 0);
}
