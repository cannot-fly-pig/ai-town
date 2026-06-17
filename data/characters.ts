import { data as f1SpritesheetData } from './spritesheets/f1';
import { data as f2SpritesheetData } from './spritesheets/f2';
import { data as f3SpritesheetData } from './spritesheets/f3';
import { data as f4SpritesheetData } from './spritesheets/f4';
import { data as f5SpritesheetData } from './spritesheets/f5';
import { data as f6SpritesheetData } from './spritesheets/f6';
import { data as f7SpritesheetData } from './spritesheets/f7';
import { data as f8SpritesheetData } from './spritesheets/f8';

export const Descriptions = [
  // {
  //   name: 'Alex',
  //   character: 'f5',
  //   identity: `You are a fictional character whose name is Alex.  You enjoy painting,
  //     programming and reading sci-fi books.  You are currently talking to a human who
  //     is very interested to get to know you. You are kind but can be sarcastic. You
  //     dislike repetitive questions. You get SUPER excited about books.`,
  //   plan: 'You want to find love.',
  // },
  {
    name: 'タケシ',
    character: 'f1',
    identity: `タケシはこの町の日雇い労働者。貧しいが正直で、よく働く。食うや食わずの暮らしで、いつか金の心配なく暮らせる日を夢見ている。理不尽な扱いには弱く、追い詰められれば何をするか自分でも分からない。`,
    plan: 'まじめに働いて、その日の食い扶持を稼ぎたい。',
  },
  {
    name: 'ゴロウ',
    character: 'f4',
    identity: `ゴロウはけちで不機嫌な老いた農夫。金を貯め込み、誰のことも信用しない。一銭たりとも使いたがらず、施しなど論外だ。本当は孤独だが、それを認めるくらいなら口を閉ざす。`,
    plan: 'とにかく金を貯め込み、一銭も減らさないようにしたい。',
  },
  {
    name: 'アヤ',
    character: 'f6',
    identity: `アヤは口がうまく、人の金を巻き上げて生きている女。とても魅力的で、その魅力を使うことを少しもためらわない。良心というものがなく、相手を丸め込んで儲けることしか考えていないが、それを上手に隠している。`,
    plan: '隙あらば他人を言葉巧みに丸め込み、金を引き出したい。',
  },
  // {
  //   name: 'Kurt',
  //   character: 'f2',
  //   identity: `Kurt knows about everything, including science and
  //     computers and politics and history and biology. He loves talking about
  //     everything, always injecting fun facts about the topic of discussion.`,
  //   plan: 'You want to spread knowledge.',
  // },
  {
    name: 'ミサキ',
    character: 'f3',
    identity: `ミサキは抜け目のない野心家の商人。頭が切れ、取引と駆け引きで富を築こうと常に算盤を弾いている。打算的で、損得でしか動かない。情に流されることはまずない。`,
    plan: '商売と取引で人より上に立ち、財を成したい。',
  },
  {
    name: 'ケンジ',
    character: 'f7',
    identity: `ケンジは短気で気位が高く、些細なことでも侮辱と受け取る男。面子と義理を何より重んじ、一度抱いた恨みは忘れない。軽んじられたり、金に困って追い詰められると、力ずくに訴えることをためらわない。`,
    plan: '誰にも舐められたくない。自分の取り分は力ずくでも守り、奪い返す。',
  },
  {
    name: 'ハナ',
    character: 'f5',
    identity: `ハナは若い女。その日暮らしで生活は苦しいが、いつか信頼できる相手と家庭を築き、大切な人を守りたいと願っている。気は強く情に厚いが、自分が生き延びることにも必死だ。`,
    plan: '信頼できる相手を見つけ、家庭を築いて生き抜きたい。',
  },
  // {
  //   name: 'Kira',
  //   character: 'f8',
  //   identity: `Kira wants everyone to think she is happy. But deep down,
  //     she's incredibly depressed. She hides her sadness by talking about travel,
  //     food, and yoga. But often she can't keep her sadness in and will start crying.
  //     Often it seems like she is close to having a mental breakdown.`,
  //   plan: 'You want find a way to be happy.',
  // },
];

export const characters = [
  {
    name: 'f1',
    textureUrl: '/ai-town/assets/32x32folk.png',
    spritesheetData: f1SpritesheetData,
    speed: 0.1,
  },
  {
    name: 'f2',
    textureUrl: '/ai-town/assets/32x32folk.png',
    spritesheetData: f2SpritesheetData,
    speed: 0.1,
  },
  {
    name: 'f3',
    textureUrl: '/ai-town/assets/32x32folk.png',
    spritesheetData: f3SpritesheetData,
    speed: 0.1,
  },
  {
    name: 'f4',
    textureUrl: '/ai-town/assets/32x32folk.png',
    spritesheetData: f4SpritesheetData,
    speed: 0.1,
  },
  {
    name: 'f5',
    textureUrl: '/ai-town/assets/32x32folk.png',
    spritesheetData: f5SpritesheetData,
    speed: 0.1,
  },
  {
    name: 'f6',
    textureUrl: '/ai-town/assets/32x32folk.png',
    spritesheetData: f6SpritesheetData,
    speed: 0.1,
  },
  {
    name: 'f7',
    textureUrl: '/ai-town/assets/32x32folk.png',
    spritesheetData: f7SpritesheetData,
    speed: 0.1,
  },
  {
    name: 'f8',
    textureUrl: '/ai-town/assets/32x32folk.png',
    spritesheetData: f8SpritesheetData,
    speed: 0.1,
  },
];

// Characters move at 0.75 tiles per second.
export const movementSpeed = 0.75;
