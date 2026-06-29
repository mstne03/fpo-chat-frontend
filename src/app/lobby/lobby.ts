import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription, firstValueFrom } from 'rxjs';
import { RoomService, Room, ChatMessage } from '../room.service';
import { AuthService } from '../auth.service';
import { take } from 'rxjs/operators';

@Component({
  selector: 'app-lobby',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './lobby.html',
  styleUrls: ['./lobby.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LobbyComponent implements OnInit, OnDestroy {
  private roomService = inject(RoomService);
  private authService = inject(AuthService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  rooms: Room[] = [];
  messages: ChatMessage[] = [];
  currentUid = '';
  currentEmail = '';

  inputText = '';
  creating = false;
  newRoomName = '';
  createError = '';
  roomError = '';

  private claudeInProgress = new Map<string, ChatMessage>();
  private subs: Subscription[] = [];

  get activeRoomId(): string | null {
    return this.roomService.activeRoomId;
  }

  get activeRoomName(): string {
    const r = this.rooms.find((x) => x.id === this.activeRoomId);
    return r ? r.name : '';
  }

  isClaudeStreaming(msg: ChatMessage): boolean {
    return msg.uid === 'claude' && [...this.claudeInProgress.values()].includes(msg);
  }

  async ngOnInit(): Promise<void> {
    const user = await firstValueFrom(this.authService.user$.pipe(take(1)));
    if (!user) {
      this.router.navigate(['/login']);
      return;
    }
    this.currentUid = user.uid;
    this.currentEmail = user.email ?? user.uid;

    this.subs.push(
      this.roomService.rooms$.subscribe((rooms) => {
        this.rooms = rooms;
        this.cdr.markForCheck();
      }),
    );
    this.subs.push(
      this.roomService.messages$.subscribe((msg) => {
        this.messages.push(msg);
        this.cdr.markForCheck();
      }),
    );
    this.subs.push(
      this.roomService.roomError$.subscribe((err) => {
        this.roomError = err;
        this.messages = [];
        this.claudeInProgress.clear();
        this.cdr.markForCheck();
      }),
    );
    this.subs.push(
      this.roomService.claudeStart$.subscribe(({ id }) => {
        const bubble: ChatMessage = {
          uid: 'claude',
          email: 'Claude',
          text: '',
          timestamp: new Date().toISOString(),
        };
        this.claudeInProgress.set(id, bubble);
        this.messages.push(bubble);
        this.cdr.markForCheck();
      }),
    );
    this.subs.push(
      this.roomService.claudeDelta$.subscribe(({ id, text }) => {
        const bubble = this.claudeInProgress.get(id);
        if (bubble) {
          bubble.text += text;
          this.cdr.markForCheck();
        }
      }),
    );
    this.subs.push(
      this.roomService.claudeEnd$.subscribe(({ id }) => {
        this.claudeInProgress.delete(id);
        this.cdr.markForCheck();
      }),
    );

    await this.roomService.connectControl();
  }

  async selectRoom(room: Room): Promise<void> {
    if (room.id === this.activeRoomId) return;
    this.messages = [];
    this.claudeInProgress.clear();
    this.roomError = '';
    await this.roomService.joinRoom(room.id);
  }

  backToRooms(): void {
    this.messages = [];
    this.claudeInProgress.clear();
    this.roomError = '';
    this.roomService.leaveRoom();
  }

  startCreate(): void {
    this.creating = true;
    this.newRoomName = '';
    this.createError = '';
  }

  cancelCreate(): void {
    this.creating = false;
    this.createError = '';
  }

  confirmCreate(): void {
    const name = this.newRoomName.trim();
    if (!name) {
      this.createError = 'El nombre no puede estar vacío';
      return;
    }
    if (this.rooms.some((r) => r.name === name)) {
      this.createError = 'Ya existe una sala con ese nombre';
      return;
    }
    this.roomService.createRoom(name);
    this.creating = false;
    this.newRoomName = '';
  }

  deleteActiveRoom(): void {
    if (this.activeRoomId) {
      this.roomService.deleteRoom(this.activeRoomId);
      this.messages = [];
      this.claudeInProgress.clear();
    }
  }

  send(): void {
    const text = this.inputText.trim();
    if (!text || !this.activeRoomId) return;
    this.roomService.send(text);
    this.inputText = '';
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter') this.send();
  }

  onCreateKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter') this.confirmCreate();
    if (event.key === 'Escape') this.cancelCreate();
  }

  async logout(): Promise<void> {
    this.roomService.leaveRoom();
    await this.authService.signOut();
    this.router.navigate(['/login']);
  }

  ngOnDestroy(): void {
    this.subs.forEach((s) => s.unsubscribe());
    this.roomService.leaveRoom();
  }
}
