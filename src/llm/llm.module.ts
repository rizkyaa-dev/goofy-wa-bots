import { Module } from '@nestjs/common';
import { LlmService } from './llm.service';
import { DeepSeekProvider } from './providers/deepseek.provider';
import { GeminiProvider } from './providers/gemini.provider';
import { OpenAiProvider } from './providers/openai.provider';

@Module({
  providers: [GeminiProvider, OpenAiProvider, DeepSeekProvider, LlmService],
  exports: [LlmService],
})
export class LlmModule {}
