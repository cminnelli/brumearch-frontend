import { Component, inject, signal, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProjectService } from '../../core/services/project.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit {
  private projectService = inject(ProjectService);

  total = signal(0);
  active = signal(0);
  completed = signal(0);

  ngOnInit() {
    this.projectService.getAll().subscribe((projects) => {
      this.total.set(projects.length);
      this.active.set(projects.filter((p) => p.status === 'active').length);
      this.completed.set(projects.filter((p) => p.status === 'completed').length);
    });
  }
}
