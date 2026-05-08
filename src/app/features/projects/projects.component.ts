import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ProjectService } from '../../core/services/project.service';
import { DocumentService, ProjectDocument } from '../../core/services/document.service';
import {
  Project,
  ProjectType,
  ProjectStatus,
  PROJECT_TYPE_LABELS,
  PROJECT_STATUS_LABELS,
} from '../../shared/models/project.model';
import { AddressSearchComponent, ParsedAddress } from '../../shared/components/address-search/address-search.component';

@Component({
  selector: 'app-projects',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, AddressSearchComponent],
  templateUrl: './projects.component.html',
  styleUrl: './projects.component.scss',
})
export class ProjectsComponent implements OnInit {
  private projectService = inject(ProjectService);
  private documentService = inject(DocumentService);

  projects = signal<Project[]>([]);
  showForm = signal(false);
  docsMap = signal<Record<string, ProjectDocument[] | undefined>>({});
  uploadingFor = signal<string | null>(null);
  addressMode = signal<'maps' | 'manual'>('manual');

  typeOptions = Object.entries(PROJECT_TYPE_LABELS).map(([value, label]) => ({ value: value as ProjectType, label }));
  statusOptions = Object.entries(PROJECT_STATUS_LABELS).map(([value, label]) => ({ value: value as ProjectStatus, label }));

  form = this.emptyForm();

  ngOnInit() { this.load(); }

  load() {
    this.projectService.getAll().subscribe((data) => {
      this.projects.set(data);
      data.forEach((p) => this.loadDocs(p._id));
    });
  }

  loadDocs(projectId: string) {
    this.documentService.list(projectId).subscribe((docs) => {
      this.docsMap.update((m) => ({ ...m, [projectId]: docs }));
    });
  }

  onFileSelected(event: Event, projectId: string) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.uploadingFor.set(projectId);
    this.documentService.upload(projectId, file).subscribe({
      next: () => {
        this.uploadingFor.set(null);
        this.loadDocs(projectId);
        input.value = '';
      },
      error: () => {
        this.uploadingFor.set(null);
        input.value = '';
      },
    });
  }

  deleteDoc(projectId: string, docId: string) {
    this.documentService.remove(projectId, docId).subscribe(() => this.loadDocs(projectId));
  }

  fileIcon(mime: string): string {
    if (mime.includes('pdf')) return '📄';
    if (mime.includes('sheet') || mime.includes('excel') || mime.includes('csv')) return '📊';
    if (mime.includes('word')) return '📝';
    if (mime.includes('image')) return '🖼️';
    return '📎';
  }

  toggleForm() {
    this.showForm.update((v) => !v);
    if (!this.showForm()) {
      this.form = this.emptyForm();
      this.addressMode.set('manual');
    }
  }

  onAddressSelected(parsed: ParsedAddress | null) {
    if (!parsed) return;
    this.form.address = parsed.street || parsed.address;
    this.form.neighborhood = parsed.neighborhood;
    this.form.city = parsed.city;
    this.form.province = parsed.province;
    this.form.country = parsed.country || this.form.country;
    this.form.lat = parsed.lat;
    this.form.lng = parsed.lng;
  }

  create() {
    if (!this.form.name.trim()) return;
    const payload: Partial<Project> = {
      name: this.form.name,
      description: this.form.description || undefined,
      type: this.form.type as ProjectType,
      status: this.form.status as ProjectStatus,
      owner:  { name: this.form.client || undefined },
      owners: this.form.client ? [{ name: this.form.client }] : [],
      startDate: this.form.startDate || undefined,
      endDate: this.form.endDate || undefined,
      location: {
        address: this.form.address || undefined,
        neighborhood: this.form.neighborhood || undefined,
        city: this.form.city || undefined,
        province: this.form.province || undefined,
        country: this.form.country || 'Argentina',
        coordinates: (this.form.lat && this.form.lng)
          ? { lat: this.form.lat, lng: this.form.lng }
          : undefined,
      },
      features: {
        levels: this.form.floors || undefined,
        surface: this.form.builtSurface || undefined,
        lotSurface: this.form.lotSurface || undefined,
        units: this.form.units || undefined,
      },
      budget: {
        estimated: this.form.budgetEstimated || undefined,
        currency: this.form.budgetCurrency,
      },
    };
    this.projectService.create(payload).subscribe(() => {
      this.form = this.emptyForm();
      this.showForm.set(false);
      this.load();
    });
  }

  delete(id: string, name: string) {
    if (!confirm(`¿Eliminar el proyecto "${name}"? Esta acción no se puede deshacer.`)) return;
    this.projectService.delete(id).subscribe(() => this.load());
  }

  typeLabel(type: ProjectType) { return PROJECT_TYPE_LABELS[type] ?? type; }
  statusLabel(status: ProjectStatus) { return PROJECT_STATUS_LABELS[status] ?? status; }
  locationStr(p: Project) {
    return [p.location?.neighborhood, p.location?.city].filter(Boolean).join(', ');
  }

  private emptyForm() {
    return {
      name: '', description: '', type: 'residential', status: 'draft',
      client: '', startDate: '', endDate: '',
      address: '', neighborhood: '', city: '', province: '', country: 'Argentina',
      lat: null as number | null, lng: null as number | null,
      floors: null as number | null, basements: null as number | null,
      units: null as number | null, lotSurface: null as number | null,
      builtSurface: null as number | null,
      budgetEstimated: null as number | null, budgetCurrency: 'USD',
    };
  }
}
