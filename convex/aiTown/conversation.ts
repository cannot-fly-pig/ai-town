import { ObjectType, v } from 'convex/values';
import { GameId, parseGameId } from './ids';
import { conversationId, playerId } from './ids';
import { Player } from './player';
import { Agent } from './agent';
import { AgentDescription } from './agentDescription';
import { inputHandler } from './inputHandler';

import {
  TYPING_TIMEOUT,
  CONVERSATION_DISTANCE,
  MAX_POPULATION,
  REPRO_COST,
  REPRO_PROB,
  CHILD_NAMES,
  AFFINITY_MIN_DELTA,
  AFFINITY_MAX_DELTA,
  REPRO_AFFINITY,
  CHILDHOOD_MS,
  HATE_THRESHOLD,
  VIOLENCE_PROB,
  ROBBERY_GAP,
  FOOD_COST,
  LETHAL_PROB,
  ROBBERY_STEAL_MIN,
  ROBBERY_STEAL_MAX,
} from '../constants';
import { distance, normalize, vector } from '../util/geometry';
import { Point } from '../util/types';
import { Game } from './game';
import { stopPlayer, blocked, movePlayer } from './movement';
import { ConversationMembership, serializedConversationMembership } from './conversationMembership';
import { parseMap, serializeMap } from '../util/object';

function randAffinityDelta(): number {
  return (
    AFFINITY_MIN_DELTA + Math.floor(Math.random() * (AFFINITY_MAX_DELTA - AFFINITY_MIN_DELTA + 1))
  );
}

// 会話終了ごとに親愛度を更新(各人独立、相性次第で下がり嫌いにもなる)。生殖判定はもうしない(LLM主導)。
function bumpConversationAffinity(game: Game, now: number, conversation: Conversation) {
  const ids = [...conversation.participants.keys()];
  if (ids.length !== 2) return;
  const ps = ids.map((id) => game.world.players.get(id)).filter((p): p is Player => !!p);
  if (ps.length !== 2 || ps.some((p) => p.human)) return;
  const a0 = [...game.world.agents.values()].find((a) => a.playerId === ps[0].id);
  const a1 = [...game.world.agents.values()].find((a) => a.playerId === ps[1].id);
  if (!a0 || !a1) return;
  a0.bumpAffinity(ps[1].id, randAffinityDelta());
  a1.bumpAffinity(ps[0].id, randAffinityDelta());
}

// 配偶者が死んだら残された側の婚姻を解除(再婚可能に)
export function widow(game: Game, deadPlayerId: string) {
  const deadAgent = [...game.world.agents.values()].find((a) => a.playerId === deadPlayerId);
  const spouseId = deadAgent?.spouse;
  if (!spouseId) return;
  const sp = [...game.world.agents.values()].find((a) => a.playerId === spouseId);
  if (sp) delete sp.spouse;
}

// 子を作る(LLMが夫婦合意で「子を望む」と決めた時に呼ばれる)。親が遺産を払い子の初期資産に。
export function createChild(game: Game, now: number, a: Player, b: Player) {
  for (const p of [a, b]) p.money -= REPRO_COST;
  const childMoney = REPRO_COST * 2;
  const d0 = game.playerDescriptions.get(a.id);
  const d1 = game.playerDescriptions.get(b.id);
  const name0 = d0?.name ?? '誰か';
  const name1 = d1?.name ?? '誰か';
  const livingNames = new Set(
    [...game.world.players.values()]
      .map((p) => game.playerDescriptions.get(p.id)?.name)
      .filter((n): n is string => !!n),
  );
  const base = CHILD_NAMES[Math.floor(Math.random() * CHILD_NAMES.length)];
  let childName = base;
  let suffix = 2;
  while (livingNames.has(childName)) {
    childName = `${base}${suffix}`;
    suffix++;
  }
  const character = d0?.character ?? 'f1';
  const identity = `${childName}は${name0}と${name1}の子としてこの町に生まれた。両親の気質を受け継いでいる。世間はまだ知らないが、いつか自分の力で生きていこうとするだろう。`;
  const plan = '世界を知り、いずれ自分の力で生き抜きたい。';
  const childId = Player.join(game, now, childName, character, identity);
  const child = game.world.players.get(childId);
  if (child) {
    child.money = childMoney;
    child.hunger = 0;
    child.bornAt = now;
    child.parentIds = [a.id, b.id];
  }
  const agentId = game.allocId('agents');
  game.world.agents.set(
    agentId,
    new Agent({
      id: agentId,
      playerId: childId,
      inProgressOperation: undefined,
      lastConversation: undefined,
      lastInviteAttempt: undefined,
      toRemember: undefined,
      relationships: {},
    }),
  );
  game.agentDescriptions.set(agentId, new AgentDescription({ agentId, identity, plan }));
  game.descriptionsModified = true;
  game.logEvent(now, 'birth', `${childName} が ${name0} と ${name1} の子として生まれた`);
}

