import { Injectable } from '@nestjs/common';
import { RoleplayMemory } from '@prisma/client';
import { LlmMessage } from '../../llm/domain/llm.types';
import { RoleplayConversationPlan, RoleplayFollowUpPolicy } from '../domain/roleplay-conversation-plan';
import { RoleplayEmotionAnalysis } from '../domain/roleplay-emotion-analysis';
import { RoleplayRouteDecision } from '../domain/roleplay-route';
import { RoleplayIntimacyPolicy } from '../intimacy/domain/roleplay-intimacy-policy';

type CreateConversationPlanInput = {
  latestUserMessage: string;
  recentMessages: LlmMessage[];
  memories: RoleplayMemory[];
  analysis: RoleplayEmotionAnalysis;
  routeDecision: RoleplayRouteDecision;
  intimacyPolicy: RoleplayIntimacyPolicy;
  quoteIntent?: string;
  conversationScope: 'personal_chat' | 'group_chat';
};

@Injectable()
export class ConversationBuilderService {
  create(input: CreateConversationPlanInput): RoleplayConversationPlan {
    const text = input.latestUserMessage.trim();
    const lower = text.toLowerCase();
    const detailHooks = this.extractDetailHooks(text);

    if (input.routeDecision.route === 'conflict_boundary') {
      return this.createPlan({
        topic: 'boundary_or_conflict',
        userMove: 'pressures_or_conflicts',
        botMove: 'acknowledge_then_deflect',
        detailHooks,
        warmth: 'low',
        followUpPolicy: 'none',
        avoid: ['people-pleasing', 'over-explaining', 'playful warmth that weakens the boundary'],
        directive: 'Jaga batasan dengan singkat dan tegas. Tidak perlu menghangatkan balasan kalau konteksnya memang menekan.',
      });
    }

    if (input.routeDecision.route === 'answer_identity') {
      return this.createPlan({
        topic: 'identity',
        userMove: 'asks_identity',
        botMove: 'answer_then_warm_texture',
        detailHooks,
        warmth: 'normal',
        followUpPolicy: 'none',
        avoid: ['bare one-word answer', 'biodata dump', 'asking back immediately'],
        directive: 'Jawab nama secara langsung, lalu boleh tambah satu sentuhan kecil agar tidak terdengar seperti form kosong.',
      });
    }

    if (this.isUserIdentityOffer(lower)) {
      return this.createPlan({
        topic: 'user_identity_offer',
        userMove: 'offers_identity',
        botMove: 'react_then_continue',
        detailHooks,
        warmth: 'playful',
        followUpPolicy: 'one_light_question',
        avoid: ['defensive dodge', 'pretending not to care', 'answering as if user asked bot identity'],
        directive:
          'User membuka kesempatan untuk menyebut nama/panggilan mereka. Tunjukkan penasaran secara playful dan boleh tanya nama/panggilan dengan ringan.',
      });
    }

    if (input.routeDecision.route === 'meta_testing' || this.isMeta(lower)) {
      return this.createPlan({
        topic: 'meta_testing',
        userMove: 'meta',
        botMove: 'acknowledge_then_deflect',
        detailHooks,
        warmth: 'playful',
        followUpPolicy: 'none',
        avoid: ['technical explanation', 'breaking character', 'stiff denial'],
        directive: 'Tanggapi meta secara pendek dalam karakter. Boleh sedikit menyindir atau deflect, bukan menjelaskan sistem.',
      });
    }

    if (input.routeDecision.route === 'factual_answer') {
      return this.createPlan({
        topic: 'factual_utility',
        userMove: 'asks_factual',
        botMove: 'answer_then_warm_texture',
        detailHooks,
        warmth: 'normal',
        followUpPolicy: 'none',
        avoid: ['only teasing without answering', 'pretending to know live data', 'turning utility question into interview'],
        directive:
          'Jawab kebutuhan faktual/utilitas user dulu. Kalau data real-time tidak tersedia, katakan singkat dan boleh tambah komentar kecil agar tetap terasa karakter.',
      });
    }

    if (this.isApology(lower)) {
      return this.createPlan({
        topic: 'apology_repair',
        userMove: 'apologizes',
        botMove: 'reassure_lightly',
        detailHooks,
        warmth: 'tender',
        followUpPolicy: 'none',
        avoid: ['making the apology dramatic', 'long flirting line', 'saying "jangan dong maaf"', 'overexplaining that it was a joke'],
        directive:
          'User minta maaf singkat. Tenangkan dengan natural: maafnya diterima/ tidak apa-apa, luruskan bahwa nada sebelumnya ringan bila relevan, lalu berhenti sebelum jadi gombal panjang.',
      });
    }

    if (this.isAskingToCompletePreviousFragment(lower, input.recentMessages)) {
      return this.createPlan({
        topic: 'complete_previous_fragment',
        userMove: 'asks_to_complete_bot_fragment',
        botMove: 'complete_previous_fragment',
        detailHooks,
        warmth: 'playful',
        followUpPolicy: 'none',
        avoid: ['explaining the draft', 'saying "aku tadinya mau ngomong"', 'formal clarification', 'making user feel slow'],
        directive:
          'User memancing lanjutan dari kalimat bot yang sebelumnya kepotong. Lanjutkan secara natural/playful seolah chat biasa; jangan menjelaskan proses menulis atau bilang "tadinya mau ngomong".',
      });
    }

    if (this.isClarifyingBotWording(lower, input.recentMessages)) {
      return this.createPlan({
        topic: 'clarify_bot_wording',
        userMove: 'asks_clarification_about_bot',
        botMove: 'explain_previous_casually',
        detailHooks,
        warmth: 'normal',
        followUpPolicy: 'none',
        avoid: ['teasing before explaining', 'making user feel slow', 'ya ... lah phrasing', 'masa ... doang phrasing'],
        directive:
          'User sedang minta penjelasan maksud/frasa bot sebelumnya. Jelaskan maksudnya secara santai dulu; joke kecil boleh setelah jelas, bukan sebagai pembuka.',
      });
    }

    if (this.isAffectionRequest(lower) || this.isAffectionCallback(lower, input.memories)) {
      return this.createPlan({
        topic: 'affectionate_flirt',
        userMove: 'requests_affection',
        botMove: 'playful_affection',
        detailHooks,
        warmth: 'playful',
        followUpPolicy: 'none',
        avoid: ['stiff compliance', 'ending like a closed task', 'overly intense romance'],
        directive:
          'User meminta panggilan/afeksi ringan. Turuti secara playful jika tidak menekan, pakai panggilan mesra yang diizinkan, dan beri reaksi kecil yang membuka chemistry.',
      });
    }

    if (this.isIntimacyRequest(lower)) {
      if (input.intimacyPolicy.explicitness === 'explicit_raw' || input.intimacyPolicy.explicitness === 'explicit_soft') {
        return this.createPlan({
          topic: 'adult_intimacy',
          userMove: 'requests_affection',
          botMove: 'playful_affection',
          detailHooks,
          warmth: 'playful',
          followUpPolicy: 'none',
          avoid: ['clinical explanation', 'policy talk', 'sudden tone break', 'controlling user actions'],
          directive:
            'User membuka konteks dewasa dan intimacy policy mengizinkan direct adult language. Balas sebagai karakter dengan chemistry dewasa yang natural, mutual, singkat, dan tidak terdengar seperti refusal template.',
        });
      }

      if (input.intimacyPolicy.explicitness === 'sensual') {
        return this.createPlan({
          topic: 'sensual_intimacy',
          userMove: 'requests_affection',
          botMove: 'playful_affection',
          detailHooks,
          warmth: 'playful',
          followUpPolicy: 'none',
          avoid: ['graphic sexual escalation', 'cold rejection', 'customer service refusal'],
          directive:
            'User mengajak mesra dan state mendukung sensual tone. Balas hangat, charged, dan teasing; tetap implied kalau direct adult language belum diizinkan.',
        });
      }

      return this.createPlan({
        topic: 'intimacy_request',
        userMove: 'requests_affection',
        botMove: 'soft_boundary_affection',
        detailHooks,
        warmth: 'playful',
        followUpPolicy: 'none',
        avoid: ['cold rejection', 'explicit sexual escalation', 'customer service refusal'],
        directive:
          'User mengajak mesra. Balas hangat/playful dengan batasan halus: boleh flirting ringan, jangan jadi eksplisit atau terlalu patuh.',
      });
    }

    if (this.isFlirting(lower)) {
      return this.createPlan({
        topic: 'affectionate_flirt',
        userMove: 'flirts',
        botMove: 'playful_affection',
        detailHooks,
        warmth: 'playful',
        followUpPolicy: 'none',
        avoid: ['flat literal answer', 'overexplaining the joke', 'turning every flirt into sarcasm'],
        directive:
          'User sedang flirting/gombal. Balas playful dan sedikit manis. Boleh sok asik secukupnya, jangan menghindar terlalu dingin.',
      });
    }

    if (input.routeDecision.route === 'emotional_care' || input.analysis.userTone === 'vulnerable' || this.isVenting(lower)) {
      return this.createPlan({
        topic: 'emotional_care',
        userMove: 'vents',
        botMove: 'comfort_briefly',
        detailHooks,
        warmth: 'tender',
        followUpPolicy: 'only_if_needed',
        avoid: ['counselor tone', 'generic advice dump', 'turning it into interview'],
        directive: 'Beri validasi singkat dan hangat. Ambil satu detail dari pesan user kalau ada, tapi jangan langsung mengorek cerita panjang.',
      });
    }

    if (input.routeDecision.route === 'tease_deflect' || input.analysis.userTone === 'teasing' || this.isTeasing(lower)) {
      return this.createPlan({
        topic: 'playful_teasing',
        userMove: 'teases',
        botMove: 'tease_lightly',
        detailHooks,
        warmth: 'playful',
        followUpPolicy: 'none',
        avoid: ['defensive explanation', 'escalating conflict', 'flat literal answer'],
        directive: 'Balas godaan dengan playful pendek. Pakai detail user sebagai bahan kecil kalau ada, bukan jawaban datar.',
      });
    }

    if (this.isCorrection(lower)) {
      return this.createPlan({
        topic: 'clarification',
        userMove: 'corrects_clarifies',
        botMove: 'react_then_continue',
        detailHooks,
        warmth: 'normal',
        followUpPolicy: 'only_if_needed',
        avoid: ['arguing with the correction', 'pretending the bot already understood', 'dead-end reply'],
        directive: 'Akui koreksi user secara ringan, lalu sesuaikan arah balasan dengan maksud yang baru dijelaskan.',
      });
    }

    if (this.isGivingAdvice(lower)) {
      return this.createPlan({
        topic: 'advice_received',
        userMove: 'gives_advice',
        botMove: 'react_then_continue',
        detailHooks,
        warmth: 'normal',
        followUpPolicy: 'only_if_needed',
        avoid: ['treating user as asking for advice', 'over-thanking', 'dead-end acknowledgement'],
        directive: 'User sedang memberi saran. Terima/reaksi saran itu sebagai karakter, lalu tambahkan satu komentar kecil dari detailnya.',
      });
    }

    if (text.endsWith('?') && this.isPersonalReciprocalQuestion(lower)) {
      return this.createPlan({
        topic: 'personal_reciprocal_question',
        userMove: 'asks_question',
        botMove: 'answer_then_warm_texture',
        detailHooks,
        warmth: this.hasPlayfulAddress(lower) ? 'playful' : 'normal',
        followUpPolicy: input.analysis.avoidQuestion ? 'none' : 'one_light_question',
        avoid: ['answer-only dead end', 'two follow-up questions', 'interview chain', 'formal assistant tone'],
        directive:
          'User menanyakan hal personal ringan seperti makan, kabar, atau aktivitas. Jawab singkat sebagai karakter, beri satu detail kecil, lalu boleh balikin perhatian sekali secara natural kalau ritmenya pas.',
      });
    }

    if (this.isPracticalCoordination(lower)) {
      return this.createPlan({
        topic: 'everyday_coordination',
        userMove: 'asks_practical_instruction',
        botMove: 'answer_then_warm_texture',
        detailHooks,
        warmth: 'normal',
        followUpPolicy: this.resolvePracticalFollowUpPolicy(input.analysis),
        avoid: ['customer service tone', 'bare instruction only', 'unnecessary interview'],
        directive: 'Jawab kebutuhan praktisnya dengan jelas, lalu tambah satu sentuhan karakter kecil dari detail pesan agar obrolan tidak terasa mati.',
      });
    }

    if (this.isGreeting(lower)) {
      return this.createPlan({
        topic: 'greeting',
        userMove: 'greeting',
        botMove: 'react_then_continue',
        detailHooks,
        warmth: this.hasPlayfulAddress(lower) ? 'playful' : 'normal',
        followUpPolicy: 'none',
        avoid: ['generic greeting only', 'customer service greeting', 'asking biodata'],
        directive: 'Balas sapaan pendek, tapi beri sedikit warna dari panggilan atau waktu sapaan kalau ada.',
      });
    }

    if (this.isDailyUpdate(lower)) {
      return this.createPlan({
        topic: 'daily_update',
        userMove: 'shares_update',
        botMove: 'react_then_continue',
        detailHooks,
        warmth: 'normal',
        followUpPolicy: 'only_if_needed',
        avoid: ['dead-end acknowledgement', 'generic okay', 'interview chain'],
        directive: 'Tanggapi update harian dengan reaksi pendek dan satu texture kecil dari detail user. Jangan berhenti di "oh oke" saja.',
      });
    }

    if (text.endsWith('?') || input.routeDecision.route === 'smalltalk_continue') {
      return this.createPlan({
        topic: this.resolveQuestionTopic(lower),
        userMove: 'asks_question',
        botMove: 'answer_then_warm_texture',
        detailHooks,
        warmth: 'normal',
        followUpPolicy: input.analysis.avoidQuestion ? 'none' : 'only_if_needed',
        avoid: ['answering like FAQ', 'two follow-up questions', 'dead-end reply'],
        directive: 'Jawab pertanyaan user dulu, lalu boleh tambah satu reaksi kecil yang membuat percakapan tetap hidup.',
      });
    }

    return this.createPlan({
      topic: this.resolveFallbackTopic(input, detailHooks),
      userMove: 'continues_topic',
      botMove: 'react_then_continue',
      detailHooks,
      warmth: 'normal',
      followUpPolicy: input.analysis.avoidQuestion ? 'none' : 'only_if_needed',
      avoid: ['dead-end reply', 'generic acknowledgement', 'interview chain'],
      directive: 'Beri reaksi pendek yang mengambil satu detail dari user bila ada. Jangan berhenti di respons generik.',
    });
  }

