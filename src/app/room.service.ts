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

interface ControlIn {
  type: 'room_list' | 'room_update';
  rooms: { id: string; name: string; creator_uid: string; count: number }[];
}

@Injectable({ providedIn: 'root' })
export class RoomService {
  private authService = inject(AuthService);
  private router = inject(Router);

  private controlSocket$: WebSocketSubject<unknown> | null = null;
  private chatSocket$: WebSocketSubject<ChatMessage> | null = null;

  rooms$ = new BehaviorSubject<Room[]>([]);
  messages$ = new Subject<ChatMessage>();
  roomError$ = new Subject<string>();
  activeRoomId: string | null = null;

  async connectControl(): Promise<void> {
    if (this.controlSocket$) {
      this.controlSocket$.complete();
      this.controlSocket$ = null;
    }
    const token = await this.authService.getToken();
    this.controlSocket$ = webSocket<unknown>(
      `${environment.wsBase}/ws/control?token=${token}`,
    );
    this.controlSocket$.subscribe({
      next: (msg) => this.handleControl(msg as ControlIn),
      error: () => {
        this.authService.signOut();
        this.router.navigate(['/login']);
      },
    });
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
    this.chatSocket$ = webSocket<ChatMessage>({
      url: `${environment.wsBase}/ws/chat/${roomId}?token=${token}`,
      closeObserver: {
        next: (event) => {
          if (event.code === 4001) {
            this.roomError$.next('Esta sala fue eliminada');
            this.activeRoomId = null;
          } else if (event.code === 4004) {
            this.roomError$.next('La sala no existe');
            this.activeRoomId = null;
          }
        },
      },
    });
    this.chatSocket$.subscribe({
      next: (msg) => this.messages$.next(msg),
      error: () => {
        this.roomError$.next('Conexión con la sala perdida');
        this.activeRoomId = null;
      },
    });
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
      uid: '',
      email: '',
      text,
      timestamp: new Date().toISOString(),
    });
  }
}
