import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { AporteService } from '../../../../core/services/aporte.service';
import { MonedaService } from '../../../../core/services/moneda.service';
import { Aporte, ResumenAportes } from '../../../../shared/models/gasto-vario.model';
import { AportesResumenComponent } from '../../../../shared/components/aportes-resumen/aportes-resumen.component';
import { MonedaToggleComponent } from '../../../../shared/components/moneda-toggle/moneda-toggle.component';
import { fileUrl } from '../../../../shared/utils/file-url';

/** Vista del propietario: cuánto aportó, en qué se usó y cuánto saldo queda. Solo lectura. */
@Component({
  selector: 'app-client-aportes',
  standalone: true,
  imports: [AportesResumenComponent, MonedaToggleComponent],
  template: `
    <div class="ca">
      <header class="ca-head">
        <div><h2>Tus pagos</h2><p>Lo que fuiste pagando de la obra.</p></div>
        <app-moneda-toggle />
      </header>

      @if (loading()) { <div class="skeleton" style="height:180px;border-radius:12px"></div> }
      @else if (error()) { <p class="ca-err">No se pudo cargar. Probá de nuevo en un momento.</p> }
      @else {
        <app-aportes-resumen [resumen]="resumen()" [paraPropietario]="true" />

        <h3 class="ca-sub">Detalle</h3>
        @if (resumen()?.aportes?.length) {
          <ul class="ca-list">
            @for (a of resumen()!.aportes; track a._id) {
              <li>
                <div class="ca-date" aria-hidden="true"><b>{{ dia(a.fecha) }}</b><span>{{ mes(a.fecha) }}</span></div>
                <div class="ca-mid"><strong>{{ a.concepto || 'Pago' }}</strong>
                  <small>{{ fmtFecha(a.fecha) }}@if (a.moneda !== m.vista()) { · {{ m.fmt(a.monto, a.moneda) }} · TC {{ a.tipoCambio?.toLocaleString('es-AR') ?? '—' }} }</small></div>
                <b class="num ca-monto">{{ m.fmt(a.equiv[m.vista()], m.vista()) }}</b>
                @if (a.comprobante) { <a [href]="fileUrl(a.comprobante.filename)" target="_blank" rel="noopener">Ver comprobante</a> }
              </li>
            }
          </ul>
        } @else { <p class="ca-vacio">Todavía no hay pagos registrados.</p> }
      }
    </div>
  `,
  styles: [`
    .ca { display: flex; flex-direction: column; gap: var(--sp-3); padding-bottom: var(--sp-4); }
    .ca-head { display: flex; justify-content: space-between; align-items: flex-end; gap: var(--sp-2); flex-wrap: wrap; h2 { font-family: var(--font-head); font-size: var(--text-xl); font-weight: 700; } p { font-size: var(--text-sm); color: var(--c-text-sub); } }
    .ca-sub { font-family: var(--font-head); font-size: var(--text-lg); font-weight: 700; margin-top: var(--sp-1); }
    .ca-list { list-style: none; display: flex; flex-direction: column; gap: .6rem;
      li { display: grid; grid-template-columns: 52px minmax(0, 1fr) auto; gap: .8rem; align-items: center; padding: .75rem .9rem; border: 1px solid var(--c-border); border-left: 4px solid #17803d; border-radius: var(--radius-md); background: var(--c-bg); }
      a { grid-column: 2 / -1; font-size: var(--text-sm); font-weight: 600; color: var(--c-brand); } }
    .ca-date { display: flex; flex-direction: column; align-items: center; line-height: 1.05; padding: .35rem 0; border-radius: 10px; background: var(--c-surface); b { font-family: var(--font-head); font-size: 1.3rem; } span { font-size: var(--text-xs); font-weight: 700; text-transform: uppercase; color: var(--c-text-sub); } }
    .ca-mid { display: flex; flex-direction: column; min-width: 0; strong { font-weight: 600; } small { color: var(--c-text-muted); font-size: var(--text-xs); } }
    .ca-monto { font-family: var(--font-head); font-size: 1.2rem; color: #17803d; }
    .ca-vacio, .ca-err { color: var(--c-text-muted); font-size: var(--text-sm); }
  `],
})
export class ClientAportesComponent implements OnInit {
  @Input({ required: true }) projectId!: string;
  private svc = inject(AporteService);
  m = inject(MonedaService);
  fileUrl = fileUrl;
  resumen = signal<ResumenAportes | null>(null);
  loading = signal(true);
  error = signal(false);

  ngOnInit() {
    this.svc.resumenCliente(this.projectId).subscribe({ next: r => { this.resumen.set(r); this.loading.set(false); }, error: () => { this.error.set(true); this.loading.set(false); } });
  }
  dia(d: string) { return new Date(d).getUTCDate(); }
  mes(d: string) { return new Date(d).toLocaleDateString('es-AR', { month: 'short', timeZone: 'UTC' }).replace('.', ''); }
  fmtFecha(d: string) { return new Date(d).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }); }
}
