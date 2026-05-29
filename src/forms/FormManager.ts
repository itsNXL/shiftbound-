import type { Player, FormId } from '../entities/Player';
import { ArcherForm } from './ArcherForm';
import { PortalForm } from './PortalForm';
import { MagnetForm } from './MagnetForm';
import { GravityForm } from './GravityForm';

export interface Form {
  activate(): void;
  deactivate(): void;
  primaryAction(pointer?: { x: number; y: number }): void;
  secondaryAction(pointer?: { x: number; y: number }): void;
  /** Called when the player presses F (P1) / N (P2) — "use / interact" */
  interactAction(): void;
  update(delta: number): void;
}

export class FormManager {
  private player: Player;
  private forms: Map<FormId, Form>;
  private active: Form | null = null;
  private activeId: FormId | null = null;

  constructor(player: Player, getPlayers: () => Player[]) {
    this.player = player;
    this.forms = new Map<FormId, Form>([
      ['archer',  new ArcherForm(player, getPlayers)],
      ['portal',  new PortalForm(player, getPlayers)],
      ['magnet',  new MagnetForm(player, getPlayers)],
      ['gravity', new GravityForm(player)],
    ]);
  }

  switchTo(id: FormId): void {
    if (this.activeId === id) return;
    this.active?.deactivate();
    this.active = this.forms.get(id) ?? null;
    this.activeId = id;
    this.active?.activate();
    this.player.scene.events.emit('form:switched', { player: this.player, form: id });
  }

  primaryAction(pointer?: { x: number; y: number }): void { this.active?.primaryAction(pointer); }
  secondaryAction(pointer?: { x: number; y: number }): void { this.active?.secondaryAction(pointer); }
  interactAction(): void { this.active?.interactAction(); }
  update(delta: number): void { this.active?.update(delta); }

  getArcherForm(): ArcherForm | null {
    const f = this.forms.get('archer');
    return f instanceof ArcherForm ? f : null;
  }

  getPortalForm(): PortalForm | null {
    const f = this.forms.get('portal');
    return f instanceof PortalForm ? f : null;
  }
}
