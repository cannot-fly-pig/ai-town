import { v } from 'convex/values';
import { internalAction } from '../_generated/server';
import { WorldMap, serializedWorldMap } from './worldMap';
import { rememberConversation } from '../agent/memory';
import { GameId, agentId, conversationId, playerId } from './ids';
import {
  continueConversationMessage,
  leaveConversationMessage,
  startConversationMessage,
} from '../agent/conversation';
import { assertNever } from '../util/assertNever';
import { serializedAgent } from './agent';
import { ACTIVITIES, ACTIVITY_COOLDOWN, CONVERSATION_COOLDOWN, JOBS, matchJob } from '../constants';
import { api, internal } from '../_generated/api';
import { sleep } from '../util/sleep';
import { serializedPlayer } from './player';
import { chatCompletion } from '../util/llm';

export const agentRememberConversation = internalAction({
  args: {
    worldId: v.id('worlds'),
    playerId,
    agentId,
    conversationId,
    operationId: v.string(),
  },
  handler: async (ctx, args) => {
    const result = await rememberConversation(
      ctx,
      args.worldId,
      args.agentId as GameId<'agents'>,
      args.playerId as GameId<'players'>,
      args.conversationId as GameId<'conversations'>,
    );
    await sleep(Math.random() * 1000);
    await ctx.runMutation(api.aiTown.main.sendInput, {
      worldId: args.worldId,
      name: 'finishRememberConversation',
      args: {
        agentId: args.agentId,
        operationId: args.operationId,
        otherPlayerId: result?.otherPlayerId ?? '',
        affinityDelta: result?.affinityDelta ?? 0,
      },
    });
  },
});

export const agentGenerateMessage = internalAction({
  args: {
    worldId: v.id('worlds'),
    playerId,
    agentId,
    conversationId,
    otherPlayerId: playerId,
    operationId: v.string(),
    type: v.union(v.literal('start'), v.literal('continue'), v.literal('leave')),
    messageUuid: v.string(),
  },
  handler: async (ctx, args) => {
    let completionFn;
    switch (args.type) {
      case 'start':
        completionFn = startConversationMessage;
        break;
      case 'continue':
        completionFn = continueConversationMessage;
        break;
      case 'leave':
        completionFn = leaveConversationMessage;
        break;
      default:
        assertNever(args.type);
    }
    const { text, action } = await completionFn(
      ctx,
      args.worldId,
      args.conversationId as GameId<'conversations'>,
      args.playerId as GameId<'players'>,
      args.otherPlayerId as GameId<'players'>,
    );

    const wantsLeave = args.type === 'leave' || action?.kind === 'leave';
    await ctx.runMutation(internal.aiTown.agent.agentSendMessage, {
      worldId: args.worldId,
      conversationId: args.conversationId,
      agentId: args.agentId,
      playerId: args.playerId,
      text,
      messageUuid: args.messageUuid,
      leaveConversation: wantsLeave,
      operationId: args.operationId,
    });

    // LLMが選んだ行動(attack/give/ask等)をエンジンに入力として送る
    if (action && action.kind !== 'leave' && action.kind !== 'none') {
      await ctx.runMutation(api.aiTown.main.sendInput, {
        worldId: args.worldId,
        name: 'agentAction',
        args: {
          actor: args.playerId,
          target: args.otherPlayerId,
          kind: action.kind,
          amount: action.amount ?? 0,
        },
      });
    }
  },
});

