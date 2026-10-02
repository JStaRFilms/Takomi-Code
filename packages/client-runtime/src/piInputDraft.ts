export interface PiInputDraftSnapshot {
  readonly text: string;
  readonly contentKey: string;
  readonly editor: object | null;
  readonly editorRevision: number;
}

/** Revisions also fence edit-and-undo, navigation-and-back and disconnect-and-back. */
export class PiInputDraftGuard {
  private revision = 0;
  private previous: PiInputDraftSnapshot | null = null;
  private source: object | null = null;
  private active = true;
  private readonly binding: {
    readonly readDraft: () => PiInputDraftSnapshot | null;
    readonly readSource: () => object | null;
    readonly clear: () => void;
  };
  constructor(binding: PiInputDraftGuard["binding"]) {
    this.binding = binding;
  }
  observe(): void {
    const draft = this.binding.readDraft();
    const source = this.binding.readSource();
    if (
      source !== this.source ||
      draft?.contentKey !== this.previous?.contentKey ||
      draft?.text !== this.previous?.text ||
      draft?.editor !== this.previous?.editor ||
      draft?.editorRevision !== this.previous?.editorRevision
    )
      this.revision++;
    this.source = source;
    this.previous = draft;
  }
  capture(): { readonly isCurrent: () => boolean; readonly consume: () => void } | null {
    this.observe();
    if (!this.active || !this.previous || !this.source) return null;
    const revision = this.revision;
    const isCurrent = () => {
      this.observe();
      return this.active && this.revision === revision;
    };
    return {
      isCurrent,
      consume: () => {
        if (!isCurrent()) return;
        this.revision++;
        this.binding.clear();
      },
    };
  }
  dispose(): void {
    this.active = false;
    this.revision++;
  }
}