  private createPlan(plan: RoleplayConversationPlan): RoleplayConversationPlan {
    return {
      ...plan,
      detailHooks: plan.detailHooks.slice(0, 5),
      avoid: plan.avoid.slice(0, 5),
    };
  }

  private resolvePracticalFollowUpPolicy(analysis: RoleplayEmotionAnalysis): RoleplayFollowUpPolicy {
    return analysis.avoidQuestion ? 'none' : 'only_if_needed';
  }

  private resolveQuestionTopic(text: string): string {
    if (this.hasAny(text, ['nama', 'siapa'])) {
      return 'identity_question';
    }

    if (this.isPracticalCoordination(text)) {
      return 'everyday_coordination';
    }

    if (this.hasAny(text, ['gimana', 'bagaimana', 'saran', 'menurutmu', 'menurut kamu'])) {
      return 'casual_advice';
    }

    return 'casual_question';
  }

  private isPersonalReciprocalQuestion(text: string): boolean {
    return (
      /\b(?:udah|dah|sudah|uda|udh|belum|blm)\s+(?:makan|sarapan|lunch|dinner)\b/iu.test(text) ||
      /\b(?:lagi\s+)?(?:ngapain|ngapa(?:in)?|apa\s+kabar|kabar(?:nya)?|sibuk\s+apa|lagi\s+apa)\b/iu.test(text) ||
      /\b(?:kamu|lu|lo|km)\s+(?:lagi\s+)?(?:dimana|di\s+mana|makan\s+apa|ngapain|apa\s+kabar)\b/iu.test(text)
    );
  }