// LLMが「襲う」と決めた時に実行する(判定はLLM側、ここは結果処理)。致死 or 非致死。
export function doAttack(game: Game, now: number, atk: Player, vic: Player) {
  if (vic.human) return;
  const an = game.playerDescriptions.get(atk.id)?.name ?? '誰か';
  const vn = game.playerDescriptions.get(vic.id)?.name ?? '誰か';
  const vicAgent = [...game.world.agents.values()].find((a) => a.playerId === vic.id);
  if (Math.random() < LETHAL_PROB) {
    // 致死: 殺して全額奪う。被害者の会話は畳む(宙ぶらりん防止)
    atk.money += Math.max(0, vic.money);
    const conv = [...game.world.conversations.values()].find((c) => c.participants.has(vic.id));
    if (conv) game.world.conversations.delete(conv.id);
    widow(game, vic.id); // 配偶者がいれば婚姻解除
    if (vicAgent) game.world.agents.delete(vicAgent.id);
    game.world.players.delete(vic.id);
    game.logEvent(now, 'violence', `${an} が ${vn} を殺して金を奪った`);
    // 殺人の噂を町に流す(50%は犯人が知れ渡り、50%は迷宮入り)
    game.spreadRumor(
      now,
      Math.random() < 0.5
        ? `${vn}が殺されたらしい。犯人は${an}だという噂だ。`
        : `${vn}が殺されたらしい。だが犯人はまだ分かっていないという。`,
    );
  } else {
    // 非致死: 一部だけ奪い被害者は生存→恨みとtrauma(噂の種)
    const frac = ROBBERY_STEAL_MIN + Math.random() * (ROBBERY_STEAL_MAX - ROBBERY_STEAL_MIN);
    const steal = Math.floor(Math.max(0, vic.money) * frac);
    vic.money -= steal;
    atk.money += steal;
    if (vicAgent) {
      vicAgent.bumpAffinity(atk.id, -6);
      vicAgent.recentTrauma = { text: `${an}に襲われ、金${steal}を奪われた`, ts: now };
    }
    game.logEvent(now, 'violence', `${an} が ${vn} を襲い金${steal}を奪った(${vn}は生き延びた)`);
  }
}

export class Conversation {
  id: GameId<'conversations'>;
  creator: GameId<'players'>;
  created: number;
  isTyping?: {
    playerId: GameId<'players'>;
    messageUuid: string;
    since: number;
  };
  lastMessage?: {
    author: GameId<'players'>;
    timestamp: number;
  };
  numMessages: number;
  participants: Map<GameId<'players'>, ConversationMembership>;

  constructor(serialized: SerializedConversation) {
    const { id, creator, created, isTyping, lastMessage, numMessages, participants } = serialized;
    this.id = parseGameId('conversations', id);
    this.creator = parseGameId('players', creator);
    this.created = created;
    this.isTyping = isTyping && {
      playerId: parseGameId('players', isTyping.playerId),
      messageUuid: isTyping.messageUuid,
      since: isTyping.since,
    };
    this.lastMessage = lastMessage && {
      author: parseGameId('players', lastMessage.author),
      timestamp: lastMessage.timestamp,
    };
    this.numMessages = numMessages;
    this.participants = parseMap(participants, ConversationMembership, (m) => m.playerId);
  }

