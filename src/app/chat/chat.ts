import { Component, OnInit, OnDestroy, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { ChatService, Message } from '../chat.service';
import { AuthService } from '../auth.service';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chat.html',
  styleUrls: ['./chat.css'],
})
export class ChatComponent implements OnInit, OnDestroy {
  private chatService = inject(ChatService);
  private authService = inject(AuthService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  messages: Message[] = [];
  inputText = '';
  currentUid = '';
  currentEmail = '';
  private sub!: Subscription;

  async ngOnInit(): Promise<void> {
    const user = await new Promise<any>(resolve => {
      this.authService.user$.subscribe(u => resolve(u));
    });
    if (!user) {
      this.router.navigate(['/login']);
      return;
    }
    this.currentUid = user.uid;
    this.currentEmail = user.email ?? user.uid;
    await this.chatService.connect();
    this.sub = this.chatService.messages$.subscribe((msg) => {
      this.messages.push(msg);
      this.cdr.markForCheck();
    });
  }

  send(): void {
    const text = this.inputText.trim();
    if (!text) return;
    this.chatService.send(text);
    this.inputText = '';
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter') this.send();
  }

  async logout(): Promise<void> {
    await this.authService.signOut();
    this.router.navigate(['/login']);
  }

  ngOnDestroy(): void {
    if (this.sub) this.sub.unsubscribe();
  }
}
