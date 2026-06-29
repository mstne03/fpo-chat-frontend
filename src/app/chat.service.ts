import { Injectable, OnDestroy, inject } from '@angular/core';
import { Router } from '@angular/router';
import { WebSocketSubject, webSocket } from 'rxjs/webSocket';
import { Observable, Subject, EMPTY } from 'rxjs';
import { takeUntil, catchError } from 'rxjs/operators';
import { AuthService } from './auth.service';
import { environment } from '../environments/environment';

export interface Message {
  uid: string;
  email: string;
  text: string;
  timestamp: string;
}

@Injectable({ providedIn: 'root' })
export class ChatService implements OnDestroy {
  private authService = inject(AuthService);
  private router = inject(Router);
  private destroy$ = new Subject<void>();
  private socket$!: WebSocketSubject<Message>;

  messages$!: Observable<Message>;

  async connect(): Promise<void> {
    const token = await this.authService.getToken();
    this.socket$ = webSocket<Message>(`${environment.wsUrl}?token=${token}`);
    this.messages$ = this.socket$.pipe(
      catchError(() => {
        this.authService.signOut();
        this.router.navigate(['/login']);
        return EMPTY;
      }),
      takeUntil(this.destroy$),
    );
  }

  send(text: string): void {
    this.socket$.next({
      uid: '',
      email: '',
      text,
      timestamp: new Date().toISOString(),
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.socket$) this.socket$.complete();
  }
}
