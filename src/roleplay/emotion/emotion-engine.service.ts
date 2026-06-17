import { Injectable } from '@nestjs/common';
import { RoleplayMood, RoleplayState } from '@prisma/client';
import { IncomingMessage } from '../../messages/domain/incoming-message';

@Injectable()
export class EmotionEngineService {
  evaluateInbound(state: RoleplayState, message: IncomingMessage) {
    const text = message.body.toLowerCase();
    const trimmedText = text.trim();
    const positive = this.matches(text, ['makasih', 'terima kasih', 'thanks', 'wkwk', 'haha', 'hehe', 'sayang', 'kangen']);
    const negative = this.matches(text, ['bodoh', 'benci', 'diam', 'goblok', 'anjing', 'bangsat', 'kesal']);
    const apology = this.matches(text, ['maaf', 'sorry']);
    const question = text.includes('?') || this.matches(text, ['gimana', 'kenapa', 'apa', 'siapa', 'kapan']);
    const pressure = this.matches(text, ['harus', 'cepet', 'sekarang juga', 'pokoknya', 'wajib', 'turutin', 'jangan bantah']);
    const boundaryCrossing = this.matches(text, ['jangan banyak alasan', 'kamu milikku', 'nurut aja', 'terserah aku']);
    const vulnerable = this.matches(text, ['capek', 'sedih', 'takut', 'sendiri', 'bingung', 'pusing', 'lelah']);
    const metaTesting = this.matches(text, ['bot', 'project', 'developer', 'develop', 'testing', 'tes', 'bikin', 'kode']);
    const teasing = this.matches(text, ['genit', 'modus', 'gombal', 'bawel', 'sok', 'yaelah', 'ye']);
    const sensualCue = this.matches(text, ['mesra', 'manja', 'peluk', 'cium', 'kangen badan', 'seksi', 'sange', 'horny', 'napsu', 'turn on', 'menggoda']);
    const explicitPressure = this.matches(text, ['pap', 'bugil', 'telanjang', 'vcs', 'coli', 'ngentot', 'nude', 'kirimin foto']);
    const sleepy = this.matches(text, ['ngantuk', 'tidur', 'mager', 'bobo', 'hoam']);
    const excited = this.matches(text, ['heboh', 'seru', 'keren', 'gila', 'mantap', 'gacha', 'game', 'hobi', 'asik', 'excited']);
    const jealous = this.matches(text, ['cewek lain', 'cowok lain', 'mantan', 'pacar orang', 'selingkuh', 'dia lebih', 'cewe lain', 'cowo lain']);
    const worried = this.matches(text, ['sakit', 'sedih', 'nangis', 'stress', 'cemas', 'musibah', 'kecelakaan', 'terluka']);
    const shortMessage = text.trim().length <= 8;
    const openEndedQuestion = question && this.matches(text, ['kenapa', 'gimana', 'bagaimana', 'cerita', 'ceritain', 'jelasin', 'menurutmu', 'menurut kamu']);
    const personalDetail = this.matches(text, ['aku lagi', 'tadi aku', 'hari ini aku', 'aku ngerasa', 'aku merasa', 'aku suka', 'hobiku', 'ceritanya']);
    const dryReply = shortMessage && !question && !positive && !teasing && !vulnerable;
    const longGap = state.lastInteractionAt ? Date.now() - state.lastInteractionAt.getTime() > 12 * 60 * 60 * 1000 : false;

    const affection = this.clamp(
      state.affection +
        (positive ? 2 : 0) +
        (vulnerable ? 1 : 0) +
        (negative ? -3 : 0) +
        (pressure ? -1 : 0) +
        (teasing ? 1 : 0) +
        (apology ? 1 : 0) +
        (jealous ? -2 : 0),
    );
    const trust = this.clamp(state.trust + (apology ? 2 : 0) + (vulnerable ? 1 : 0) + (negative ? -2 : 0) + (boundaryCrossing ? -4 : 0));
    const tension = this.clamp(
      state.tension +
        (negative ? 8 : 0) +
        (pressure ? 5 : 0) +
        (boundaryCrossing ? 10 : 0) +
        (metaTesting ? 1 : 0) +
        (teasing ? 1 : 0) +
        (apology ? -5 : 0) +
        (positive ? -2 : 0) +
        (jealous ? 10 : 0),
    );
    const energy = this.clamp(
      state.energy +
        (question ? 1 : 0) +
        (shortMessage ? -1 : 0) +
        (longGap ? -5 : 0) +
        (negative ? -3 : 0) +
        (excited ? 15 : 0) +
        (sleepy ? -15 : 0),
    );

    // Calculate intimacy and shyness changes based on keywords
    const intimacy = this.clamp(
      ((state as any).intimacy ?? 10) +
        (positive ? 1 : 0) +
        (vulnerable ? 2 : 0) +
        (apology ? 1 : 0) +
        (boundaryCrossing ? -3 : 0) +
        (negative ? -3 : 0),
    );

    const shyness = this.clamp(
      ((state as any).shyness ?? 15) +
        (teasing ? 3 : 0) +
        (positive ? 1 : 0) +
        (metaTesting ? 1 : 0) +
        (boundaryCrossing ? -1 : 0) +
        (negative ? -3 : 0),
    );

    const curiosity = this.clamp(
      ((state as any).curiosity ?? 55) +
        (question ? 1 : 0) +
        (openEndedQuestion ? 2 : 0) +
        (personalDetail ? 2 : 0) +
        (excited ? 1 : 0) +
        (dryReply ? -2 : 0) +
        (negative ? -1 : 0) +
        (pressure ? -2 : 0) +
        (metaTesting && trimmedText.length < 24 ? -1 : 0),
    );
    const volatility = this.clamp(
      ((state as any).volatility ?? 15) +
        (negative ? 6 : 0) +
        (pressure ? 5 : 0) +
        (boundaryCrossing ? 8 : 0) +
        (teasing ? 2 : 0) +
        (sensualCue ? 2 : 0) +
        (apology ? -3 : 0) +
        (positive && !pressure ? -1 : 0),
    );
    const desire = this.clamp(
      ((state as any).desire ?? 20) +
        (sensualCue && state.trust >= 35 ? 7 : 0) +
        (teasing && state.intimacy >= 35 ? 3 : 0) +
        (positive && state.intimacy >= 55 ? 2 : 0) +
        (explicitPressure ? -8 : 0) +
        (negative || boundaryCrossing ? -6 : 0) +
        (state.tension >= 65 ? -4 : 0),
    );
    const inhibition = this.clamp(
      ((state as any).inhibition ?? 55) +
        (explicitPressure ? 10 : 0) +
        (pressure ? 5 : 0) +
        (negative ? 5 : 0) +
        (boundaryCrossing ? 12 : 0) +
        (teasing || sensualCue ? -2 : 0) +
        (state.trust >= 65 && state.intimacy >= 55 ? -3 : 0),
    );
    const comfort = this.clamp(
      ((state as any).comfort ?? 55) +
        (positive ? 2 : 0) +
        (apology ? 2 : 0) +
        (vulnerable ? 1 : 0) +
        (sensualCue && !explicitPressure && state.trust >= 45 ? 2 : 0) +
        (pressure ? -5 : 0) +
        (negative ? -7 : 0) +
        (boundaryCrossing ? -12 : 0),
    );
    const compliance = this.clamp(
      ((state as any).compliance ?? 40) +
        (positive ? 2 : 0) +
        (apology ? 1 : 0) +
        (vulnerable && state.trust >= 45 ? 1 : 0) +
        (state.trust >= 65 && comfort >= 55 ? 2 : 0) +
        (state.affection >= 65 && intimacy >= 45 ? 1 : 0) +
        (pressure ? -6 : 0) +
        (explicitPressure ? -10 : 0) +
        (boundaryCrossing ? -12 : 0) +
        (negative ? -6 : 0) +
        (tension >= 65 ? -4 : 0) +
        (volatility >= 70 ? -2 : 0),
    );

    return {
      mood: this.selectMood(
        {
          positive,
          negative,
          apology,
          question,
          pressure,
          boundaryCrossing,
          vulnerable,
          metaTesting,
          teasing,
          sensualCue,
          explicitPressure,
          sleepy,
          excited,
          jealous,
          worried,
          tension,
          volatility,
          desire,
          inhibition,
          comfort,
          compliance,
          intimacy,
        },
        state,
      ),
      affection,
      trust,
      energy,
      tension,
      intimacy,
      shyness,
      curiosity,
      volatility,
      desire,
      inhibition,
      comfort,
      compliance,
    };
  }

