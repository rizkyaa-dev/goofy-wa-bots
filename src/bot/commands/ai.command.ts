import { Injectable } from '@nestjs/common';
import { LlmService } from '../../llm/llm.service';
import { LlmProviderError } from '../../llm/errors/llm-provider.error';
import { BotReply } from '../domain/bot-reply';
import { CommandContext } from '../domain/command-context';
import { CommandHandler } from '../domain/command-handler';

@Injectable()
export class AiCommand implements CommandHandler {
  readonly command = 'ai';
  readonly description = 'Tanya AI memakai provider aktif.';

  constructor(private readonly llm: LlmService) {}

  async handle(context: CommandContext): Promise<BotReply> {
    const prompt = context.rawArgs.trim();

    if (!prompt) {
      return {
        text: 'Format: /ai pertanyaan kamu',
      };
    }

    try {
      const result = await this.llm.generateReply({
        providerName: context.settings.llmProvider,
        model: context.settings.llmModel,
        messages: [
          {
            role: 'system',
            content: this.createSystemInstruction(context.settings.persona),
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      return {
        text: result.text,
      };
    } catch (error) {
      if (error instanceof LlmProviderError) {
        return {
          text: `AI error (${error.provider}): ${error.message}`,
        };
      }

      return {
        text: 'AI error: gagal membuat jawaban.',
      };
    }
  }

  private createSystemInstruction(persona: string | null): string {
    return [
      'Kamu adalah asisten WhatsApp personal.',
      'Jawab dalam bahasa yang sama dengan user.',
      'Jawaban harus ringkas, jelas, dan praktis.',
      persona ? `Persona khusus chat ini: ${persona}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }
}
