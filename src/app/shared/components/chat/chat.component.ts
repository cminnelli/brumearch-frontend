import {
  Component,
  inject,
  signal,
  ViewChild,
  ElementRef,
  AfterViewChecked,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AiService, ChatMessage } from '../../../core/services/ai.service';
import { ChatContextService } from '../../../core/services/chat-context.service';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chat.component.html',
  styleUrl: './chat.component.scss',
})
export class ChatComponent implements AfterViewChecked {
  private ai      = inject(AiService);
  private chatCtx = inject(ChatContextService);

  @ViewChild('messagesEnd') private messagesEnd!: ElementRef;

  readonly projectId   = this.chatCtx.projectId;
  readonly projectName = this.chatCtx.projectName;

  readonly welcomeMsg = computed(() => {
    const name = this.projectName();
    return name
      ? `¡Hola! Estoy viendo el proyecto "${name}". Preguntame sobre etapas, gastos, presupuestos, planificación o cualquier cosa del proyecto.`
      : '¡Hola! Soy tu asistente de Brumelab Arch. Preguntame sobre tus proyectos, presupuestos, etapas de obra o cualquier duda del rubro.';
  });

  isOpen   = signal(false);
  loading  = signal(false);
  input    = '';
  messages = signal<ChatMessage[]>([]);

  private shouldScroll = false;
  private lastProjectId: string | undefined = undefined;

  toggle() {
    this.isOpen.update((v) => !v);
    if (this.isOpen() && this.messages().length === 0) {
      this.resetMessages();
    }
  }

  send() {
    const text = this.input.trim();
    if (!text || this.loading()) return;

    // Si cambió el proyecto, reiniciamos la conversación
    const currentProjectId = this.projectId();
    if (currentProjectId !== this.lastProjectId) {
      this.resetMessages();
      this.lastProjectId = currentProjectId;
    }

    this.messages.update((msgs) => [...msgs, { role: 'user', content: text }]);
    this.input = '';
    this.loading.set(true);
    this.shouldScroll = true;

    // Excluye el mensaje de bienvenida del historial enviado al backend
    const history = this.messages().slice(1, -1);

    this.ai.chat({ message: text, projectId: currentProjectId, history }).subscribe({
      next: (res) => {
        this.messages.update((msgs) => [
          ...msgs,
          { role: 'assistant', content: res.response },
        ]);
        this.loading.set(false);
        this.shouldScroll = true;
      },
      error: (err) => {
        const msg = err?.error?.message || 'Error al conectar con el asistente';
        this.messages.update((msgs) => [
          ...msgs,
          { role: 'assistant', content: `⚠️ ${msg}` },
        ]);
        this.loading.set(false);
        this.shouldScroll = true;
      },
    });
  }

  onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.send();
    }
  }

  clearChat() {
    this.resetMessages();
  }

  private resetMessages() {
    this.messages.set([{ role: 'assistant', content: this.welcomeMsg() }]);
    this.lastProjectId = this.projectId();
    this.shouldScroll = true;
  }

  ngAfterViewChecked() {
    if (this.shouldScroll && this.messagesEnd) {
      this.messagesEnd.nativeElement.scrollIntoView({ behavior: 'smooth' });
      this.shouldScroll = false;
    }
  }

  formatContent(content: string): string {
    return content
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/^- (.+)$/gm, '• $1')
      .replace(/\n/g, '<br>');
  }
}
