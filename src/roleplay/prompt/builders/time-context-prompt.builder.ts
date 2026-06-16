import { Injectable } from '@nestjs/common';
import { RoleplayTimeContext } from '../../domain/roleplay-time-context';
import { CompileInput, ConversationScope } from '../domain/roleplay-prompt-compile-input';

@Injectable()
export class TimeContextPromptBuilder {
  build(input: CompileInput): string[] {
    return [
      '### TIME CONTEXT',
      `Current time: ${input.time.nowText} WIB`,
      `Day: ${input.time.weekdayText}`,
      `Date: ${input.time.dateText}`,
      `Day type: ${input.time.isWeekend ? 'Weekend' : 'Weekday/School day'}`,
      `Period: ${input.time.dayPeriod}`,
      `Last interaction: ${input.time.lastInteractionText}`,
      `Directive: ${this.createTimeDirective(input.time)}`,
      `Commonsense: ${this.createTimeCommonsense(input.time)}`,
      '',
      '### CONVERSATION SCOPE',
      this.createConversationScopeDirective(input.conversationScope),
      '',
    ];
  }

  private createTimeDirective(time: RoleplayTimeContext): string {
    if (typeof time.minutesSinceLastInteraction !== 'number') {
      return 'This is the very first interaction. Do not pretend to have a shared history yet.';
    }

    if (time.minutesSinceLastInteraction < 10) {
      return 'The conversation is actively ongoing. Do not greet the user again.';
    }

    if (time.minutesSinceLastInteraction > 60 * 12) {
      return 'It has been quite a while since the last chat. You may subtly acknowledge the time gap if it feels natural.';
    }

    if (time.dayPeriod === 'night') {
      return 'Nighttime atmosphere. Responses can be calmer, slower, or slightly sleepy.';
    }

    return 'Maintain temporal continuity naturally without explicitly stating the time.';
  }

  private createTimeCommonsense(time: RoleplayTimeContext): string {
    if (time.dayPeriod === 'morning') {
      return `Morning: It is natural to mention just waking up, feeling sleepy, breakfast, showering, coffee/tea, or plans to leave. ${time.isWeekend ? 'Since it is the weekend, the pace can be more relaxed.' : 'Since it is a weekday, routines like work/school provide good lightweight context.'} Avoid robotic terms like "beraktivitas".`;
    }

    if (time.dayPeriod === 'afternoon') {
      return `Afternoon: Natural to mention lunch, hot weather, taking a break, or mild fatigue. ${time.isWeekend ? 'Weekends should feel relaxed.' : 'Weekdays can touch upon work/school without forcing assumptions.'}`;
    }

    if (time.dayPeriod === 'evening') {
      return 'Evening: Natural to mention commuting home, traffic, showering, unwinding, or transitioning from daily activities.';
    }

    return 'Night: Natural to mention lying in bed, dinner, fatigue, staying up late, sleepiness, or a slower pace.';
  }

  private createConversationScopeDirective(scope: ConversationScope): string {
    if (scope === 'group_chat') {
      return 'This is a group chat setting. Note that there are multiple participants; do not assume all messages originate from a single person.';
    }

    return 'This is a 1-on-1 personal chat. Avoid collective greetings like "kalian", "pada", "semua", or "guys" unless the user is specifically discussing other people.';
  }
}
