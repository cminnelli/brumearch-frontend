import { Component, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-auth-callback',
  standalone: true,
  templateUrl: './auth-callback.component.html',
  styleUrl: './auth-callback.component.scss',
})
export class AuthCallbackComponent implements OnInit {
  private router = inject(Router);

  ngOnInit() {
    // Con Firebase Auth (popup), este callback ya no se usa.
    // Redirigimos al dashboard por si alguien llega acá por error.
    this.router.navigate(['/dashboard']);
  }
}