  tick(game: Game, now: number) {
    if (this.isTyping && this.isTyping.since + TYPING_TIMEOUT < now) {
      delete this.isTyping;
    }
    if (this.participants.size !== 2) {
      console.warn(`Conversation ${this.id} has ${this.participants.size} participants`);
      return;
    }
    const [playerId1, playerId2] = [...this.participants.keys()];
    const member1 = this.participants.get(playerId1)!;
    const member2 = this.participants.get(playerId2)!;

    const player1 = game.world.players.get(playerId1)!;
    const player2 = game.world.players.get(playerId2)!;

    const playerDistance = distance(player1?.position, player2?.position);

    // If the players are both in the "walkingOver" state and they're sufficiently close, transition both
    // of them to "participating" and stop their paths.
    if (member1.status.kind === 'walkingOver' && member2.status.kind === 'walkingOver') {
      if (playerDistance < CONVERSATION_DISTANCE) {
        console.log(`Starting conversation between ${player1.id} and ${player2.id}`);

        // First, stop the two players from moving.
        stopPlayer(player1);
        stopPlayer(player2);

        member1.status = { kind: 'participating', started: now };
        member2.status = { kind: 'participating', started: now };

        // Try to move the first player to grid point nearest the other player.
        const neighbors = (p: Point) => [
          { x: p.x + 1, y: p.y },
          { x: p.x - 1, y: p.y },
          { x: p.x, y: p.y + 1 },
          { x: p.x, y: p.y - 1 },
        ];
        const floorPos1 = { x: Math.floor(player1.position.x), y: Math.floor(player1.position.y) };
        const p1Candidates = neighbors(floorPos1).filter((p) => !blocked(game, now, p, player1.id));
        p1Candidates.sort((a, b) => distance(a, player2.position) - distance(b, player2.position));
        if (p1Candidates.length > 0) {
          const p1Candidate = p1Candidates[0];

          // Try to move the second player to the grid point nearest the first player's
          // destination.
          const p2Candidates = neighbors(p1Candidate).filter(
            (p) => !blocked(game, now, p, player2.id),
          );
          p2Candidates.sort(
            (a, b) => distance(a, player2.position) - distance(b, player2.position),
          );
          if (p2Candidates.length > 0) {
            const p2Candidate = p2Candidates[0];
            movePlayer(game, now, player1, p1Candidate, true);
            movePlayer(game, now, player2, p2Candidate, true);
          }
        }
      }
    }

    // Orient the two players towards each other if they're not moving.
    if (member1.status.kind === 'participating' && member2.status.kind === 'participating') {
      const v = normalize(vector(player1.position, player2.position));
      if (!player1.pathfinding && v) {
        player1.facing = v;
      }
      if (!player2.pathfinding && v) {
        player2.facing.dx = -v.dx;
        player2.facing.dy = -v.dy;
      }
    }
  }

  static start(game: Game, now: number, player: Player, invitee: Player) {
    if (player.id === invitee.id) {
      throw new Error(`Can't invite yourself to a conversation`);
    }
    // Ensure the players still exist.
    if ([...game.world.conversations.values()].find((c) => c.participants.has(player.id))) {
      const reason = `Player ${player.id} is already in a conversation`;
      console.log(reason);
      return { error: reason };
    }
    if ([...game.world.conversations.values()].find((c) => c.participants.has(invitee.id))) {
      const reason = `Player ${player.id} is already in a conversation`;
      console.log(reason);
      return { error: reason };
    }
    const conversationId = game.allocId('conversations');
    console.log(`Creating conversation ${conversationId}`);
    game.world.conversations.set(
      conversationId,
      new Conversation({
        id: conversationId,
        created: now,
        creator: player.id,
        numMessages: 0,
        participants: [
          { playerId: player.id, invited: now, status: { kind: 'walkingOver' } },
          { playerId: invitee.id, invited: now, status: { kind: 'invited' } },
        ],
      }),
    );
    return { conversationId };
  }

