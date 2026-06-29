import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../auth.service';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './auth.html',
  styleUrls: ['./auth.css'],
})
export class AuthComponent {
  private authService = inject(AuthService);
  private router = inject(Router);

  isLogin = true;
  email = '';
  password = '';
  errorMessage = '';
  loading = false;

  toggle(): void {
    this.isLogin = !this.isLogin;
    this.errorMessage = '';
  }

  async submit(): Promise<void> {
    this.errorMessage = '';
    this.loading = true;
    try {
      if (this.isLogin) {
        await this.authService.signIn(this.email, this.password);
      } else {
        await this.authService.signUp(this.email, this.password);
      }
      this.router.navigate(['/lobby']);
    } catch (err: any) {
      this.errorMessage = this.mapError(err.code);
    } finally {
      this.loading = false;
    }
  }

  private mapError(code: string): string {
    const map: Record<string, string> = {
      'auth/email-already-in-use': 'Este email ya está registrado',
      'auth/invalid-credential': 'Email o contraseña incorrectos',
      'auth/invalid-email': 'Email inválido',
      'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres',
      'auth/user-not-found': 'Email o contraseña incorrectos',
      'auth/wrong-password': 'Email o contraseña incorrectos',
    };
    return map[code] ?? 'Error desconocido. Inténtalo de nuevo.';
  }
}
