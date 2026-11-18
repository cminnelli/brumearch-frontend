import { Injectable, inject, signal, computed } from '@angular/core';
import { DolarService } from './dolar.service';

export type Vista = 'ARS' | 'USD';

/**
 * Moneda de visualización. Los montos se cargan en la moneda que corresponda (pesos por defecto),
 * y toda la pantalla se puede ver en pesos o en dólares.
 * El tipo de cambio lo pone una persona: uno por movimiento y uno del proyecto como respaldo.
 */
@Injectable({ providedIn: 'root' })
export class MonedaService {
  private dolar = inject(DolarService);

  /** En qué moneda se muestra todo. Se recuerda. */
  vista = signal<Vista>((() => { try { return (localStorage.getItem('moneda_vista') as Vista) || 'ARS'; } catch { return 'ARS' as Vista; } })());
  /** Pesos por dólar del proyecto abierto (manual). */
  tcProyecto = signal<number | null>(null);
  /** Cotización sugerida (dolarapi), solo para ayudar a completar. */
  sugerido = signal<{ valor: number; nombre: string } | null>(null);

  /** El tipo de cambio que se usa cuando un movimiento no trae el suyo. */
  tcBase = computed(() => this.tcProyecto());

  setVista(v: Vista) { this.vista.set(v); try { localStorage.setItem('moneda_vista', v); } catch { /* sin storage */ } }

  cargarSugerido() {
    if (this.sugerido()) return;
    this.dolar.getRates().subscribe({
      next: rates => {
        const r = rates.find(x => x.casa === 'blue' && x.venta) ?? rates.find(x => x.venta);
        if (r?.venta) this.sugerido.set({ valor: r.venta, nombre: r.nombre });
      },
      error: () => { /* sin conexión: queda sin sugerido */ },
    });
  }

  /** Tipo de cambio efectivo para un movimiento: el suyo, o el del proyecto. null si no hay ninguno. */
  tc(tcMovimiento?: number | null): number | null {
    return tcMovimiento && tcMovimiento > 0 ? tcMovimiento : this.tcBase();
  }

  /** ¿Se puede pasar de una moneda a la otra? (hay tipo de cambio) */
  puedeConvertir(moneda: string, tcMovimiento?: number | null): boolean {
    return moneda === this.vista() || this.tc(tcMovimiento) !== null;
  }

  /** Convierte un monto a la moneda de visualización. null si hace falta un tipo de cambio que no hay. */
  aVista(monto: number, moneda: string, tcMovimiento?: number | null): number | null {
    const v = this.vista();
    if (moneda === v) return monto;
    const tc = this.tc(tcMovimiento);
    if (!tc) return null;
    return v === 'ARS' ? monto * tc : monto / tc;
  }

  /** Convierte a una moneda puntual (pesos o dólares). */
  a(destino: Vista, monto: number, moneda: string, tcMovimiento?: number | null): number | null {
    if (moneda === destino) return monto;
    const tc = this.tc(tcMovimiento);
    if (!tc) return null;
    return destino === 'ARS' ? monto * tc : monto / tc;
  }

  fmt(monto: number | null, moneda: string): string {
    // mismo formato que el resto de la app: ARS 1.000.000 · USD 1.000
    return monto === null ? '—' : `${moneda} ${Math.round(monto).toLocaleString('es-AR')}`;
  }
}
