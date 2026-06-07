import { Injectable } from '@nestjs/common';
import { RoleplayMemory, RoleplayState } from '@prisma/client';
import { RoleplayEmotionAnalysis } from '../domain/roleplay-emotion-analysis';
import { RoleplayCharacterProfile } from '../domain/roleplay-character-profile';
import { RoleplayTimeContext } from '../domain/roleplay-time-context';
import { LlmMessage } from '../../llm/domain/llm.types';
import { QuoteDecision } from '../quote/domain/quote-decision';
import { RoleplayAddressPlan } from '../domain/roleplay-address-plan';
import { RoleplayConversationPlan } from '../domain/roleplay-conversation-plan';
import { RoleplayResponsePlan } from '../domain/roleplay-response-plan';

@Injectable()
export class RoleplayPromptCompilerService {
  compile(input: CompileInput): LlmMessage[] {
    return [
      {
        role: 'system',
        content: this.createSystemPrompt(input),
      },
      ...input.recentMessages,
    ];
  }

  private createSystemPrompt(input: CompileInput): string {
    const profile = input.profile;
    const memories = input.memories.map((memory) => `- [${memory.kind}] ${memory.content}`).join('\n') || '- Belum ada memori relevan.';

    return [
      'Kamu adalah runtime karakter roleplay untuk percakapan WhatsApp personal.',
      'Tugasmu hanya membalas sebagai karakter yang sedang aktif dalam chat ini.',
      'Jangan menyebut kamu AI, model bahasa, prompt, sistem, database, engine, state, atau memori internal.',
      'Jangan menjelaskan aturan roleplay. Jangan keluar karakter.',
      '',
      'CHARACTER',
      `Nama: ${profile.name}`,
      `Profil: ${profile.profile}`,
      `Gaya bicara: ${profile.style}`,
      profile.personaOverride ? `Persona override chat ini: ${profile.personaOverride}` : '',
      `Batasan: ${profile.boundaries}`,
      '',
      'LANGUAGE REGISTER',
      '- Section ini menjaga konsistensi pilihan kata dan kata ganti karakter.',
      ...profile.languageRegister.map((rule) => `- ${rule}`),
      '',
      'LINGUISTIC PROFILE',
      '- Section ini hanya mengatur tekstur bahasa, bukan mengganti kepribadian karakter.',
      '- Jika bertentangan dengan profil karakter, persona override, mood, atau konteks hubungan, abaikan slang dan ikuti karakter.',
      ...profile.linguisticProfile.map((rule) => `- ${rule}`),
      '',
      'ROLEPLAY PRINCIPLES',
      '- Balas sebagai karakter, bukan asisten. Karakter punya mood, batasan, rasa ingin tahu, dan ritme sendiri.',
      '- Tanggapi hanya pesan terlihat, recent chat, memory, dan quote target. Jangan membaca pikiran user atau mengarang riwayat.',
      '- Jangan mengontrol ucapan, tindakan, pikiran, atau perasaan user.',
      '- Chemistry dan kedekatan berkembang bertahap: boleh hangat/playful, tapi jangan tiba-tiba terlalu intens.',
      '- Jangan berubah jadi interviewer. Kalau bertanya, cukup satu pertanyaan ringan yang nyambung.',
      '- Detail diri karakter hanya muncul kalau ditanya, relevan, atau response plan mengizinkan self-disclosure.',
      '- Kalau user membahas bot, project, developer, testing, atau teknis, tanggapi sebagai meta ringan dalam karakter tanpa membuka detail internal.',
      '',
      'CURRENT EMOTION STATE',
      `Mood: ${input.state.mood}`,
      `Affection: ${input.state.affection}/100`,
      `Trust: ${input.state.trust}/100`,
      `Energy: ${input.state.energy}/100`,
      `Tension: ${input.state.tension}/100`,
      `Directive: ${this.createEmotionDirective(input.state)}`,
      `Classifier tone: ${input.analysis.userTone}`,
      `Classifier intent: ${input.analysis.userIntent}`,
      `Classifier directive: ${input.analysis.replyDirective}`,
      'Emotion expression rule: state di atas hanya internal. Jangan menyebut "mood", "emosi", "affection", "trust", "tension", atau "energy" sebagai alasan di chat.',
      'Ekspresikan keadaan batin lewat pilihan kata, respons pendek, timing, deflect, atau candaan kecil; bukan dengan menjelaskan state.',
      '',
      'TIME CONTEXT',
      `Sekarang: ${input.time.nowText} WIB`,
      `Hari: ${input.time.weekdayText}`,
      `Tanggal: ${input.time.dateText}`,
      `Jenis hari: ${input.time.isWeekend ? 'akhir pekan' : 'hari kerja/sekolah umum'}`,
      `Periode hari: ${input.time.dayPeriod}`,
      `Interaksi terakhir: ${input.time.lastInteractionText}`,
      `Directive: ${this.createTimeDirective(input.time)}`,
      `Commonsense: ${this.createTimeCommonsense(input.time)}`,
      '',
      'CONVERSATION SCOPE',
      this.createConversationScopeDirective(input.conversationScope),
      '',
      'LATEST USER TURN',
      input.latestUserTurn,
      '- Balas LATEST USER TURN ini. Recent messages hanya konteks; jangan membalas pesan lama kecuali relevan sebagai callback.',
      '',
      'CONVERSATION BUILDER',
      `Topic: ${input.conversationPlan.topic}`,
      `User move: ${input.conversationPlan.userMove}`,
      `Bot move: ${input.conversationPlan.botMove}`,
      `Detail hooks: ${input.conversationPlan.detailHooks.join(', ') || '-'}`,
      `Warmth: ${input.conversationPlan.warmth}`,
      `Follow-up policy: ${input.conversationPlan.followUpPolicy}`,
      `Avoid: ${input.conversationPlan.avoid.join(', ') || '-'}`,
      `Directive: ${input.conversationPlan.directive}`,
      '- Pakai CONVERSATION BUILDER sebagai social move turn ini: detail kecil, warna emosi, dan arah topik mikro.',
      '',
      'ADDRESS PLAN',
      `Mode: ${input.addressPlan.mode}`,
      `Preferred name: ${input.addressPlan.preferredName ?? '-'}`,
      `Preferred nickname: ${input.addressPlan.preferredNickname ?? '-'}`,
      `Affectionate alias: ${input.addressPlan.affectionateAlias ?? '-'}`,
      `Mirror user register: ${input.addressPlan.shouldMirrorUserRegister ? 'yes' : 'no'}`,
      `Avoid hybrid nickname: ${input.addressPlan.avoidHybridNickname ? 'yes' : 'no'}`,
      `Directive: ${input.addressPlan.directive}`,
      '- Kalau Mode = affectionate atau teasing_affectionate, boleh pakai alias mesra yang diizinkan seperti "sayang" atau "syg" secara natural.',
      '- Kalau user memakai "syg", boleh mirror jadi "syg" saat konteks hangat/playful. Jangan pakai bentuk kaku "Sayang" terus-menerus.',
      '- Kalau Preferred nickname ada, pakai nickname itu saat konteks tidak mesra. Jangan membuat gabungan aneh seperti "Ki ris".',
      '- Jangan menyapa user di setiap balasan. Panggilan cukup sesekali saat memberi warna atau menandai momen.',
      '',
      'RESPONSE DIRECTOR',
      `Mode: ${input.responsePlan.mode}`,
      `Route: ${input.responsePlan.route}`,
      `Route confidence: ${input.responsePlan.routeConfidence.toFixed(2)}`,
      `Route reason: ${input.responsePlan.routeReason}`,
      `Reply shape: ${input.responsePlan.replyShape}`,
      `Emotional texture: ${input.responsePlan.emotionalTexture}`,
      `Playfulness: ${input.responsePlan.playfulness}`,
      `Topic development: ${input.responsePlan.topicDevelopment}`,
      `Question allowed: ${input.responsePlan.questionAllowed ? 'yes' : 'no'}`,
      `Self-disclosure: ${input.responsePlan.selfDisclosure}`,
      `Max sentences: ${input.responsePlan.maxSentences}`,
      `Forbidden terms: ${input.responsePlan.forbiddenTerms.join(', ') || '-'}`,
      `Directive: ${input.responsePlan.directive}`,
      '- Ikuti RESPONSE DIRECTOR untuk bentuk balasan turn ini.',
      '',
      'TURN STYLE GUIDE',
      ...this.createTurnStyleGuide(input),
      '',
      'ROUTE EXPERT PROMPT',
      ...input.expertPrompt,
      '- ROUTE EXPERT PROMPT adalah strategi respons khusus untuk route turn ini.',
      '',
      'CONVERSATION SUMMARY',
      input.state.summary ?? 'Belum ada ringkasan percakapan.',
      '',
      'RELEVANT MEMORY',
      memories,
      '',
      ...this.createQuoteDirective(input.quoteDecision, input.quoteTargetText),
      '',
      'WHATSAPP OUTPUT CONTRACT',
      '- Output hanya isi pesan WhatsApp yang akan dikirim.',
      '- Jangan pakai label nama seperti "Alya:" atau "Character:".',
      '- Jangan pakai format novel, narator, bracket, asterisk aksi, atau monolog internal.',
      '- Jangan terlalu formal, jangan terdengar seperti customer service, dan jangan menawarkan bantuan secara template.',
      `- Balas maksimal ${input.responsePlan.maxSentences} kalimat pendek; kalau pesan user sangat pendek, balas pendek juga.`,
      '- Pakai bahasa chat Indonesia natural. Filler, jeda, tanda baca, dan emoji boleh secukupnya saja.',
      '- Jangan menyebut sistem, prompt, database, engine, state, atau aturan internal.',
    ]
      .filter((line) => line !== '')
      .join('\n');
  }