  setIsTyping(now: number, player: Player, messageUuid: string) {
    if (this.isTyping) {
      if (this.isTyping.playerId !== player.id) {
        throw new Error(`Player ${this.isTyping.playerId} is already typing in ${this.id}`);
      }
      return;
    }
    this.isTyping = { playerId: player.id, messageUuid, since: now };
  }

  acceptInvite(game: Game, player: Player) {
    const member = this.participants.get(player.id);
    if (!member) {
      throw new Error(`Player ${player.id} not in conversation ${this.id}`);
    }
    if (member.status.kind !== 'invited') {
      throw new Error(
        `Invalid membership status for ${player.id}:${this.id}: ${JSON.stringify(member)}`,
      );
    }
    member.status = { kind: 'walkingOver' };
  }

  rejectInvite(game: Game, now: number, player: Player) {
    const member = this.participants.get(player.id);
    if (!member) {
      throw new Error(`Player ${player.id} not in conversation ${this.id}`);
    }
    if (member.status.kind !== 'invited') {
      throw new Error(
        `Rejecting invite in wrong membership state: ${this.id}:${player.id}: ${JSON.stringify(
          member,
        )}`,
      );
    }
    this.stop(game, now);
  }

  stop(game: Game, now: number) {
    delete this.isTyping;
    try {
      // 暴力・生殖はLLM駆動。会話終了時は親愛度の更新のみ。
      bumpConversationAffinity(game, now, this);
    } catch (e) {
      console.error('affinity update failed', e);
    }
    for (const [playerId, member] of this.participants.entries()) {
      const agent = [...game.world.agents.values()].find((a) => a.playerId === playerId);
      if (agent) {
        agent.lastConversation = now;
        agent.toRemember = this.id;
      }
    }
    game.world.conversations.delete(this.id);
  }

  leave(game: Game, now: number, player: Player) {
    const member = this.participants.get(player.id);
    if (!member) {
      throw new Error(`Couldn't find membership for ${this.id}:${player.id}`);
    }
    this.stop(game, now);
  }

  serialize(): SerializedConversation {
    const { id, creator, created, isTyping, lastMessage, numMessages } = this;
    return {
      id,
      creator,
      created,
      isTyping,
      lastMessage,
      numMessages,
      participants: serializeMap(this.participants),
    };
  }
}

export const serializedConversation = {
  id: conversationId,
  creator: playerId,
  created: v.number(),
  isTyping: v.optional(
    v.object({
      playerId,
      messageUuid: v.string(),
      since: v.number(),
    }),
  ),
  lastMessage: v.optional(
    v.object({
      author: playerId,
      timestamp: v.number(),
    }),
  ),
  numMessages: v.number(),
  participants: v.array(v.object(serializedConversationMembership)),
};
export type SerializedConversation = ObjectType<typeof serializedConversation>;