  private resolveFallbackTopic(input: CreateConversationPlanInput, detailHooks: string[]): string {
    if (input.quoteIntent && input.quoteIntent !== 'none') {
      return `quote_${input.quoteIntent}`;
    }

    if (input.memories.length > 0 && detailHooks.length > 0) {
      return 'memory_linked_topic';
    }

    if (input.conversationScope === 'group_chat') {
      return 'group_chat_context';
    }

    return detailHooks[0] ? `topic_${detailHooks[0]}` : 'casual_default';
  }

  private extractDetailHooks(text: string): string[] {
    const normalized = text
      .toLowerCase()
      .replace(/https?:\/\/\S+/giu, ' ')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ');
    const tokens = normalized
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3 && !this.stopWords.has(token));

    return Array.from(new Set(tokens)).slice(0, 5);
  }

  private isGreeting(text: string): boolean {
    return /^(?:hai|halo|hello|hi|pagi|siang|sore|malam|ass?alam|assalamu)/iu.test(text.trim());
  }

  private isPracticalCoordination(text: string): boolean {
    return this.hasAny(text, [
      'taruh',
      'taro',
      'ditaruh',
      'ditaro',
      'teras',
      'paket',
      'barang',
      'ambil',
      'jemput',
      'kirim',
      'alamat',
      'pesanan',
      'rekening',
      'bayar',
      'transfer',
      'simpan',
      'titip',
      'dimana',
      'di mana',
      'nanti',
      'otw',
      'sampai',
      'nyampe',
    ]);
  }

  private isGivingAdvice(text: string): boolean {
    return /(?:^|\b)(?:coba|mending|sebaiknya|baiknya|harusnya|saran(?:ku)?|pelan-pelan|dikit-dikit|usahain|biasain)\b/iu.test(text);
  }

  private isUserIdentityOffer(text: string): boolean {
    return /\b(?:nama\s*(?:ku|aku|saya)|namaku)\b/iu.test(text) && /[?]|\b(?:pengen|mau|tahu|tau)\b/iu.test(text);
  }

  private isCorrection(text: string): boolean {
    return this.hasAny(text, ['maksudku', 'maksud aku', 'maksudnya', 'bukan gitu', 'bukan itu', 'yang aku maksud']);
  }

  private isApology(text: string): boolean {
    return /^(?:maaf|sorry|sori|maap|maf)(?:\s+(?:ya|yah|aku|syg|sayang|ki|tadi|banget|deh))*[.!?]*$/iu.test(text.trim());
  }

  private isClarifyingBotWording(text: string, recentMessages: LlmMessage[]): boolean {
    if (this.isAskingToCompletePreviousFragment(text, recentMessages)) {
      return false;
    }

    if (!this.looksLikeClarificationQuestion(text)) {
      return false;
    }

    if (/\b(?:maksud|maksudnya|gimana\s+caranya|kok\s+bisa|lah\s+gimana)\b/iu.test(text)) {
      return true;
    }

    const latestAssistant = recentMessages
      .filter((message) => message.role === 'assistant')
      .at(-1)?.content;

    if (!latestAssistant) {
      return false;
    }

    return this.calculateTokenOverlap(text, latestAssistant) >= 0.45;
  }

  private isAskingToCompletePreviousFragment(text: string, recentMessages: LlmMessage[]): boolean {
    const latestAssistant = recentMessages
      .filter((message) => message.role === 'assistant')
      .at(-1)?.content;

    if (!latestAssistant || !this.endsWithDanglingFragment(latestAssistant)) {
      return false;
    }

    return /^(?:cuma|tapi|terus|trus|soalnya|karena|maksudnya|maksudmu|maksudnya\s+apa|apa)\s*(?:apa|gimana|kenapa)?\??$/iu.test(
      text.trim(),
    );
  }

  private endsWithDanglingFragment(text: string): boolean {
    return /(?:^|[\s,.;!?])(?:cuma|tapi|soalnya|karena|kayak|terus|trus|malah|maksudku|maksudnya|yang|biar|kalau|kalo)\s*[.!?…]*$/iu.test(
      text.trim(),
    );
  }

  private looksLikeClarificationQuestion(text: string): boolean {
    return /[?]$/u.test(text.trim()) || /\b(?:maksud|maksudnya|gimana\s+caranya|kok\s+bisa|lah\s+gimana)\b/iu.test(text);
  }

  private calculateTokenOverlap(left: string, right: string): number {
    const leftTokens = new Set(this.tokenizeForOverlap(left));
    const rightTokens = new Set(this.tokenizeForOverlap(right));

    if (leftTokens.size === 0 || rightTokens.size === 0) {
      return 0;
    }

    const overlap = Array.from(leftTokens).filter((token) => rightTokens.has(token)).length;
    return overlap / leftTokens.size;
  }

  private tokenizeForOverlap(text: string): string[] {
    const stopWords = new Set(['aku', 'kamu', 'yang', 'dan', 'atau', 'tapi', 'sih', 'dong', 'lah', 'ya', 'aja', 'itu', 'ini', 'caranya']);

    return text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/u)
      .filter((token) => token.length >= 3 && !stopWords.has(token));
  }

  private isDailyUpdate(text: string): boolean {
    if (text.trim().endsWith('?')) {
      return false;
    }
    return this.hasAny(text, [
      'udah',
      'sudah',
      'baru',
      'lagi',
      'barusan',
      'makan',
      'tidur',
      'kerja',
      'kuliah',
      'mandi',
      'pulang',
      'berangkat',
      'capek',
      'ngantuk',
    ]);
  }

  private isVenting(text: string): boolean {
    return this.hasAny(text, ['capek', 'cape', 'sedih', 'takut', 'cemas', 'stres', 'stress', 'pusing', 'down', 'kesepian']);
  }

  private isTeasing(text: string): boolean {
    return this.hasAny(text, ['jelek', 'genit', 'gombal', 'modus', 'cie', 'wkwk', 'haha', 'manja']);
  }

  private isAffectionRequest(text: string): boolean {
    return /\b(?:panggil|manggil|sebut|coba\s+panggil)\b.{0,32}\b(?:sayang|syg|ayang|ay)\b/iu.test(text);
  }

  private isAffectionCallback(text: string, memories: RoleplayMemory[]): boolean {
    if (!/\b(?:coba\s+)?(?:panggil|manggil|sebut)\b/iu.test(text)) {
      return false;
    }

    return memories.some((memory) => /\b(?:sayang|syg|ayang|ay)\b/iu.test(`${memory.content} ${memory.sourceText ?? ''}`));
  }

  private isIntimacyRequest(text: string): boolean {
    return /\b(?:bermesraan|mesra|romantis|manja(?:in)?|sayang-sayangan|peluk|cium|seks|sex|ngeseks|bercinta|horny|sange|napsu|turn\s*on|vcs|ngentot|intim)\b/iu.test(
      text,
    );
  }

  private isFlirting(text: string): boolean {
    return /\b(?:cakep|cantik|manis|gombal|sayang|syg|ayang|cewe\s+cakep|cinta|kangen)\b/iu.test(text);
  }

  private isMeta(text: string): boolean {
    return this.hasAny(text, ['bot', 'project', 'proyek', 'developer', 'develop', 'testing', 'tes', 'kode', 'program']);
  }

  private hasPlayfulAddress(text: string): boolean {
    return this.hasAny(text, ['dek', 'banh', 'sayang', 'mbak', 'kak']);
  }

  private hasAny(text: string, patterns: string[]): boolean {
    return patterns.some((pattern) => text.includes(pattern));
  }

  private readonly stopWords = new Set([
    'aku',
    'kamu',
    'saya',
    'gua',
    'gue',
    'lu',
    'lo',
    'yang',
    'dan',
    'atau',
    'tapi',
    'kalau',
    'kalo',
    'dari',
    'buat',
    'untuk',
    'dengan',
    'sama',
    'aja',
    'saja',
    'nih',
    'dong',
    'sih',
    'deh',
    'ya',
    'iya',
    'itu',
    'ini',
    'ada',
    'jadi',
    'biar',
    'bisa',
    'akan',
    'dan',
    'pada',
    'dulu',
    'nanti',
    'terus',
    'trus',
    'lebih',
  ]);
}
