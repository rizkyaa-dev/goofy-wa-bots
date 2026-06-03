export class LlmProviderError extends Error {
  constructor(
    message: string,
    readonly provider: string,
  ) {
    super(message);
    this.name = LlmProviderError.name;
  }
}
