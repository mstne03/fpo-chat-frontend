import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { WebSocketSubject, webSocket } from 'rxjs/webSocket';
import { BehaviorSubject, Subject } from 'rxjs';
import { AuthService } from './auth.service';
import { environment } from '../environments/environment';

export interface Room {
  id: string;
  name: string;
  creatorUid: string;
  count: number;
}

export interface ChatMessage {
  uid: string;
  email: string;
  text: string;
  timestamp: string;
}

export type IncomingChatEvent =
  | ({ type: 'message' } & ChatMessage)
  | { type: 'claude_start'; id: string }
  | { type: 'claude_delta'; id: string; text: string }
  | { type: 'claude_end'; id: string };

interface ControlIn {
  type: 'room_list' | 'room_update';
  rooms: { id: string; name: string; creator_uid: string; count: number }[];
}

@Injectable({ providedIn: 'root' })
export class RoomService {
  private authService = inject(AuthService);
  private router = inject(Router);

  private controlSocket$: WebSocketSubject<unknown> | null = null;
  private chatSocket$: WebSocketSubject<IncomingChatEvent> | null = null;

  private controlReconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isIntentionalDisconnect = false;

  rooms$ = new BehaviorSubject<Room[]>([]);
  messages$ = new Subject<ChatMessage>();
  claudeStart$ = new Subject<{ id: string }>();
  claudeDelta$ = new Subject<{ id: string; text: string }>();
  claudeEnd$ = new Subject<{ id: string }>();
  roomError$ = new Subject<string>();
  activeRoomId: string | null = null;

  async connectControl(): Promise<void> {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.controlSocket$) {
      this.controlSocket$.complete();
      this.controlSocket$ = null;
    }
    this.isIntentionalDisconnect = false;
    this.controlReconnectAttempts = 0;

    let token: string;
    try {
      token = await this.authService.getToken();
    } catch {
      this.authService.signOut();
      this.router.navigate(['/login']);
      return;
    }

    this.openControlSocket(token);
  }

  private openControlSocket(token: string): void {
    this.controlSocket$ = webSocket<unknown>(
      `${environment.wsBase}/ws/control?token=${token}`,
    );
    this.controlSocket$.subscribe({
      next: (msg) => {
        this.controlReconnectAttempts = 0;
        this.handleControl(msg as ControlIn);
      },
      error: () => {
        if (this.isIntentionalDisconnect) {
          return;
        }
        this.controlSocket$ = null;
        this.scheduleReconnect();
      },
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) return;
    if (this.controlReconnectAttempts >= this.maxReconnectAttempts) {
      console.warn(
        '[RoomService] Control socket: max reconnect attempts reached. ' +
          'The user can refresh to reconnect.',
      );
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, this.controlReconnectAttempts), 16000);
    this.controlReconnectAttempts++;

    console.warn(
      `[RoomService] Control socket dropped. Reconnect attempt ` +
        `${this.controlReconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms...`,
    );

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;

      let token: string;
      try {
        token = await this.authService.getToken();
      } catch {
        this.authService.signOut();
        this.router.navigate(['/login']);
        return;
      }

      if (!this.isIntentionalDisconnect) {
        this.openControlSocket(token);
      }
    }, delay);
  }

  disconnectControl(): void {
    this.isIntentionalDisconnect = true;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.controlSocket$) {
      this.controlSocket$.complete();
      this.controlSocket$ = null;
    }
    this.controlReconnectAttempts = 0;
  }

  private handleControl(msg: ControlIn): void {
    if (msg.type === 'room_list' || msg.type === 'room_update') {
      this.rooms$.next(
        msg.rooms.map((r) => ({
          id: r.id,
          name: r.name,
          creatorUid: r.creator_uid,
          count: r.count,
        })),
      );
    }
  }

  createRoom(name: string): void {
    this.controlSocket$?.next({ type: 'create_room', name } as unknown as never);
  }

  deleteRoom(roomId: string): void {
    this.controlSocket$?.next({ type: 'delete_room', roomId } as unknown as never);
  }

  async joinRoom(roomId: string): Promise<void> {
    this.leaveRoom();
    const token = await this.authService.getToken();
    this.activeRoomId = roomId;
    this.chatSocket$ = webSocket<IncomingChatEvent>({
      url: `${environment.wsBase}/ws/chat/${roomId}?token=${token}`,
      closeObserver: {
        next: (event) => {
          if (event.code === 4001) {
            this.roomError$.next('Esta sala fue eliminada');
            this.activeRoomId = null;
            this.chatSocket$ = null;
          } else if (event.code === 4004) {
            this.roomError$.next('La sala no existe');
            this.activeRoomId = null;
            this.chatSocket$ = null;
          }
        },
      },
    });
    this.chatSocket$.subscribe({
      next: (event) => this.routeChatEvent(event),
      error: () => {
        this.roomError$.next('Conexión con la sala perdida');
        this.activeRoomId = null;
        this.chatSocket$ = null;
      },
    });
  }

  private routeChatEvent(event: IncomingChatEvent): void {
    switch (event.type) {
      case 'message':
        this.messages$.next({ uid: event.uid, email: event.email, text: event.text, timestamp: event.timestamp });
        break;
      case 'claude_start':
        this.claudeStart$.next({ id: event.id });
        break;
      case 'claude_delta':
        this.claudeDelta$.next({ id: event.id, text: event.text });
        break;
      case 'claude_end':
        this.claudeEnd$.next({ id: event.id });
        break;
    }
  }

  leaveRoom(): void {
    if (this.chatSocket$) {
      this.chatSocket$.complete();
      this.chatSocket$ = null;
    }
    this.activeRoomId = null;
  }

  send(text: string): void {
    this.chatSocket$?.next({
      type: 'message',
      uid: '',
      email: '',
      text,
      timestamp: new Date().toISOString(),
    } as unknown as IncomingChatEvent);
  }
}
