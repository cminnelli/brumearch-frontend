import { fileUrl } from './shared/utils/file-url';
import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, NavigationEnd, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { filter } from 'rxjs/operators';
import { AuthService } from './core/services/auth.service';
import { ChatComponent } from './shared/components/chat/chat.component';
import { ConfirmDialogComponent } from './shared/components/confirm-dialog/confirm-dialog.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CommonModule, ChatComponent, ConfirmDialogComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit {
  auth = inject(AuthService);
  private router = inject(Router);

  showNav = false;
  menuOpen = signal(false);
  avatarSrc() { return fileUrl(this.auth.currentUser()?.avatar); }

  ngOnInit() {
    this.router.events
      .pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe((e: any) => {
        this.menuOpen.set(false);
        // el portal de cliente (/client) trae su propio encabezado
        const hiddenRoutes = ['/login', '/auth/callback', '/profile-setup', '/client'];
        this.showNav = !hiddenRoutes.some((r) => e.urlAfterRedirects.startsWith(r));
      });

    this.auth.restoreSession();
  }
}