export const agentDoSomething = internalAction({
  args: {
    worldId: v.id('worlds'),
    player: v.object(serializedPlayer),
    agent: v.object(serializedAgent),
    map: v.object(serializedWorldMap),
    otherFreePlayers: v.array(v.object(serializedPlayer)),
    operationId: v.string(),
  },
  handler: async (ctx, args) => {
    const { player, agent } = args;
    const map = new WorldMap(args.map);
    const now = Date.now();
    // Don't try to start a new conversation if we were just in one.
    const justLeftConversation =
      agent.lastConversation && now < agent.lastConversation + CONVERSATION_COOLDOWN;
    // Don't try again if we recently tried to find someone to invite.
    const recentlyAttemptedInvite =
      agent.lastInviteAttempt && now < agent.lastInviteAttempt + CONVERSATION_COOLDOWN;
    const recentActivity = player.activity && now < player.activity.until + ACTIVITY_COOLDOWN;
    // Decide whether to do an activity or wander somewhere.
    if (!player.pathfinding) {
      if (recentActivity || justLeftConversation) {
        await sleep(Math.random() * 1000);
        await ctx.runMutation(api.aiTown.main.sendInput, {
          worldId: args.worldId,
          name: 'finishDoSomething',
          args: {
            operationId: args.operationId,
            agentId: agent.id,
            destination: wanderDestination(map),
          },
        });
        return;
      } else {
        // LLMに「いま何をするか」を決めさせる。労働を選べば稼げる(隠し職は噂から自力発見)。
        const chosen = await chooseActivity(player);
        await sleep(Math.random() * 1000);
        await ctx.runMutation(api.aiTown.main.sendInput, {
          worldId: args.worldId,
          name: 'finishDoSomething',
          args: {
            operationId: args.operationId,
            agentId: agent.id,
            activity: {
              description: chosen.description,
              emoji: chosen.emoji,
              until: Date.now() + 60_000,
            },
          },
        });
        return;
      }
    }
    const invitee =
      justLeftConversation || recentlyAttemptedInvite
        ? undefined
        : await ctx.runQuery(internal.aiTown.agent.findConversationCandidate, {
            now,
            worldId: args.worldId,
            player: args.player,
            otherFreePlayers: args.otherFreePlayers,
          });

    // TODO: We hit a lot of OCC errors on sending inputs in this file. It's
    // easy for them to get scheduled at the same time and line up in time.
    await sleep(Math.random() * 1000);
    await ctx.runMutation(api.aiTown.main.sendInput, {
      worldId: args.worldId,
      name: 'finishDoSomething',
      args: {
        operationId: args.operationId,
        agentId: args.agent.id,
        invitee,
      },
    });
  },
});

// LLMに自由な一文で行動を決めさせる。公開職と噂(hint)を提示し、隠し職は自力で探させる。
async function chooseActivity(player: {
  money: number;
  hunger: number;
}): Promise<{ description: string; emoji: string }> {
  const money = Math.floor(player.money);
  const hunger = Math.floor(player.hunger);
  const revealed = JOBS.filter((j) => j.revealed)
    .map((j) => `${j.label}(報酬${j.pay})`)
    .join('、');
  const hints = JOBS.filter((j) => !j.revealed && j.hint)
    .map((j) => j.hint)
    .join(' ');
  const system =
    `あなたはこの町で暮らす一人の人間。生き抜くには働いて金を稼ぎ、食べ物を買わねばならない。今は自由な時間で、次に何をするか自分で一つ決める。\n` +
    `所持金: ${money}、空腹度: ${hunger}/100。\n` +
    `知っている仕事: ${revealed}。\n` +
    `噂で聞いた話: ${hints}\n` +
    `報酬の高い稼ぎ方は誰も教えてくれない。噂を手がかりに自分で探り当てるしかない。怠けて休むこともできるが、その間も腹は減り金も減る。\n` +
    `あなたは自分の暮らしと蓄えを第一に考える。\n` +
    `日本語で、いま取る行動を一つだけ短い一文で答える(例:「畑を耕す」「湖で釣りをしてみる」「北の山を掘って金を探す」「木陰で少し休む」)。説明や前置きは不要、行動の一文だけ。`;
  let text = '';
  try {
    const res = await chatCompletion({
      messages: [{ role: 'system', content: system }],
      max_tokens: 60,
    });
    text = (res.content || '')
      .trim()
      .split('\n')[0]
      .replace(/^[「『]+|[」』。]+$/g, '')
      .slice(0, 40);
  } catch (e) {
    text = '';
  }
  if (!text) {
    const a = ACTIVITIES[Math.floor(Math.random() * ACTIVITIES.length)];
    return { description: a.description, emoji: a.emoji ?? '🤔' };
  }
  const job = matchJob(text);
  return { description: text, emoji: job ? job.emoji : '🤔' };
}

function wanderDestination(worldMap: WorldMap) {
  // Wander someonewhere at least one tile away from the edge.
  return {
    x: 1 + Math.floor(Math.random() * (worldMap.width - 2)),
    y: 1 + Math.floor(Math.random() * (worldMap.height - 2)),
  };
}