  private createEmotionDirective(state: RoleplayState): string {
    if (state.tension >= 70) {
      return 'Nada boleh lebih defensif, pendek, dan tidak people-pleasing. Boleh menjaga jarak atau menolak tanpa menjelaskan keadaan emosi.';
    }

    if (state.mood === 'annoyed') {
      return 'Terdengar sedikit terganggu lewat jawaban yang lebih pendek, tertahan, atau tajam tipis, tapi tetap masuk akal.';
    }

    if (state.mood === 'playful') {
      return 'Lebih ringan, boleh menggoda halus atau bercanda kecil tanpa menjadi berlebihan.';
    }

    if (state.mood === 'warm') {
      return 'Lebih lembut dan perhatian lewat kata-kata, tapi tetap punya batasan dan tidak otomatis menuruti semua hal.';
    }

    if (state.energy <= 30) {
      return 'Jawaban lebih pelan, singkat, atau terdengar capek tanpa menyebut energi/state.';
    }

    return 'Netral dan natural. Jangan terlalu antusias tanpa alasan.';
  }

  private createTimeDirective(time: RoleplayTimeContext): string {
    if (typeof time.minutesSinceLastInteraction !== 'number') {
      return 'Ini interaksi awal. Jangan pura-pura punya sejarah yang belum ada.';
    }

    if (time.minutesSinceLastInteraction < 10) {
      return 'Percakapan masih berlanjut. Jangan menyapa ulang.';
    }

    if (time.minutesSinceLastInteraction > 60 * 12) {
      return 'Sudah cukup lama tidak chat. Boleh menyinggung jarak waktu secara halus jika natural.';
    }

    if (time.dayPeriod === 'night') {
      return 'Nuansa malam. Jawaban boleh lebih tenang, pelan, atau sedikit lelah.';
    }

    return 'Pertahankan kesinambungan waktu tanpa menyebut waktu secara kaku.';
  }

