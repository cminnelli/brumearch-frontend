import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ChatContextService {
  readonly projectId = signal<string | undefined>(undefined);
  readonly projectName = signal<string | undefined>(undefined);

  setProject(id: string, name: string) {
    this.projectId.set(id);
    this.projectName.set(name);
  }

  clearProject() {
    this.projectId.set(undefined);
    this.projectName.set(undefined);
  }
}
