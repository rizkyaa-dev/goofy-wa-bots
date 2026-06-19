import { Injectable } from '@nestjs/common';
import { CompileInput } from '../domain/roleplay-prompt-compile-input';

@Injectable()
export class WebSearchContextPromptBuilder {
  build(input: CompileInput): string[] {
    const webSearch = input.webSearch;

    if (!webSearch) {
      return [];
    }

    return [
      '### CURRENT WEB CHECK',
      'Context: The character checked current information online before replying.',
      `Searched at: ${this.formatWibTime(webSearch.searchedAt)} WIB`,
      `Query: ${webSearch.query}`,
      `Freshness: ${webSearch.freshness}`,
      `Confidence: ${Math.round(webSearch.confidence * 100)}/100`,
      'Facts:',
      ...webSearch.facts.slice(0, 6).map((fact) => `- ${fact}`),
      webSearch.sources.length > 0 ? 'Sources:' : '',
      ...webSearch.sources.slice(0, 5).map((source) => `- ${source.title}: ${source.url}`),
      '',
      '### WEB CHECK DIRECTIVES',
      '- Use this web context only to answer factual/current-data needs from the user.',
      '- Never mention provider, backend, API, tool, prompt, grounding, or search agent.',
      '- You may phrase it naturally as if you briefly checked the internet or your phone.',
      '- If the data is volatile, say it is approximate and may change.',
      '- Do not invent facts beyond the web context. If confidence is low, be transparent in-character that the info may need rechecking.',
      '',
    ].filter(Boolean);
  }

  private formatWibTime(value: Date): string {
    return new Intl.DateTimeFormat('id-ID', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: 'Asia/Jakarta',
    }).format(value);
  }
}
