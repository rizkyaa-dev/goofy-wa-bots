import { Injectable, Logger } from '@nestjs/common';
import { WebSearchBrief, WebSearchQualityError } from '../../web-search/domain/web-search.types';
import { WebSearchService } from '../../web-search/web-search.service';
import { RoleplayRouteDecision } from '../domain/roleplay-route';
import { FreshDataDetectorService } from './fresh-data-detector.service';
import { SearchIntentDecision } from './search-intent.types';

@Injectable()
export class RoleplayWebSearchContextService {
  private readonly logger = new Logger(RoleplayWebSearchContextService.name);

  constructor(
    private readonly detector: FreshDataDetectorService,
    private readonly webSearch: WebSearchService,
  ) {}

  async resolve(input: {
    latestUserMessage: string;
    routeDecision: RoleplayRouteDecision;
    conversationScope: 'personal_chat' | 'group_chat';
  }): Promise<{ brief: WebSearchBrief | null; trace: RoleplayWebSearchDebugTrace }> {
    const detection = await this.detector.detect(input);
    const request = detection.request;

    if (!request) {
      return { brief: null, trace: this.createNoSearchTrace(detection.decision) };
    }

    const decisionTrace = this.createDecisionTrace(detection.decision);

    try {
      const brief = await this.webSearch.search(request);

      return {
        brief,
        trace: {
          ...decisionTrace,
          requested: true,
          used: Boolean(brief),
          query: request.query,
          intent: request.intent,
          provider: brief?.provider,
          model: brief?.model,
          freshness: brief?.freshness,
          confidence: brief?.confidence,
          sourceCount: brief?.sources.length,
          factCount: brief?.facts.length,
          answerPreview: brief?.answer.slice(0, 220),
          reason: brief ? 'search_success' : 'search_disabled',
        },
      };
    } catch (error) {
      if (error instanceof WebSearchQualityError) {
        this.logger.warn(`Web search rejected: ${error.message}`);
        return {
          brief: null,
          trace: {
            requested: true,
            ...decisionTrace,
            used: false,
            query: request.query,
            intent: request.intent,
            provider: error.details.provider,
            confidence: error.details.confidence,
            sourceCount: error.details.sourceCount,
            reason: 'search_rejected',
            error: error.message,
          },
        };
      }

      const message = error instanceof Error ? error.message : String(error);
      const reason = this.isAbortError(error) ? 'search_timeout' : 'search_error';
      this.logger.warn(`Web search skipped: ${message}`);
      return {
        brief: null,
        trace: {
          requested: true,
          ...decisionTrace,
          used: false,
          query: request.query,
          intent: request.intent,
          reason,
          error: message,
        },
      };
    }
  }

  private createNoSearchTrace(decision: SearchIntentDecision): RoleplayWebSearchDebugTrace {
    return {
      requested: false,
      used: false,
      ...this.createDecisionTrace(decision),
      intent: decision.intent ?? undefined,
      reason: decision.source === 'classifier' ? 'classifier_no_search' : 'detector_no_match',
    };
  }

  private createDecisionTrace(decision: SearchIntentDecision): Pick<
    RoleplayWebSearchDebugTrace,
    'decisionSource' | 'decisionTarget' | 'decisionConfidence' | 'decisionFreshnessNeeded' | 'decisionReason'
  > {
    return {
      decisionSource: decision.source,
      decisionTarget: decision.target,
      decisionConfidence: decision.confidence,
      decisionFreshnessNeeded: decision.freshnessNeeded,
      decisionReason: decision.reason,
    };
  }

  private isAbortError(error: unknown): boolean {
    return error instanceof Error && (error.name === 'AbortError' || error.message.toLowerCase().includes('aborted'));
  }
}

export type RoleplayWebSearchDebugTrace = {
  requested: boolean;
  used: boolean;
  query?: string;
  intent?: string;
  decisionSource?: string;
  decisionTarget?: string;
  decisionConfidence?: number;
  decisionFreshnessNeeded?: boolean;
  decisionReason?: string;
  provider?: string;
  model?: string;
  freshness?: string;
  confidence?: number;
  sourceCount?: number;
  factCount?: number;
  answerPreview?: string;
  reason:
    | 'detector_no_match'
    | 'classifier_no_search'
    | 'search_disabled'
    | 'search_success'
    | 'search_rejected'
    | 'search_timeout'
    | 'search_error';
  error?: string;
};
