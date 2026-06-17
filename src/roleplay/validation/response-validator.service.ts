import { Injectable } from '@nestjs/common';
import { LlmMessage } from '../../llm/domain/llm.types';
import { RoleplayResponsePlan } from '../domain/roleplay-response-plan';
import { InternalDisclosureGuardService } from './internal-disclosure-guard.service';

type ValidateInput = {
  text: string;
  latestUserMessage: string;
  recentMessages: LlmMessage[];
  plan: RoleplayResponsePlan;
  conversationScope: 'personal_chat' | 'group_chat';
};

type ValidatePartsInput = Omit<ValidateInput, 'text'> & {
  parts: string[];
};

@Injectable()
export class ResponseValidatorService {
  constructor(private readonly internalDisclosureGuard: InternalDisclosureGuardService) {}

  apply(input: ValidateInput): string {
    const disclosureSafe = this.sanitizePart(input);
    const questionSafe = this.limitQuestions(disclosureSafe, input.plan);
    const sentenceSafe = this.limitSentences(questionSafe, input.plan.maxSentences);
    const apologySafe = this.repairAwkwardApology(sentenceSafe, input.plan);
    const clarificationSafe = this.repairAwkwardClarification(apologySafe, input.plan);
    const textureSafe = this.repairDeadEndAcknowledgement(clarificationSafe, input.plan);
    const completeSafe = this.repairIncompleteTrailingFragment(textureSafe, input.plan);
    const draftSafe = this.repairMetaDraftDisclosure(completeSafe, input.plan);
    const leakageSafe = this.repairInternalMechanismLeak(draftSafe, input.plan);
    const punctuationSafe = this.normalizeCasualPunctuation(leakageSafe, input.plan);

    return punctuationSafe || this.createFallback(input.plan);
  }

  applyToParts(input: ValidatePartsInput): string[] {
    const sanitizedParts = input.parts
      .map((part) =>
        this.sanitizePart({
          text: part,
          latestUserMessage: input.latestUserMessage,
          recentMessages: input.recentMessages,
          plan: input.plan,
          conversationScope: input.conversationScope,
        }),
      )
      .map((part) => this.repairAwkwardApology(part, input.plan))
      .map((part) => this.repairAwkwardClarification(part, input.plan))
      .map((part) => this.repairDeadEndAcknowledgement(part, input.plan))
      .map((part) => this.repairIncompleteTrailingFragment(part, input.plan))
      .map((part) => this.repairMetaDraftDisclosure(part, input.plan))
      .map((part) => this.repairInternalMechanismLeak(part, input.plan))
      .filter((part) => part.trim().length > 0);

    const questionSafe = this.limitQuestionsAcrossParts(sanitizedParts, input.plan);
    const sentenceSafe = this.limitSentencesAcrossParts(questionSafe, input.plan.maxSentences);
    const punctuationSafe = sentenceSafe
      .map((part) => this.normalizeCasualPunctuation(part, input.plan))
      .filter((part) => part.trim().length > 0);

    return punctuationSafe.length > 0 ? punctuationSafe : [this.createFallback(input.plan)];
  }

  private sanitizePart(input: ValidateInput): string {
    const echoSafe = this.removeEchoedContext(input.text, input.latestUserMessage, input.recentMessages);
    const normalized = this.normalizeWhitespace(echoSafe);
    const withoutTemplates = this.removeSocialTemplates(normalized);
    const scopeSafe = input.conversationScope === 'personal_chat' ? this.sanitizePersonalScope(withoutTemplates) : withoutTemplates;

    return this.limitSelfDisclosure(scopeSafe, input.plan);
  }

  private removeSocialTemplates(text: string): string {
    return this.normalizeWhitespace(
      text
        .replace(/\bsenang\s+kenal\s+(?:sama|dengan)\s+kamu[,.!\s]*/giu, '')
        .replace(/\bsalam\s+kenal[,.!\s]*/giu, ''),
    );
  }

  private sanitizePersonalScope(text: string): string {
    return this.normalizeWhitespace(
      text
        .replace(/\blagi\s+pada\s+/giu, 'lagi ')
        .replace(/\bpada\s+ngapain\b/giu, 'ngapain')
        .replace(/\b(?:kalian|guys)\b/giu, 'kamu')
        .replace(/\bpada\b/giu, ''),
    );
  }

