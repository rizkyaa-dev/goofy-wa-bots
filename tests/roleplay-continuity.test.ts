import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ConversationBuilderService } from '../src/roleplay/conversation/conversation-builder.service';
import { RoleplayContinuityService } from '../src/roleplay/conversation/roleplay-continuity.service';

describe('RoleplayContinuityService', () => {
  it('blocks a redundant activity follow-up when the user already disclosed it', () => {
    const service = new RoleplayContinuityService();
    const context = service.build(
      [
        { role: 'user', content: 'biasa deh chattingan sama seseorang' },
        { role: 'assistant', content: 'ooh gitu, asik dong' },
        { role: 'user', content: 'kamu lagi ngapain btw' },
      ],
      'kamu lagi ngapain btw',
    );

    assert.deepEqual(context.disclosures, [{ topic: 'user_current_activity', value: 'seseorang' }]);
    assert.deepEqual(context.blockedFollowUpTopics, ['user_current_activity']);
    assert.match(context.callbackHints[0], /jangan menanyakan aktivitas user lagi/u);
  });

  it('does not block unrelated follow-ups when no activity was disclosed', () => {
    const service = new RoleplayContinuityService();
    const context = service.build(
      [{ role: 'user', content: 'malam juga!' }],
      'kamu lagi ngapain?',
    );

    assert.deepEqual(context.blockedFollowUpTopics, []);
  });

  it('turns the redundant follow-up policy off in the conversation plan', () => {
    const continuity = new RoleplayContinuityService();
    const context = continuity.build(
      [
        { role: 'user', content: 'biasa deh chattingan sama seseorang' },
        { role: 'assistant', content: 'ooh gitu, asik dong' },
        { role: 'user', content: 'kamu lagi ngapain btw' },
      ],
      'kamu lagi ngapain btw',
    );
    const builder = new ConversationBuilderService();

    const plan = builder.create({
      latestUserMessage: 'kamu lagi ngapain btw',
      recentMessages: [
        { role: 'user', content: 'biasa deh chattingan sama seseorang' },
        { role: 'assistant', content: 'ooh gitu, asik dong' },
        { role: 'user', content: 'kamu lagi ngapain btw' },
      ],
      memories: [],
      state: { mood: 'neutral', tension: 0, energy: 70, curiosity: 55, compliance: 40 } as never,
      analysis: { userTone: 'neutral', avoidQuestion: false } as never,
      routeDecision: {
        route: 'smalltalk_continue',
        confidence: 1,
        tone: 'casual',
        questionAllowed: true,
        selfDisclosure: 'small',
        needsMemory: false,
        needsQuote: false,
        reason: 'test',
      },
      intimacyPolicy: {} as never,
      quoteIntent: 'none',
      continuity: context,
      conversationScope: 'personal_chat',
    });

    assert.equal(plan.followUpPolicy, 'none');
    assert.match(plan.directive, /jangan menanyakan aktivitas user lagi/u);
  });

  it('keeps the disclosure when consecutive user messages were batched', () => {
    const service = new RoleplayContinuityService();
    const context = service.build(
      [{ role: 'user', content: 'biasa deh chattingan sama seseorang\nkamu lagi ngapain btw' }],
      'biasa deh chattingan sama seseorang\nkamu lagi ngapain btw',
    );

    assert.deepEqual(context.blockedFollowUpTopics, ['user_current_activity']);
  });

  it('recognizes sleep reluctance as a fresh user disclosure', () => {
    const service = new RoleplayContinuityService();
    const context = service.build(
      [{ role: 'user', content: 'iya nih lagi males tidur' }],
      'iya nih lagi males tidur',
    );

    assert.deepEqual(context.disclosures, [{ topic: 'user_current_activity', value: 'tidak ingin tidur sekarang' }]);
    assert.deepEqual(context.blockedFollowUpTopics, ['user_current_activity']);
    assert.match(context.callbackHints[0], /jangan menanyakan ulang/u);
  });

  it('disables follow-up questions after a sleep preference disclosure', () => {
    const continuity = new RoleplayContinuityService();
    const context = continuity.build(
      [{ role: 'user', content: 'iya nih lagi males tidur' }],
      'iya nih lagi males tidur',
    );
    const builder = new ConversationBuilderService();

    const plan = builder.create({
      latestUserMessage: 'iya nih lagi males tidur',
      recentMessages: [{ role: 'user', content: 'iya nih lagi males tidur' }],
      memories: [],
      state: { mood: 'sleepy', tension: 0, energy: 25, curiosity: 55, compliance: 40 } as never,
      analysis: { userTone: 'neutral', avoidQuestion: false } as never,
      routeDecision: {
        route: 'smalltalk_continue', confidence: 1, tone: 'casual', questionAllowed: true,
        selfDisclosure: 'small', needsMemory: false, needsQuote: false, reason: 'test',
      },
      intimacyPolicy: {} as never,
      quoteIntent: 'none',
      continuity: context,
      conversationScope: 'personal_chat',
    });

    assert.equal(plan.followUpPolicy, 'none');
    assert.match(plan.directive, /jangan menanyakan ulang detail aktivitas yang sama/u);
  });
});
