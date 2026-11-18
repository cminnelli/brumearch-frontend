import { Component, EventEmitter, Input, OnChanges, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MonedaService } from '../../../core/services/moneda.service';

/**
 * Campo "Tipo de cambio" para los formularios con montos.
 * Se completa solo con el del proyecto (o el sugerido) y se puede cambiar a mano.
 * Con la moneda en pesos es opcional: sirve para ver el monto en dólares.
 */
@Component({
  selector: 'app-tipo-cambio',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="tcf">
      <label [for]="id">Tipo de cambio <span class="tcf__opt">($ por dólar{{ moneda === 'ARS' ? ', opcional' : '' }})</span></label>
      <div class="tcf__row">
        <input [id]="id" type="number" min="0" step="any" [ngModel]="valor" (ngModelChange)="cambiar($event)" [name]="id" placeholder="Ej: 1450" />
        @if (m.sugerido(); as s) { <button type="button" class="tcf__sug" (click)="cambiar(s.valor)" [title]="'Cotización ' + s.nombre + ' de hoy'">Sugerido: $ {{ s.valor.toLocaleString('es-AR') }}</button> }
      </div>
      @if (equivale) { <small class="tcf__eq">{{ equivale }}</small> }
    </div>
  `,
  styles: [`
    .tcf { display: flex; flex-direction: column; gap: .3rem; }
    label { font-size: var(--text-xs); font-weight: 600; text-transform: uppercase; letter-spacing: .06em; color: var(--c-text-sub); }
    .tcf__opt { font-weight: 400; text-transform: none; letter-spacing: 0; color: var(--c-text-muted); }
    .tcf__row { display: flex; align-items: center; gap: .6rem; flex-wrap: wrap; }
    input { width: 130px; font: inherit; font-size: var(--text-sm); padding: .55rem .7rem; border: 1px solid var(--c-border-strong); border-radius: var(--radius-sm); background: var(--c-bg); color: var(--c-text); height: 38px; box-sizing: border-box; }
    input:focus-visible { outline: 2px solid var(--c-brand); outline-offset: 1px; }
    .tcf__sug { all: unset; cursor: pointer; font-size: var(--text-xs); font-weight: 600; color: var(--c-brand); &:hover { text-decoration: underline; } &:focus-visible { outline: 2px solid var(--c-brand); } }
    .tcf__eq { font-size: var(--text-sm); color: var(--c-text-sub); }
  `],
})
export class TipoCambioComponent implements OnChanges {
  m = inject(MonedaService);
  @Input() id = 'tc';
  @Input() moneda = 'ARS';
  @Input() monto: number | null = null;
  @Input() valor: number | null = null;
  @Output() valorChange = new EventEmitter<number | null>();

  ngOnChanges() {
    this.m.cargarSugerido();
    // En moneda extranjera, completar con el del proyecto si todavía no hay uno
    if (!this.valor && this.moneda !== 'ARS') { const base = this.m.tcProyecto() ?? this.m.sugerido()?.valor ?? null; if (base) { this.valor = base; this.valorChange.emit(base); } }
  }
  cambiar(v: number | null) { this.valor = v; this.valorChange.emit(v); }

  get equivale(): string {
    const tc = this.valor ?? this.m.tcProyecto();
    if (!this.monto || !tc) return '';
    return this.moneda === 'ARS' ? `Equivale a US$ ${Math.round(this.monto / tc).toLocaleString('es-AR')}` : `Equivale a $ ${Math.round(this.monto * tc).toLocaleString('es-AR')}`;
  }
}
