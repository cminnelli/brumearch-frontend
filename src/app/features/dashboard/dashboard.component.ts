import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { DashboardService, DashboardData, ProjectSummary, fmtMoney, monedasUsadas } from '../../core/services/dashboard.service';
import { AuthService } from '../../core/services/auth.service';
import { PROJECT_STATUS_LABELS, PROJECT_TYPE_LABELS } from '../../shared/models/project.model';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink, DatePipe],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit {
  private svc = inject(DashboardService);
  auth = inject(AuthService);

  data    = signal<DashboardData | null>(null);
  loading = signal(true);
  error   = signal(false);
  today   = new Date();
  fechaHoy = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });

  fmt = fmtMoney;
  statusLabel = (s: string) => (PROJECT_STATUS_LABELS as Record<string, string>)[s] ?? s;
  typeLabel   = (t: string) => (PROJECT_TYPE_LABELS as Record<string, string>)[t] ?? t;

  firstName = computed(() => (this.auth.currentUser()?.name ?? '').split(' ')[0]);
  saludo = computed(() => {
    const h = this.today.getHours();
    return h < 6 ? 'Buenas noches' : h < 13 ? 'Buen día' : h < 20 ? 'Buenas tardes' : 'Buenas noches';
  });

  activos  = computed(() => (this.data()?.proyectos ?? []).filter(p => p.status === 'active'));
  enCurso  = computed(() => this.activos().length ? this.activos() : (this.data()?.proyectos ?? []).filter(p => p.status !== 'archived' && p.status !== 'completed'));
  avancePromedio = computed(() => {
    const l = this.activos();
    return l.length ? Math.round(l.reduce((s, p) => s + p.avance.pct, 0) / l.length) : 0;
  });
  monedasPorPagar = computed(() => { const t = this.data()?.totales; return t ? monedasUsadas(t.porPagar, t.gastado) : []; });
  pendientesTotal = computed(() => (this.data()?.proyectos ?? []).reduce((s, p) => s + p.pendientes, 0));

  ngOnInit() {
    this.svc.get().subscribe({
      next: d => { this.data.set(d); this.loading.set(false); },
      error: () => { this.error.set(true); this.loading.set(false); },
    });
  }

  /** Para la barra: ejecutado vs. presupuesto aprobado en la moneda principal del proyecto. */
  ejecucion(p: ProjectSummary): { moneda: string; gastado: number; aprobado: number; pct: number } | null {
    const mon = (['ARS', 'USD', 'EUR'] as const).filter(m => p.aprobado[m] > 0 || p.gastado[m] > 0).sort((a, b) => (p.aprobado[b] + p.gastado[b]) - (p.aprobado[a] + p.gastado[a]))[0];
    if (!mon) return null;
    const aprobado = p.aprobado[mon], gastado = p.gastado[mon];
    return { moneda: mon, gastado, aprobado, pct: aprobado ? Math.round(gastado / aprobado * 100) : 0 };
  }
  tono(pct: number) { return pct > 100 ? 'bad' : pct >= 85 ? 'warn' : ''; }
  dias(fecha: string) {
    const d = Math.round((new Date(fecha).getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000);
    return d === 0 ? 'Hoy' : d === 1 ? 'Mañana' : d > 1 ? `En ${d} días` : `Hace ${-d} d`;
  }
}
