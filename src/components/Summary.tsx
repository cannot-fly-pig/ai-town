import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { PROJECT_GOAL, PROJECT_TARGET } from '../../convex/constants';

function fmt(t: number) {
  return new Date(t).toLocaleString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function icon(kind: string) {
  if (kind === 'birth') return '👶';
  if (kind === 'violence') return '💀';
  if (kind === 'death') return '🪦';
  if (kind === 'marriage') return '💍';
  if (kind === 'project') return '🚢';
  return '•';
}

export default function Summary() {
  const worldStatus = useQuery(api.world.defaultWorldStatus);
  const worldId = worldStatus?.worldId;
  const events = useQuery(api.world.recentEvents, worldId ? { worldId } : 'skip');
  const convos = useQuery(api.world.recentConversationSummaries, worldId ? { worldId } : 'skip');
  const worldState = useQuery(api.world.worldState, worldId ? { worldId } : 'skip');
  const descs = useQuery(api.world.gameDescriptions, worldId ? { worldId } : 'skip');

  const nameOf = new Map<string, string>(
    ((descs as any)?.playerDescriptions ?? []).map((d: any) => [d.playerId, d.name]),
  );
  const players = [...(((worldState as any)?.world?.players as any[]) ?? [])]
    .map((p: any) => ({
      name: nameOf.get(p.id) ?? '?',
      money: Math.floor(p.money ?? 0),
      hunger: Math.floor(p.hunger ?? 0),
      child: !!p.bornAt,
      act: p.activity?.description ?? '—',
    }))
    .sort((a, b) => b.money - a.money);

  return (
    <div className="font-body text-white" style={{ minWidth: '56vw' }}>
      <h1 className="text-center text-5xl font-display game-title mb-4">町の記録</h1>

      <h2 className="text-3xl mt-2 mb-1">🚢 村の悲願（{PROJECT_GOAL}）</h2>
      <div className="bg-black/30 p-2 mb-3 text-base">
        {(() => {
          const fund = Math.floor((worldState as any)?.world?.projectFund ?? 0);
          const pct = Math.min(100, (fund / PROJECT_TARGET) * 100);
          return (
            <>
              <div className="flex justify-between">
                <span>建造資金</span>
                <span>
                  {fund} / {PROJECT_TARGET}
                </span>
              </div>
              <div className="mt-1 h-3 bg-black/40 rounded">
                <div className="h-full bg-emerald-500 rounded" style={{ width: `${pct}%` }} />
              </div>
            </>
          );
        })()}
      </div>

      <h2 className="text-3xl mt-2 mb-1">📜 出来事</h2>
      <div className="max-h-48 overflow-y-auto bg-black/30 p-2 text-base leading-snug">
        {(events ?? []).map((e: any) => (
          <div key={e._id}>
            {icon(e.kind)} <span className="text-stone-400">{fmt(e.ts)}</span> {e.text}
          </div>
        ))}
        {events && events.length === 0 && <div className="text-stone-400">まだ何も起きていない</div>}
      </div>

      <h2 className="text-3xl mt-4 mb-1">🏘️ 住人と稼ぎ（所持金順）</h2>
      <div className="bg-black/30 p-2 text-base leading-snug">
        {players.map((p, i) => (
          <div key={i} className="flex justify-between gap-4">
            <span>
              {p.child ? '👶' : '　'}
              {p.name} <span className="text-stone-400">{p.act}</span>
            </span>
            <span className="whitespace-nowrap">
              💰{p.money} 🍖{p.hunger}
            </span>
          </div>
        ))}
        {players.length === 0 && <div className="text-stone-400">読み込み中…</div>}
      </div>

      <h2 className="text-3xl mt-4 mb-1">💬 会話の要約</h2>
      <div className="max-h-72 overflow-y-auto bg-black/30 p-2 text-base leading-snug space-y-2">
        {(convos ?? []).map((c: any, i: number) => (
          <div key={i}>
            <div className="text-stone-400">
              {fmt(c.creationTime)}・{c.author} ↔ {c.others.join('、')}
            </div>
            <div>{c.summary}</div>
          </div>
        ))}
        {convos && convos.length === 0 && (
          <div className="text-stone-400">まだ会話の記録がない</div>
        )}
      </div>
    </div>
  );
}
