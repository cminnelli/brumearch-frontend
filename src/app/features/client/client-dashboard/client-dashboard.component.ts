import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { ClientService } from '../../../core/services/client.service';
import { ClientProject, STATUS_LABELS, SERVICE_LABELS } from '../../../shared/models/client-project.model';

@Component({
  selector: 'app-client-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './client-dashboard.component.html',
  styleUrl: './client-dashboard.component.scss',
})
export class ClientDashboardComponent implements OnInit {
  private clientSvc = inject(ClientService);
  private router    = inject(Router);
  auth              = inject(AuthService);

  projects  = signal<ClientProject[]>([]);
  loading   = signal(true);
  error     = signal<string | null>(null);

  readonly STATUS_LABELS  = STATUS_LABELS;
  readonly SERVICE_LABELS = SERVICE_LABELS;

  ngOnInit() {
    this.clientSvc.listProjects().subscribe({
      next: ({ projects }) => {
        this.projects.set(projects);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('No se pudieron cargar los proyectos.');
        this.loading.set(false);
      },
    });
  }

  openProject(id: string) {
    this.router.navigate(['/client/projects', id]);
  }

  logout() {
    this.auth.logout();
  }

  etapaProgress(p: ClientProject): number {
    if (!p.etapas?.length) return 0;
    const done = p.etapas.filter((e) => e.estado === 'completada').length;
    return Math.round((done / p.etapas.length) * 100);
  }

  activeEtapa(p: ClientProject): string {
    return p.etapas?.find((e) => e.estado === 'activa')?.nombre ?? '';
  }

  locationStr(p: ClientProject): string {
    const l = p.location;
    if (!l) return '';
    return [l.neighborhood, l.city, l.province].filter(Boolean).join(', ');
  }
}