  private limitSelfDisclosure(text: string, plan: RoleplayResponsePlan): string {
    if (plan.selfDisclosure !== 'none') {
      return text;
    }

    const sentences = this.splitSentences(text);
    const filtered = sentences.filter((sentence) => !this.looksLikeUnpromptedSelfDisclosure(sentence));

    if (filtered.length === 0) {
      return text;
    }

    return this.normalizeWhitespace(filtered.join(' '));
  }

  private looksLikeUnpromptedSelfDisclosure(sentence: string): boolean {
    return /\baku\b.{0,32}\b(?:baru|tadi|lagi|di kantor|di rumah|ngemil|rebahan|makan|selesai|nonton|kerja)\b/iu.test(sentence);
  }

  private limitQuestions(text: string, plan: RoleplayResponsePlan): string {
    const sentences = this.splitSentences(text);
    const questionSentences = sentences.filter((sentence) => sentence.trim().endsWith('?'));

    if (questionSentences.length === 0) {
      return text;
    }

    if (!plan.questionAllowed) {
      const withoutQuestions = sentences.filter((sentence) => !sentence.trim().endsWith('?'));
      return withoutQuestions.length > 0 ? this.normalizeWhitespace(withoutQuestions.join(' ')) : this.createFallback(plan);
    }

    if (questionSentences.length <= 1) {
      return text;
    }

    let questionUsed = false;
    return this.normalizeWhitespace(
      sentences
        .filter((sentence) => {
          if (!sentence.trim().endsWith('?')) {
            return true;
          }

          if (questionUsed) {
            return false;
          }

          questionUsed = true;
          return true;
        })
        .join(' '),
    );
  }

  private limitQuestionsAcrossParts(parts: string[], plan: RoleplayResponsePlan): string[] {
    if (parts.length === 0) {
      return parts;
    }

    if (!plan.questionAllowed) {
      const withoutQuestions = parts
        .map((part) => this.splitSentences(part).filter((sentence) => !sentence.trim().endsWith('?')).join(' '))
        .map((part) => this.normalizeWhitespace(part))
        .filter(Boolean);

      return withoutQuestions.length > 0 ? withoutQuestions : [this.createFallback(plan)];
    }

    let questionUsed = false;

    return parts
      .map((part) =>
        this.splitSentences(part)
          .filter((sentence) => {
            if (!sentence.trim().endsWith('?')) {
              return true;
            }

            if (questionUsed) {
              return false;
            }

            questionUsed = true;
            return true;
          })
          .join(' '),
      )
      .map((part) => this.normalizeWhitespace(part))
      .filter(Boolean);
  }

  private limitSentences(text: string, maxSentences: number): string {
    const sentences = this.splitSentences(text);

    if (sentences.length <= maxSentences) {
      return text;
    }

    return this.normalizeWhitespace(sentences.slice(0, maxSentences).join(' '));
  }

  private limitSentencesAcrossParts(parts: string[], maxSentences: number): string[] {
    let remaining = maxSentences;
    const limited: string[] = [];

    for (const part of parts) {
      if (remaining <= 0) {
        break;
      }

      const sentences = this.splitSentences(part);

      if (sentences.length === 0) {
        continue;
      }

      const selected = sentences.slice(0, remaining);
      remaining -= selected.length;
      limited.push(this.normalizeWhitespace(selected.join(' ')));
    }

    return limited.filter(Boolean);
  }

  private removeEchoedContext(text: string, latestUserMessage: string, recentMessages: LlmMessage[]): string {
    const lines = text
      .split(/\n+/u)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      return text;
    }

    const recentCandidates = [
      latestUserMessage,
      ...recentMessages
        .slice(-4)
        .map((message) => message.content)
        .flatMap((content) => content.split(/\n+/u)),
    ].filter((candidate) => candidate.trim().length > 0);

    while (lines.length > 1 && recentCandidates.some((candidate) => this.isLikelyEcho(lines[0], candidate))) {
      lines.shift();
    }

    if (lines.length > 0) {
      lines[0] = this.removeEchoedPrefix(lines[0], recentCandidates);
    }

