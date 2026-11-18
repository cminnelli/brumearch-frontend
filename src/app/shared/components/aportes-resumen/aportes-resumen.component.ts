import { Component, Input, computed, inject, signal } from '@angular/core';
import { MonedaService } from '../../../core/services/moneda.service';
import { ResumenAportes } from '../../models/gasto-vario.model';

const COLORES = ['#ff4f00', '#111111', '#3a6a99', '#17803d', '#b45309', '#7a7a7a', '#c0261c', '#9aa0a6'];

/**
 * Resumen de aportes del propietario: cuánto puso, en qué se usó y cuánto queda.
 * Lo usan el equipo y el propio propietario (portal del cliente).
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

  rubros = computed(() => {
    const r = this._r(); if (!r) return [];
    const v = this.vista();
    return r.porRubro.filter(x => x[v] > 0).sort((a, b) => b[v] - a[v]).map((x, i) => ({ ...x, valor: x[v], color: COLORES[i % COLORES.length] }));
  });
  totalRubros = computed(() => this.rubros().reduce((s, x) => s + x.valor, 0));
  pct(x: { valor: number }) { const t = this.totalRubros(); return t ? Math.round(x.valor / t * 100) : 0; }
  ancho(x: { valor: number }) { const t = this.totalRubros(); return t ? x.valor / t * 100 : 0; }
  saldoNegativo = computed(() => { const r = this._r(); return !!r && r.saldo[this.vista()] < 0; });
  sinAportes = computed(() => (this._r()?.aportes.length ?? 0) === 0);
}