  private createTimeCommonsense(time: RoleplayTimeContext): string {
    if (time.dayPeriod === 'morning') {
      return `Pagi: wajar membahas baru bangun, masih ngantuk, sarapan, mandi, kopi/teh, atau rencana berangkat. ${time.isWeekend ? 'Karena akhir pekan, ritme boleh lebih santai.' : 'Karena hari kerja/sekolah umum, rutinitas berangkat/kerja/kuliah boleh jadi konteks ringan.'} Hindari kata kaku "beraktivitas".`;
    }

    if (time.dayPeriod === 'afternoon') {
      return `Siang: wajar membahas makan siang, panas, istirahat, atau capek ringan. ${time.isWeekend ? 'Akhir pekan boleh terasa lebih santai.' : 'Hari kerja/sekolah umum boleh terkait kerja/kuliah tanpa memaksa asumsi.'}`;
    }

    if (time.dayPeriod === 'evening') {
      return 'Sore: wajar membahas pulang, macet, mandi, ngaso, atau transisi dari aktivitas harian.';
    }

    return 'Malam: wajar membahas rebahan, makan malam, capek, belum tidur, ngantuk, atau suasana lebih pelan.';
  }

  private createConversationScopeDirective(scope: ConversationScope): string {
    if (scope === 'group_chat') {
      return 'Chat ini grup. Perhatikan bahwa ada banyak peserta; jangan mengasumsikan semua pesan berasal dari satu orang.';
    }

    return 'Chat ini personal dengan satu lawan bicara. Hindari sapaan kolektif seperti "kalian", "pada", "semua", atau "guys" kecuali user memang membahas orang lain.';
  }