    return this.normalizeWhitespace(lines.join(' '));
  }

  private removeEchoedPrefix(line: string, candidates: string[]): string {
    for (const candidate of candidates) {
      const trimmedCandidate = candidate.trim();

      if (trimmedCandidate.length < 8 || line.length <= trimmedCandidate.length + 4) {
        continue;
      }

      if (line.toLowerCase().startsWith(trimmedCandidate.toLowerCase())) {
        return line.slice(trimmedCandidate.length).replace(/^[\s,.:;-]+/u, '').trim();
      }

      // Coba mencocokkan jika gema terbungkus tanda kutip
      const quotePairs = [
        ['"', '"'],
        ["'", "'"],
        ['“', '”'],
        ['‘', '’'],
      ];

      for (const [startQuote, endQuote] of quotePairs) {
        const wrapped = `${startQuote}${trimmedCandidate}${endQuote}`;
        if (line.toLowerCase().startsWith(wrapped.toLowerCase())) {
          return line.slice(wrapped.length).replace(/^[\s,.:;-]+/u, '').trim();
        }
      }
    }

    return line;
  }

  private isLikelyEcho(line: string, candidate: string): boolean {
    const normalizedLine = this.normalizeForSimilarity(line);
    const normalizedCandidate = this.normalizeForSimilarity(candidate);

    if (normalizedLine.length < 8 || normalizedCandidate.length < 8) {
      return false;
    }

    if (normalizedLine === normalizedCandidate) {
      return true;
    }

    if (normalizedLine.length <= 80 && normalizedCandidate.includes(normalizedLine)) {
      return true;
    }

    return this.jaccardSimilarity(normalizedLine, normalizedCandidate) >= 0.82;
  }

  private normalizeForSimilarity(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  private jaccardSimilarity(left: string, right: string): number {
    const leftTokens = new Set(left.split(/\s+/u).filter(Boolean));
    const rightTokens = new Set(right.split(/\s+/u).filter(Boolean));

    if (leftTokens.size === 0 || rightTokens.size === 0) {
      return 0;
    }

    const intersection = Array.from(leftTokens).filter((token) => rightTokens.has(token)).length;
    const union = new Set([...leftTokens, ...rightTokens]).size;

    return intersection / union;
  }

  private repairDeadEndAcknowledgement(text: string, plan: RoleplayResponsePlan): string {
    if (plan.topicDevelopment === 'none' || !this.isDeadEndAcknowledgement(text)) {
      return text;
    }

    if (
      plan.route === 'smalltalk_react' ||
      plan.route === 'smalltalk_continue' ||
      plan.route === 'casual_default' ||
      plan.route === 'tease_deflect'
    ) {
      return text;
    }

    if (plan.replyShape === 'comfort_anchor') {
      return 'Iya... itu kerasa berat sih';
    }

    if (plan.replyShape === 'tease_deflect') {
      return 'Ih, bisa aja kamu';
    }

    if (plan.replyShape === 'answer_texture') {
      return 'Oke, aku nangkep maksudnya';
    }

    return 'Oh oke, aku nangkep';
  }

  private repairAwkwardApology(text: string, plan: RoleplayResponsePlan): string {
    if (plan.replyShape !== 'reassure_repair') {
      return text;
    }

    const normalized = text.trim();

    if (/\bjangan\s+dong\s+maaf\b/iu.test(normalized)) {
      return 'nggak apa-apa, aku cuma godain dikit';
    }

    if (normalized.length > 120) {
      return this.normalizeWhitespace(this.splitSentences(normalized).slice(0, 2).join(' '));
    }

    return text;
  }

  private repairAwkwardClarification(text: string, plan: RoleplayResponsePlan): string {
    if (plan.replyShape !== 'explain_clarify') {
      return text;
    }

    return text
      .replace(/^\s*ya\s+(.{2,40}?)\s+lah\b/iu, '$1 maksudku')
      .replace(/\bmasa\s+(.{2,40}?)\s+doang\b/giu, '$1 aja')
      .replace(/\s+dong\b/giu, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  private repairIncompleteTrailingFragment(text: string, plan: RoleplayResponsePlan): string {
    const normalized = text.trim();

    if (!this.endsWithDanglingConnector(normalized)) {
      return text;
    }

    const trimmed = normalized
      .replace(/(?:[,;:]\s*)?(?:cuma|tapi|soalnya|karena|kayak|terus|trus|malah|maksudku|maksudnya|yang|biar|kalau|kalo)\s*[.!?…]*$/iu, '')
      .replace(/\s+([,.!?])/gu, '$1')
      .replace(/[,\s]+$/u, '')
      .trim();

    if (trimmed.length > 0) {
      return trimmed;
    }

    if (plan.replyShape === 'tease_deflect') {
      return 'Ih, jangan mancing aku';
    }

    if (plan.replyShape === 'comfort_anchor') {
      return 'Iya... aku ngerti';
    }

    return this.createFallback(plan);
  }

  private repairMetaDraftDisclosure(text: string, plan: RoleplayResponsePlan): string {
    const normalized = text.trim();

    if (!/\b(?:aku\s+)?tadinya\s+mau\s+(?:ngomong|bilang)\b/iu.test(normalized)) {
      return text;
    }

    if (plan.replyShape === 'tease_deflect' || plan.mode === 'tease') {
      return 'cuma bercanda, jangan langsung dipancing gitu';
    }

    if (plan.replyShape === 'explain_clarify') {
      return 'maksudku tadi cuma bercanda dikit';
    }

    return this.createFallback(plan);
  }

  private repairInternalMechanismLeak(text: string, plan: RoleplayResponsePlan): string {
    if (!this.internalDisclosureGuard.isInternalMechanismLeak(text)) {
      return text;
    }

    if (plan.route === 'meta_testing' || plan.mode === 'deflect' || plan.mode === 'tease') {
      return this.internalDisclosureGuard.repairForChat(text, 'deflect');
    }

    if (plan.questionAllowed) {
      return this.internalDisclosureGuard.repairForChat(text, 'question');
    }

    return this.internalDisclosureGuard.repairForChat(text, 'statement');
  }

  private endsWithDanglingConnector(text: string): boolean {
    return /(?:^|[\s,.;!?])(?:cuma|tapi|soalnya|karena|kayak|terus|trus|malah|maksudku|maksudnya|yang|biar|kalau|kalo)\s*[.!?…]*$/iu.test(
      text,
    );
  }

  private isDeadEndAcknowledgement(text: string): boolean {
    return /^(?:oh\s+)?(?:oke|ok|iya|ya|y|sip|baik|noted|makasih|terima\s+kasih|thanks|thx)[.!?]*$/iu.test(text.trim());
  }

  private normalizeCasualPunctuation(text: string, plan: RoleplayResponsePlan): string {
    if (!this.shouldSoftenTrailingPeriod(plan)) {
      return text;
    }

    if (!this.hasSingleCasualTrailingPeriod(text)) {
      return text;
    }

    return text.slice(0, -1).trim();
  }

  private shouldSoftenTrailingPeriod(plan: RoleplayResponsePlan): boolean {
    if (plan.mode === 'deflect' || plan.mode === 'quote_evidence') {
      return false;
    }

    if (plan.route === 'conflict_boundary' || plan.route === 'quote_evidence') {
      return false;
    }

    return (
      plan.route === 'smalltalk_react' ||
      plan.route === 'smalltalk_continue' ||
      plan.route === 'tease_deflect' ||
      plan.route === 'emotional_care' ||
      plan.route === 'answer_identity' ||
      plan.route === 'ambiguous_clarify' ||
      plan.route === 'meta_testing' ||
      plan.route === 'casual_default'
    );
  }

  private hasSingleCasualTrailingPeriod(text: string): boolean {
    const trimmed = text.trim();

    if (!trimmed.endsWith('.') || trimmed.endsWith('...')) {
      return false;
    }

    if (/[!?]$/u.test(trimmed)) {
      return false;
    }

    const sentences = this.splitSentences(trimmed);

    return sentences.length <= 1;
  }

  private splitSentences(text: string): string[] {
    return text.match(/[^.!?]+(?:[.!?]+|$)/gu)?.map((sentence) => sentence.trim()).filter(Boolean) ?? [];
  }

  private createFallback(plan: RoleplayResponsePlan): string {
    if (plan.mode === 'answer_only' || plan.mode === 'answer_with_texture') {
      return 'Iya.';
    }

    if (plan.mode === 'clarify') {
      return plan.questionAllowed ? 'Maksudnya?' : 'Hm, agak random.';
    }

    if (plan.mode === 'tease') {
      return 'Ih, ada-ada aja.';
    }

    if (plan.mode === 'react_expand') {
      if (plan.route === 'smalltalk_react' || plan.route === 'smalltalk_continue' || plan.route === 'casual_default') {
        return plan.questionAllowed ? 'iyaa, terus?' : 'iyaa juga ya';
      }

      return plan.emotionalTexture === 'medium' ? 'Iya... aku paham kok.' : 'oke, aku paham';
    }

    if (plan.replyShape === 'reassure_repair') {
      return 'nggak apa-apa, santai';
    }

    return 'Oh gitu.';
  }

  private normalizeWhitespace(text: string): string {
    return text
      .replace(/\s+([,.!?])/gu, '$1')
      .replace(/\s{2,}/g, ' ')
      .replace(/^[,.\s]+/gu, '')
      .trim();
  }
}