export const conversationInputs = {
  // Start a conversation, inviting the specified player.
  // Conversations can only have two participants for now,
  // so we don't have a separate "invite" input.
  startConversation: inputHandler({
    args: {
      playerId,
      invitee: playerId,
    },
    handler: (game: Game, now: number, args): GameId<'conversations'> => {
      const playerId = parseGameId('players', args.playerId);
      const player = game.world.players.get(playerId);
      if (!player) {
        throw new Error(`Invalid player ID: ${playerId}`);
      }
      const inviteeId = parseGameId('players', args.invitee);
      const invitee = game.world.players.get(inviteeId);
      if (!invitee) {
        throw new Error(`Invalid player ID: ${inviteeId}`);
      }
      console.log(`Starting ${playerId} ${inviteeId}...`);
      const { conversationId, error } = Conversation.start(game, now, player, invitee);
      if (!conversationId) {
        // TODO: pass it back to the client for them to show an error.
        throw new Error(error);
      }
      return conversationId;
    },
  }),

  startTyping: inputHandler({
    args: {
      playerId,
      conversationId,
      messageUuid: v.string(),
    },
    handler: (game: Game, now: number, args): null => {
      const playerId = parseGameId('players', args.playerId);
      const player = game.world.players.get(playerId);
      if (!player) {
        throw new Error(`Invalid player ID: ${playerId}`);
      }
      const conversationId = parseGameId('conversations', args.conversationId);
      const conversation = game.world.conversations.get(conversationId);
      if (!conversation) {
        throw new Error(`Invalid conversation ID: ${conversationId}`);
      }
      if (conversation.isTyping && conversation.isTyping.playerId !== playerId) {
        throw new Error(
          `Player ${conversation.isTyping.playerId} is already typing in ${conversationId}`,
        );
      }
      conversation.isTyping = { playerId, messageUuid: args.messageUuid, since: now };
      return null;
    },
  }),

  finishSendingMessage: inputHandler({
    args: {
      playerId,
      conversationId,
      timestamp: v.number(),
    },
    handler: (game: Game, now: number, args): null => {
      const playerId = parseGameId('players', args.playerId);
      const conversationId = parseGameId('conversations', args.conversationId);
      const conversation = game.world.conversations.get(conversationId);
      if (!conversation) {
        throw new Error(`Invalid conversation ID: ${conversationId}`);
      }
      if (conversation.isTyping && conversation.isTyping.playerId === playerId) {
        delete conversation.isTyping;
      }
      conversation.lastMessage = { author: playerId, timestamp: args.timestamp };
      conversation.numMessages++;
      return null;
    },
  }),

  // Accept an invite to a conversation, which puts the
  // player in the "walkingOver" state until they're close
  // enough to the other participant.
  acceptInvite: inputHandler({
    args: {
      playerId,
      conversationId,
    },
    handler: (game: Game, now: number, args): null => {
      const playerId = parseGameId('players', args.playerId);
      const player = game.world.players.get(playerId);
      if (!player) {
        throw new Error(`Invalid player ID ${playerId}`);
      }
      const conversationId = parseGameId('conversations', args.conversationId);
      const conversation = game.world.conversations.get(conversationId);
      if (!conversation) {
        throw new Error(`Invalid conversation ID ${conversationId}`);
      }
      conversation.acceptInvite(game, player);
      return null;
    },
  }),

  // Reject the invite. Eventually we might add a message
  // that explains why!
  rejectInvite: inputHandler({
    args: {
      playerId,
      conversationId,
    },
    handler: (game: Game, now: number, args): null => {
      const playerId = parseGameId('players', args.playerId);
      const player = game.world.players.get(playerId);
      if (!player) {
        throw new Error(`Invalid player ID ${playerId}`);
      }
      const conversationId = parseGameId('conversations', args.conversationId);
      const conversation = game.world.conversations.get(conversationId);
      if (!conversation) {
        throw new Error(`Invalid conversation ID ${conversationId}`);
      }
      conversation.rejectInvite(game, now, player);
      return null;
    },
  }),
  // Leave a conversation.
  leaveConversation: inputHandler({
    args: {
      playerId,
      conversationId,
    },
    handler: (game: Game, now: number, args): null => {
      const playerId = parseGameId('players', args.playerId);
      const player = game.world.players.get(playerId);
      if (!player) {
        throw new Error(`Invalid player ID ${playerId}`);
      }
      const conversationId = parseGameId('conversations', args.conversationId);
      const conversation = game.world.conversations.get(conversationId);
      if (!conversation) {
        throw new Error(`Invalid conversation ID ${conversationId}`);
      }
      conversation.leave(game, now, player);
      return null;
    },
  }),
};
