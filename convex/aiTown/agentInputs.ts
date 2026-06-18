import { v } from 'convex/values';
import { agentId, conversationId, parseGameId, playerId } from './ids';
import { Player, activity } from './player';
import { Conversation, conversationInputs, doAttack, createChild } from './conversation';
import { movePlayer } from './movement';
import { inputHandler } from './inputHandler';
import { point } from '../util/types';
import { Descriptions } from '../../data/characters';
import { AgentDescription } from './agentDescription';
import { Agent } from './agent';
import {
  matchJob,
  CHILDHOOD_MS,
  REPRO_COST,
  MAX_POPULATION,
  MARRIAGE_AFFINITY,
  PROJECT_TARGET,
  PROJECT_GOAL,
} from '../constants';

export const agentInputs = {
  finishRememberConversation: inputHandler({
    args: {
      operationId: v.string(),
      agentId,
    },
    handler: (game, now, args) => {
      const agentId = parseGameId('agents', args.agentId);
      const agent = game.world.agents.get(agentId);
      if (!agent) {
        throw new Error(`Couldn't find agent: ${agentId}`);
      }
      if (
        !agent.inProgressOperation ||
        agent.inProgressOperation.operationId !== args.operationId
      ) {
        console.debug(`Agent ${agentId} isn't remembering ${args.operationId}`);
      } else {
        delete agent.inProgressOperation;
        delete agent.toRemember;
      }
      return null;
    },
  }),
  finishDoSomething: inputHandler({
    args: {
      operationId: v.string(),
      agentId: v.id('agents'),
      destination: v.optional(point),
      invitee: v.optional(v.id('players')),
      activity: v.optional(activity),
    },
    handler: (game, now, args) => {
      const agentId = parseGameId('agents', args.agentId);
      const agent = game.world.agents.get(agentId);
      if (!agent) {
        throw new Error(`Couldn't find agent: ${agentId}`);
      }
      if (
        !agent.inProgressOperation ||
        agent.inProgressOperation.operationId !== args.operationId
      ) {
        console.debug(`Agent ${agentId} didn't have ${args.operationId} in progress`);
        return null;
      }
      delete agent.inProgressOperation;
      const player = game.world.players.get(agent.playerId)!;
      if (args.invitee) {
        const inviteeId = parseGameId('players', args.invitee);
        const invitee = game.world.players.get(inviteeId);
        if (!invitee) {
          throw new Error(`Couldn't find player: ${inviteeId}`);
        }
        Conversation.start(game, now, player, invitee);
        agent.lastInviteAttempt = now;
      }
      if (args.destination) {
        movePlayer(game, now, player, args.destination);
      }
      if (args.activity) {
        player.activity = args.activity;
        // 労働判定: 行動が仕事に該当すれば金を得て空腹が増す(隠し職ほど高給)
        // 子供は働けない(稼げない)
        const isChild = player.bornAt !== undefined && now - player.bornAt < CHILDHOOD_MS;
        const job = matchJob(args.activity.description);
        if (job && !isChild) {
          player.money += job.pay;
          player.hunger = Math.min(100, player.hunger + job.hunger);
        }
      }
      return null;
    },
  }),
  // LLMが会話中に選んだ行動を実行する(give=送金 / attack=襲撃 / ask=台詞のみ)
  agentAction: inputHandler({
    args: {
      actor: playerId,
      target: playerId,
      kind: v.string(),
      amount: v.number(),
    },
    handler: (game, now, args) => {
      const actor = game.world.players.get(parseGameId('players', args.actor));
      const target = game.world.players.get(parseGameId('players', args.target));
      if (!actor || !target) return null;
      const agentOf = (pid: typeof actor.id) =>
        [...game.world.agents.values()].find((a) => a.playerId === pid);
      const isChild = (p: Player) => p.bornAt !== undefined && now - p.bornAt < CHILDHOOD_MS;
      if (args.kind === 'give') {
        const amt = Math.min(Math.max(0, Math.floor(args.amount)), actor.money);
        if (amt > 0) {
          actor.money -= amt;
          target.money += amt;
        }
      } else if (args.kind === 'attack') {
        doAttack(game, now, actor, target);
      } else if (args.kind === 'propose') {
        // 結婚: 深い相互の絆(高い親愛度)がある独身同士だけ成立(なんとなく結婚を防ぐ)
        const aA = agentOf(actor.id);
        const aT = agentOf(target.id);
        if (
          aA &&
          aT &&
          !aA.spouse &&
          !aT.spouse &&
          (aA.relationships[target.id] ?? 0) >= MARRIAGE_AFFINITY
        ) {
          aA.proposeTo = target.id;
          if (
            aT.proposeTo === actor.id &&
            (aT.relationships[actor.id] ?? 0) >= MARRIAGE_AFFINITY
          ) {
            aA.spouse = target.id;
            aT.spouse = actor.id;
            delete aA.proposeTo;
            delete aT.proposeTo;
            const n1 = game.playerDescriptions.get(actor.id)?.name ?? '誰か';
            const n2 = game.playerDescriptions.get(target.id)?.name ?? '誰か';
            game.logEvent(now, 'marriage', `${n1} と ${n2} が深く愛し合い結婚した`);
          }
        }
      } else if (args.kind === 'donate') {
        // 共同建造への拠出(金の出口)。完成したら祝祭イベント
        const amt = Math.min(Math.max(0, Math.floor(args.amount)), actor.money);
        if (amt > 0) {
          const before = game.world.projectFund;
          actor.money -= amt;
          game.world.projectFund += amt;
          if (before < PROJECT_TARGET && game.world.projectFund >= PROJECT_TARGET) {
            game.logEvent(now, 'project', `${PROJECT_GOAL}がついに完成した！村人の悲願が叶った。`);
          }
        }
      } else if (args.kind === 'child') {
        // 子を望む。夫婦かつ双方が望み、両者が養育費を払えれば誕生
        const aA = agentOf(actor.id);
        const aT = agentOf(target.id);
        if (
          aA &&
          aT &&
          aA.spouse === target.id &&
          aT.spouse === actor.id &&
          !isChild(actor) &&
          !isChild(target)
        ) {
          aA.wantChildWith = target.id;
          if (
            aT.wantChildWith === actor.id &&
            actor.money >= REPRO_COST &&
            target.money >= REPRO_COST &&
            game.world.players.size < MAX_POPULATION
          ) {
            delete aA.wantChildWith;
            delete aT.wantChildWith;
            createChild(game, now, actor, target);
          }
        }
      }
      // 'ask'(送金依頼)は発言そのもので相手に伝わるため、エンジン側の処理は無し
      return null;
    },
  }),
  agentFinishSendingMessage: inputHandler({
    args: {
      agentId,
      conversationId,
      timestamp: v.number(),
      operationId: v.string(),
      leaveConversation: v.boolean(),
    },
    handler: (game, now, args) => {
      const agentId = parseGameId('agents', args.agentId);
      const agent = game.world.agents.get(agentId);
      if (!agent) {
        throw new Error(`Couldn't find agent: ${agentId}`);
      }
      const player = game.world.players.get(agent.playerId);
      if (!player) {
        throw new Error(`Couldn't find player: ${agent.playerId}`);
      }
      const conversationId = parseGameId('conversations', args.conversationId);
      const conversation = game.world.conversations.get(conversationId);
      if (!conversation) {
        throw new Error(`Couldn't find conversation: ${conversationId}`);
      }
      if (
        !agent.inProgressOperation ||
        agent.inProgressOperation.operationId !== args.operationId
      ) {
        console.debug(`Agent ${agentId} wasn't sending a message ${args.operationId}`);
        return null;
      }
      delete agent.inProgressOperation;
      conversationInputs.finishSendingMessage.handler(game, now, {
        playerId: agent.playerId,
        conversationId: args.conversationId,
        timestamp: args.timestamp,
      });
      if (args.leaveConversation) {
        conversation.leave(game, now, player);
      }
      return null;
    },
  }),
  createAgent: inputHandler({
    args: {
      descriptionIndex: v.number(),
    },
    handler: (game, now, args) => {
      const description = Descriptions[args.descriptionIndex];
      const playerId = Player.join(
        game,
        now,
        description.name,
        description.character,
        description.identity,
      );
      const agentId = game.allocId('agents');
      game.world.agents.set(
        agentId,
        new Agent({
          id: agentId,
          playerId: playerId,
          inProgressOperation: undefined,
          lastConversation: undefined,
          lastInviteAttempt: undefined,
          toRemember: undefined,
        }),
      );
      game.agentDescriptions.set(
        agentId,
        new AgentDescription({
          agentId: agentId,
          identity: description.identity,
          plan: description.plan,
        }),
      );
      return { agentId };
    },
  }),
};
