import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ClientService } from '../../../core/services/client.service';
import { ClientProject, STATUS_LABELS, SERVICE_LABELS } from '../../../shared/models/client-project.model';
import { ClientCajaComponent } from '../client-caja/client-caja.component';

type Tab = 'info' | 'etapas' | 'finanzas';

@Component({
  selector: 'app-client-project',
  standalone: true,
  imports: [CommonModule, ClientCajaComponent],
  templateUrl: './client-project.component.html',
  styleUrl: './client-project.component.scss',
})
export class ClientProjectComponent implements OnInit {
  private route     = inject(ActivatedRoute);
  private clientSvc = inject(ClientService);
  private router    = inject(Router);

  project = signal<ClientProject | null>(null);
  loading = signal(true);
  error   = signal<string | null>(null);
  tab     = signal<Tab>('info');

  readonly STATUS_LABELS  = STATUS_LABELS;
  readonly SERVICE_LABELS = SERVICE_LABELS;

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.clientSvc.getProject(id).subscribe({
      next: ({ project }) => { this.project.set(project); this.loading.set(false); },
      error: () => { this.error.set('No se pudo cargar el proyecto.'); this.loading.set(false); },
    });
  }

  goBack() { this.router.navigate(['/client']); }
  setTab(t: Tab) { this.tab.set(t); }

  etapaProgress(): number {
    const p = this.project();
    if (!p?.etapas?.length) return 0;
    return Math.round(p.etapas.filter(e => e.estado === 'completada').length / p.etapas.length * 100);
  }

  locationStr(): string {
    const l = this.project()?.location;
    return [l?.address, l?.city, l?.province].filter(Boolean).join(', ');
  }

  featStr(): { label: string; value: string }[] {
    const f = this.project()?.features;
    if (!f) return [];
    const rows: { label: string; value: string }[] = [];
    if (f.surface)    rows.push({ label: 'm² construidos', value: `${f.surface}` });
    if (f.lotSurface) rows.push({ label: 'm² terreno',     value: `${f.lotSurface}` });
    if (f.levels)     rows.push({ label: 'Niveles',        value: `${f.levels}` });
    if (f.bedrooms)   rows.push({ label: 'Dormitorios',    value: `${f.bedrooms}` });
    if (f.bathrooms)  rows.push({ label: 'Baños',          value: `${f.bathrooms}` });
    if (f.units)      rows.push({ label: 'Unidades',       value: `${f.units}` });
    return rows;
  }
}