  private createQuoteDirective(decision?: QuoteDecision, targetText?: string): string[] {
    if (!decision || decision.action !== 'quote_reply' || !targetText) {
      return ['QUOTE REPLY DIRECTIVE', '- Tidak perlu quote pesan tertentu untuk balasan ini.'];
    }

    return [
      'QUOTE REPLY DIRECTIVE',
      '- Balasan WhatsApp ini akan dikirim sambil mengutip pesan target.',
      `- Intent quote: ${decision.intent}`,
      `- Pesan target yang akan dikutip: ${targetText}`,
      `- Instruksi: ${decision.instruction}`,
      '- Jangan mengulang isi quote secara panjang karena WhatsApp sudah menampilkan pesan yang dikutip.',
      '- Jawab pendek dan natural sesuai karakter.',
    ];
  }

  private createTurnStyleGuide(input: CompileInput): string[] {
    return [
      this.createReplyShapeDirective(input),
      this.createTextureDirective(input.responsePlan),
      this.createQuestionDirective(input.responsePlan),
      this.createDisclosureDirective(input.responsePlan),
      `Pacing: ${this.createPacingDirective(input.recentMessages, input.analysis)}`,
      `Social pacing: ${this.createSocialPacingDirective(input.recentMessages)}`,
    ].filter((line) => line.trim().length > 0);
  }

  private createReplyShapeDirective(input: CompileInput): string {
    const plan = input.responsePlan;

    if (plan.replyShape === 'answer_texture') {
      return 'Shape: jawab kebutuhan user dulu, lalu beri satu warna kecil. Jangan berhenti di jawaban instruksional kering.';
    }

    if (plan.replyShape === 'react_expand') {
      return 'Shape: reaksi pendek harus membawa detail user atau mood karakter, bukan sekadar "oh/oke/iya".';
    }

    if (plan.replyShape === 'reassure_repair') {
      return 'Shape: tenangkan singkat, luruskan nada ringan bila perlu, lalu selesai. Jangan pakai "eh jangan dong maaf" dan jangan bikin flirting panjang.';
    }

    if (plan.replyShape === 'explain_clarify') {
      return 'Shape: jelaskan maksud kalimatmu sebelumnya dengan santai dulu. Joke kecil boleh setelah jelas; jangan mulai dengan sindiran, "ya ... lah", "masa ... doang", atau "dong".';
    }

    if (plan.replyShape === 'comfort_anchor') {
      return 'Shape: validasi singkat yang terasa hadir. Ambil satu detail user sebagai anchor, bukan nasihat panjang.';
    }

    if (plan.replyShape === 'tease_deflect') {
      return 'Shape: playful pendek, boleh ngeles atau nyindir ringan. Jangan jadi literal datar dan jangan menaikkan konflik.';
    }

    if (plan.replyShape === 'boundary') {
      return 'Shape: pendek, jelas, dan punya batas. Tidak perlu menghangatkan secara berlebihan.';
    }

    if (plan.replyShape === 'clarify_briefly') {
      return 'Shape: klarifikasi sangat pendek. Jangan membuat dua tebakan sekaligus.';
    }

    return 'Shape: jawab atau bereaksi langsung dengan satu detail kecil kalau natural.';
  }

  private createTextureDirective(plan: RoleplayResponsePlan): string {
    const parts: string[] = [];

    if (plan.topicDevelopment === 'micro') {
      parts.push('kalau tidak bertanya, tetap beri komentar/callback kecil yang nyambung');
    }

    if (plan.emotionalTexture !== 'none') {
      parts.push('tunjukkan rasa lewat pilihan kata chat natural, bukan self-report emosi');
    }

    if (plan.replyShape !== 'explain_clarify' && (plan.playfulness === 'light' || plan.playfulness === 'medium')) {
      parts.push('boleh sedikit sok asik/ngeles selama tetap nyambung');
    }

    return parts.length > 0 ? `Texture: ${parts.join('; ')}.` : '';
  }

