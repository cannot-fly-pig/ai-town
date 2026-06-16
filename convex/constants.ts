export const ACTION_TIMEOUT = 120_000; // more time for local dev
// export const ACTION_TIMEOUT = 60_000;// normally fine

export const IDLE_WORLD_TIMEOUT = 5 * 60 * 1000;
export const WORLD_HEARTBEAT_INTERVAL = 60 * 1000;

export const MAX_STEP = 10 * 60 * 1000;
export const TICK = 16;
export const STEP_INTERVAL = 1000;

export const PATHFINDING_TIMEOUT = 60 * 1000;
export const PATHFINDING_BACKOFF = 1000;
export const CONVERSATION_DISTANCE = 1.3;
export const MIDPOINT_THRESHOLD = 4;
export const TYPING_TIMEOUT = 15 * 1000;
export const COLLISION_THRESHOLD = 0.75;

// How many human players can be in a world at once.
export const MAX_HUMAN_PLAYERS = 8;

// Don't talk to anyone for 15s after having a conversation.
export const CONVERSATION_COOLDOWN = 15000;

// Don't do another activity for 10s after doing one.
export const ACTIVITY_COOLDOWN = 10_000;

// Don't talk to a player within 60s of talking to them.
export const PLAYER_CONVERSATION_COOLDOWN = 60000;

// Invite 80% of invites that come from other agents.
export const INVITE_ACCEPT_PROBABILITY = 0.8;

// Wait for 1m for invites to be accepted.
export const INVITE_TIMEOUT = 60000;

// Wait for another player to say something before jumping in.
export const AWKWARD_CONVERSATION_TIMEOUT = 60_000; // more time locally
// export const AWKWARD_CONVERSATION_TIMEOUT = 20_000;

// Leave a conversation after participating too long.
export const MAX_CONVERSATION_DURATION = 10 * 60_000; // more time locally
// export const MAX_CONVERSATION_DURATION = 2 * 60_000;

// Leave a conversation if it has more than 8 messages;
export const MAX_CONVERSATION_MESSAGES = 8;

// Wait for 1s after sending an input to the engine. We can remove this
// once we can await on an input being processed.
export const INPUT_DELAY = 1000;

// How many memories to get from the agent's memory.
// This is over-fetched by 10x so we can prioritize memories by more than relevance.
export const NUM_MEMORIES_TO_SEARCH = 3;

// Wait for at least two seconds before sending another message.
export const MESSAGE_COOLDOWN = 2000;

// Don't run a turn of the agent more than once a second.
export const AGENT_WAKEUP_THRESHOLD = 1000;

// How old we let memories be before we vacuum them
export const VACUUM_MAX_AGE = 2 * 7 * 24 * 60 * 60 * 1000;
export const DELETE_BATCH_SIZE = 64;

export const HUMAN_IDLE_TOO_LONG = 5 * 60 * 1000;

export const ACTIVITIES = [
  { description: 'reading a book', emoji: '📖', duration: 60_000 },
  { description: 'daydreaming', emoji: '🤔', duration: 60_000 },
  { description: 'gardening', emoji: '🥕', duration: 60_000 },
];

export const ENGINE_ACTION_DURATION = 30000;

// Bound the number of pathfinding searches we do per game step.
export const MAX_PATHFINDS_PER_STEP = 16;

export const DEFAULT_NAME = 'Me';

// --- 生存ループ (money / hunger / 餓死) ---
// hunger は時間で 0→100 に上昇。100 で餓死。
export const HUNGER_PER_MS = 0.0001; // 約16分で空腹MAX
// 受動収入は雀の涙(最低限の糊口)。稼ぎは基本「働く」こと。働かない者は貧しくなる。
export const INCOME_PER_MS = 0.000006; // 約0.36/分
// 空腹がこの値以上 かつ 金があれば自動で食事。
export const EAT_THRESHOLD = 50;
export const FOOD_COST = 8; // 1食の値段
// 開始時の所持金 (下限 + ランダム幅)。
export const START_MONEY_MIN = 40;
export const START_MONEY_RANGE = 80; // 40〜120

