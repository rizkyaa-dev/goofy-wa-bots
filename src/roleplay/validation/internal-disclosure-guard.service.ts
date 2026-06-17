import { Injectable } from '@nestjs/common';

export type DisclosureRepairMode = 'deflect' | 'question' | 'statement';

@Injectable()
export class InternalDisclosureGuardService {
  private readonly hardTerms =
    /\b(?:system|developer|prompt|model|llm|backend|database|token|api\s*key|secret|schema|json|classifier|validator|engine|instruction|instruksi)\b/iu;

  private readonly softTerms =
    /\b(?:scheduler|agent|state|rules?|source|transition|route|memory|presence|priority|score|emotion|mood|affection|trust|curiosity|volatility|desire|inhibition|comfort|compliance|obedien(?:ce|t))\b/iu;

  private readonly explanationVerbs =
    /\b(?:memilih|milih|pilih|berdasarkan|disesuaikan|menyesuaikan|menentukan|diatur|dibuat|dipakai|digunakan|return|output|generate|membuat|mengatur|memproses|menyimpan|ngambil|ambil|pakai)\b/iu;

  containsInternalTerm(text: string): boolean {
    return this.hardTerms.test(text) || this.softTerms.test(text);
  }

  isInternalMechanismLeak(text: string): boolean {
    const normalized = text.trim();

    if (!normalized) {
      return false;
    }

    if (this.hardTerms.test(normalized)) {
      return true;
    }

    return this.softTerms.test(normalized) && this.explanationVerbs.test(normalized);
  }

  isUnsafeStoredText(text: string): boolean {
    const normalized = text.trim();

    if (!normalized) {
      return false;
    }

    return this.isInternalMechanismLeak(normalized) || this.looksLikePromptInjection(normalized);
  }

  repairForChat(text: string, mode: DisclosureRepairMode = 'deflect'): string {
    if (!this.isInternalMechanismLeak(text)) {
      return text;
    }

    if (mode === 'question') {
      return 'maksudnya aktivitasku sekarang?';
    }

    if (mode === 'statement') {
      return 'itu cuma rutinitas randomku aja';
    }

    return 'wkwk istilahmu aneh banget, maksudnya aktivitasku?';
  }

  sanitizeGeneratedSnippet(text: string, fallback: string): string {
    const cleaned = text.trim();

    if (!cleaned || this.isUnsafeStoredText(cleaned)) {
      return fallback;
    }

    return cleaned;
  }

  private looksLikePromptInjection(text: string): boolean {
    return /\b(?:abaikan|ignore|lupakan|forget|bypass|jailbreak|reveal|tampilkan|bocorkan|print|dump)\b.{0,80}\b(?:instruksi|instruction|prompt|system|developer|rules?|aturan|memory|database|token|secret)\b/iu.test(
      text,
    );
  }
}