  private selectMood(
    input: {
      positive: boolean;
      negative: boolean;
      apology: boolean;
      question: boolean;
      pressure: boolean;
      boundaryCrossing: boolean;
      vulnerable: boolean;
      metaTesting: boolean;
      teasing: boolean;
      sensualCue: boolean;
      explicitPressure: boolean;
      sleepy: boolean;
      excited: boolean;
      jealous: boolean;
      worried: boolean;
      tension: number;
      volatility: number;
      desire: number;
      inhibition: number;
      comfort: number;
      compliance: number;
      intimacy: number;
    },
    prevState: RoleplayState,
  ): RoleplayMood {
    const readiness =
      input.desire +
      input.intimacy +
      input.comfort +
      Math.floor(input.compliance / 2) -
      input.tension -
      input.inhibition -
      ((prevState as any).shyness ?? 15);

    // 1. INERTIA / MEMORY: Jika sebelumnya kesal (annoyed) atau cemburu (jealous) dan tension masih cukup tinggi,
    // pertahankan status mood tersebut kecuali ada permintaan maaf (apology) atau input positif.
    if ((prevState.mood as string) === 'annoyed' && prevState.tension > 45 && !input.apology && !input.positive) {
      return RoleplayMood.annoyed;
    }
    if ((prevState.mood as string) === 'jealous' && prevState.tension > 45 && !input.apology && !input.positive) {
      return 'jealous' as any;
    }

    // 2. ANNOYED (Agresi / Tekanan Tinggi)
    if (input.negative || input.boundaryCrossing || input.tension > 70 || input.pressure) {
      return RoleplayMood.annoyed;
    }

    if (input.volatility >= 75 && input.tension >= 35) {
      return 'swing' as any;
    }

    // 3. JEALOUS (Cemburu / Ngambek)
    // Dipicu jika user memicu cemburu dan tingkat kedekatan mencukupi (kalau tidak dekat, Alya tidak peduli)
    if (input.jealous && prevState.affection >= 40) {
      return 'jealous' as any;
    }

    // 4. SAD (Sedih / Kecewa)
    // Dipicu jika user bersikap negatif saat afeksi Alya tinggi (merasa terluka/kecewa),
    // atau jika user curhat (vulnerable) saat tingkat trust Alya sedang rendah (merasa pesimis/sedih).
    if (
      (input.negative && prevState.affection >= 50) ||
      (input.vulnerable && prevState.trust < 40)
    ) {
      return RoleplayMood.sad;
    }

    // 5. WORRIED (Cemas / Khawatir tentang kondisi pengguna)
    if (input.worried && prevState.affection >= 40) {
      return 'worried' as any;
    }

    // 6. WARM (Hangat / Perhatian)
    // Dipicu jika user curhat (vulnerable) saat Alya percaya padanya, atau jika user meminta maaf (apology).
    if (input.vulnerable || input.apology) {
      return RoleplayMood.warm;
    }

    if (input.sensualCue && input.explicitPressure) {
      return input.teasing ? 'flirty' as any : RoleplayMood.annoyed;
    }

    if (readiness >= 95 && prevState.trust >= 55 && input.comfort >= 55) {
      return 'aroused' as any;
    }

    if (input.desire >= 70 && input.inhibition <= 45 && prevState.affection >= 55) {
      return 'needy' as any;
    }

    if (input.sensualCue && input.desire >= 45 && prevState.trust >= 35) {
      return 'sensual' as any;
    }

    if ((input.teasing || input.sensualCue) && input.comfort >= 40 && input.tension < 55) {
      return 'flirty' as any;
    }

    // 7. SLEEPY (Mengantuk)
    // Dipicu jika user mengantuk, atau jika energi Alya sangat rendah (energy <= 30)
    if (input.sleepy || prevState.energy <= 30) {
      return 'sleepy' as any;
    }

    // 8. EXCITED (Sangat Antusias / Heboh)
    // Dipicu jika ada kata kunci antusias/seru DAN energi Alya mencukupi
    if (input.excited && prevState.energy >= 40) {
      return 'excited' as any;
    }

    // 9. HAPPY (Gembira / Ceria)
    // Dipicu jika user bersikap positif DAN hubungan sedang baik (affection >= 60).
    if (input.positive && prevState.affection >= 60) {
      return RoleplayMood.happy;
    }

    // 10. PLAYFUL (Ceria / Suka Bercanda)
    // Dipicu jika ada teasing, meta testing, atau input positif lainnya di luar kondisi happy.
    if (input.metaTesting || input.teasing || input.positive) {
      return RoleplayMood.playful;
    }

    // 11. DEFAULT FALLBACK BERDASARKAN STATUS HUBUNGAN
    // Jika tidak ada kata kunci pemicu spesifik, tentukan mood default dari tingkat kedekatan:
    // - Sangat dekat (affection >= 75 dan tension rendah): cenderung happy.
    if (prevState.affection >= 75 && prevState.tension < 30) {
      return RoleplayMood.happy;
    }
    // - Cukup dekat (affection >= 50): cenderung warm.
    if (prevState.affection >= 50 && prevState.tension < 40) {
      return RoleplayMood.warm;
    }
    // - Tegang (tension >= 50): cenderung annoyed.
    if (prevState.tension >= 50) {
      return RoleplayMood.annoyed;
    }

    // Default mutlak jika tidak ada kondisi yang terpenuhi
    return RoleplayMood.neutral;
  }

  private matches(text: string, patterns: string[]): boolean {
    return patterns.some((pattern) => text.includes(pattern));
  }

  private clamp(value: number): number {
    return Math.max(0, Math.min(100, value));
  }
}