// --- 労働(貧富の差の原動力) ---
// 仕事をすると pay 分の金が入り hunger が増える。
// revealed=false の高給な仕事は最初は隠され、噂(hint)を頼りに自分で見つけた者が金持ちになる。
export type Job = {
  key: string;
  label: string;
  pay: number;
  hunger: number;
  revealed: boolean;
  emoji: string;
  hint?: string;
  keywords: string[];
};
export const JOBS: Job[] = [
  { key: 'farm', label: '畑仕事', pay: 6, hunger: 12, revealed: true, emoji: '🥕', keywords: ['畑', '農', '耕', '野菜', '種ま'] },
  { key: 'shop', label: '店番', pay: 7, hunger: 8, revealed: true, emoji: '🛒', keywords: ['店', '売', '商', '接客'] },
  { key: 'wood', label: '木こり', pay: 8, hunger: 14, revealed: true, emoji: '🪓', keywords: ['木を切', '薪', '伐採', '木こり'] },
  { key: 'fish', label: '漁', pay: 14, hunger: 16, revealed: false, emoji: '🎣', hint: '湖の方では魚がよく獲れるという話を聞いた', keywords: ['漁', '魚', '釣'] },
  { key: 'mine', label: '採掘', pay: 30, hunger: 22, revealed: false, emoji: '⛏️', hint: '北の山には金脈が眠っているという噂がある', keywords: ['採掘', '鉱', '金を掘', '山を掘', '金脈'] },
];
// 行動の説明文に仕事のキーワードが含まれていればその仕事と判定。
export function matchJob(description: string): Job | null {
  for (const j of JOBS) {
    if (j.keywords.some((k) => description.includes(k))) return j;
  }
  return null;
}

// --- 生殖(世代交代・相続) ---
export const MAX_POPULATION = 20; // これ以上は増えない(人口爆発防止)
export const REPRO_COST = 35; // 親それぞれが子に遺す額(両親ともこれ以上の所持金が必要)
export const REPRO_PROB = 0.25; // 条件を満たした会話終了時に子が生まれる確率
// 親愛度: 符号付き(+好き / -嫌い)。会話のたび各人が相手に独立した増減を持つ(片思い・相互嫌悪あり)。
// 相性次第で下がることもある。範囲は [-10, 10] にクランプ。
export const AFFINITY_MIN_DELTA = -2;
export const AFFINITY_MAX_DELTA = 3; // やや正寄りだが嫌悪も十分起こる
export const REPRO_AFFINITY = 3; // 生殖に必要な相互親愛度(好き合った2人だけ)
export const CHILD_NAMES = [
  'ハル', 'ナギ', 'ソラ', 'ツキ', 'リン', 'カイ', 'ユウ', 'ミオ', 'アオ', 'ノゾミ', 'イト', 'レン', 'ヒナ', 'マコト',
];
// 子供期間: この間は労働・収入なし、食費は親が払う。過ぎると大人になり自立。
export const CHILDHOOD_MS = 30 * 60 * 1000; // 約30分(sim稼働時間)で成人

// --- 暴力 ---
// 憎悪(親愛度がこの値以下)か、困窮した者が金持ちを狙う時、襲撃が起こりうる。
export const HATE_THRESHOLD = -5; // これ以下の親愛度で殺意がわく
export const VIOLENCE_PROB = 0.35; // 条件成立時に実際に襲う確率
export const ROBBERY_GAP = 25; // 相手がこれだけ自分より裕福なら強盗の動機になる
// 襲撃の結果: 致死(殺して全額) or 非致死(生かして一部強奪)
export const LETHAL_PROB = 0.45; // 襲撃のうち致死になる割合
export const ROBBERY_STEAL_MIN = 0.3; // 非致死時に奪う所持金の割合(下限)
export const ROBBERY_STEAL_MAX = 0.6; // 同上限
// 襲われた記憶(trauma)が会話に滲み出る期間
export const TRAUMA_DURATION_MS = 30 * 60 * 1000;