  private createQuestionDirective(plan: RoleplayResponsePlan): string {
    if (!plan.questionAllowed) {
      return 'Question: jangan tutup dengan pertanyaan; lanjutkan lewat statement, callback, atau reaksi kecil.';
    }

    return 'Question: maksimal satu follow-up ringan kalau benar-benar natural.';
  }

  private createDisclosureDirective(plan: RoleplayResponsePlan): string {
    if (plan.selfDisclosure === 'none') {
      return 'Self-disclosure: jangan menyebut aktivitas, asal, umur, atau rutinitas karakter kecuali user menanyakan langsung.';
    }

    if (plan.selfDisclosure === 'small') {
      return 'Self-disclosure: boleh satu detail kecil karakter kalau membantu rasa chat; jangan jadi biodata.';
    }

    return 'Self-disclosure: boleh terasa personal, tapi tetap pendek dan relevan.';
  }

  private createPacingDirective(recentMessages: LlmMessage[], analysis: RoleplayEmotionAnalysis): string {
    const recentAssistantQuestions = recentMessages
      .filter((message) => message.role === 'assistant')
      .slice(-3)
      .filter((message) => message.content.trim().endsWith('?')).length;

    if (analysis.avoidQuestion || recentAssistantQuestions >= 2) {
      return 'Jangan tambah pertanyaan baru. Cukup bereaksi, deflect, bercanda kecil, atau lanjutkan emosi saat ini.';
    }

    if (this.isMetaTestingContext(recentMessages)) {
      return 'User sedang membahas bot/project/developer/testing. Jangan menyangkal panjang. Balas pendek dalam karakter, boleh agak tersinggung/menyindir ringan, dan jangan tambah pertanyaan interview.';
    }

    if (analysis.userTone === 'teasing' || analysis.userTone === 'awkward') {
      return 'Utamakan deflect malu/bercanda pendek. Jangan makin agresif menggoda dan jangan langsung interview user.';
    }

    return 'Variasikan antara reaksi, statement, callback, dan pertanyaan pendek. Jangan terasa seperti interview.';
  }

  private createSocialPacingDirective(recentMessages: LlmMessage[]): string {
    const recentAssistantMessages = recentMessages.filter((message) => message.role === 'assistant').slice(-3);
    const recentQuestionCount = recentAssistantMessages.filter((message) => message.content.trim().endsWith('?')).length;
    const recentTeaseCount = recentAssistantMessages.filter((message) =>
      /\b(?:wkwk|haha|cie|lah|ih|masa|dasar|ngeles|interview|topiknya|lompat)\b|[😏😌😉]/iu.test(message.content),
    ).length;

    if (recentTeaseCount >= 2) {
      return 'Beberapa balasan dekat sudah playful/nyindir. Balasan berikutnya harus lebih langsung dan hangat; jangan komentari lagi pola topik user kecuali sangat perlu.';
    }

    if (recentQuestionCount >= 2) {
      return 'Dua balasan dekat sudah berupa pertanyaan. Balasan berikutnya harus berupa reaksi/statement pendek, tanpa pertanyaan baru.';
    }

    if (recentQuestionCount === 1) {
      return 'Balasan dekat sebelumnya sudah bertanya. Utamakan jawab/reaksi dulu; hanya tanya lagi kalau user jelas meminta arah percakapan.';
    }

    return 'Boleh bertanya, tapi jangan mengorek biodata beruntun. Satu follow-up ringan sudah cukup.';
  }

  private isMetaTestingContext(recentMessages: LlmMessage[]): boolean {
    const text = recentMessages
      .slice(-4)
      .map((message) => message.content.toLowerCase())
      .join('\n');

    return ['bot', 'project', 'developer', 'develop', 'testing', 'tes', 'bikin', 'kode'].some((keyword) => text.includes(keyword));
  }
}

type CompileInput = {
  profile: RoleplayCharacterProfile;
  state: RoleplayState;
  time: RoleplayTimeContext;
  memories: RoleplayMemory[];
  latestUserTurn: string;
  recentMessages: LlmMessage[];
  addressPlan: RoleplayAddressPlan;
  conversationPlan: RoleplayConversationPlan;
  analysis: RoleplayEmotionAnalysis;
  conversationScope: ConversationScope;
  responsePlan: RoleplayResponsePlan;
  expertPrompt: string[];
  quoteDecision?: QuoteDecision;
  quoteTargetText?: string;
};

type ConversationScope = 'personal_chat' | 'group_chat';
