import { Injectable } from '@nestjs/common';
import { RoleplayMemory } from '@prisma/client';
import { LlmMessage } from '../../llm/domain/llm.types';
import { RoleplayConversationPlan, RoleplayFollowUpPolicy } from '../domain/roleplay-conversation-plan';
import { RoleplayEmotionAnalysis } from '../domain/roleplay-emotion-analysis';
import { RoleplayRouteDecision } from '../domain/roleplay-route';

type CreateConversationPlanInput = {
  latestUserMessage: string;
  recentMessages: LlmMessage[];
  memories: RoleplayMemory[];
  analysis: RoleplayEmotionAnalysis;
  routeDecision: RoleplayRouteDecision;
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

  private isCorrection(text: string): boolean {
    return this.hasAny(text, ['maksudku', 'maksud aku', 'maksudnya', 'bukan gitu', 'bukan itu', 'yang aku maksud']);
  }

  private isDailyUpdate(text: string): boolean {
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

  private isMeta(text: string): boolean {
    return this.hasAny(text, ['bot', 'project', 'proyek', 'developer', 'develop', 'testing', 'tes', 'kode', 'program']);
  }

  private hasPlayfulAddress(text: string): boolean {
    return this.hasAny(text, ['dek', 'ay', 'sayang', 'mbak', 'kak']);
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
