import { Trophy } from 'lucide-react';
import ModalShell from './ModalShell';
import { SkeletonCards, LoadingAnnouncer } from './Skeleton';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';

export interface Achievement {
  id: string;
  title: string;
  desc: string;
  icon: string;
  tier: 'bronze' | 'silver' | 'gold' | 'platinum';
  current: number;
  target: number;
  unlocked: boolean;
  xpReward: number;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function AchievementsModal({ isOpen, onClose }: Props) {
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen) return;

    Promise.all([
      api.getStats().catch(() => null),
      api.getStreaks().catch(() => null),
      api.getProgress().catch(() => null),
      api.getActivity(200).catch(() => null),
    ]).then(([stats, streaks, progress, activity]) => {
      const totalDone = stats?.totalDone || 0;
      const longestStreak = streaks?.longestStreak || 0;
      const todayCount = streaks?.todayCount || 0;

      // Count roadmaps with at least 1 done topic
      let roadmapsExplored = 0;
      if (progress?.nodeProgress) {
        for (const prog of Object.values(progress.nodeProgress)) {
          if (Object.values(prog).some((st) => st === 'done')) {
            roadmapsExplored++;
          }
        }
      }

      // Check if night owl (any event between 23:00 and 05:00)
      let hasLateNightStudy = false;
      if (activity?.events) {
        hasLateNightStudy = activity.events.some((ev) => {
          if (!ev.at) return false;
          const h = new Date(ev.at).getHours();
          return h >= 23 || h <= 5;
        });
      }

      const list: Achievement[] = [
        {
          id: 'first_step',
          title: 'First Step',
          desc: 'Complete your first learning topic',
          icon: '🌱',
          tier: 'bronze',
          current: Math.min(1, totalDone),
          target: 1,
          unlocked: totalDone >= 1,
          xpReward: 50,
        },
        {
          id: 'speed_demon',
          title: 'Speed Demon',
          desc: 'Complete 5 learning actions in a single day',
          icon: '⚡',
          tier: 'silver',
          current: Math.min(5, todayCount),
          target: 5,
          unlocked: todayCount >= 5,
          xpReward: 150,
        },
        {
          id: 'streak_master',
          title: 'Consistency King',
          desc: 'Achieve a 7-day study streak',
          icon: '🔥',
          tier: 'silver',
          current: Math.min(7, longestStreak),
          target: 7,
          unlocked: longestStreak >= 7,
          xpReward: 250,
        },
        {
          id: 'polyglot',
          title: 'Polyglot Explorer',
          desc: 'Study topics across 3 or more different roadmaps',
          icon: '🌐',
          tier: 'gold',
          current: Math.min(3, roadmapsExplored),
          target: 3,
          unlocked: roadmapsExplored >= 3,
          xpReward: 300,
        },
        {
          id: 'night_owl',
          title: 'Night Owl',
          desc: 'Complete a study session past 11:00 PM',
          icon: '🦉',
          tier: 'silver',
          current: hasLateNightStudy ? 1 : 0,
          target: 1,
          unlocked: hasLateNightStudy,
          xpReward: 100,
        },
        {
          id: 'centurion',
          title: 'Centurion Scholar',
          desc: 'Master 100 topics across all maps',
          icon: '💯',
          tier: 'platinum',
          current: Math.min(100, totalDone),
          target: 100,
          unlocked: totalDone >= 100,
          xpReward: 500,
        },
      ];

      setAchievements(list);
      setLoading(false);
    });
  }, [isOpen]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const unlockedCount = achievements.filter((a) => a.unlocked).length;
  const totalXP = achievements.filter((a) => a.unlocked).reduce((sum, a) => sum + a.xpReward, 0);

  return (
    <ModalShell
      open={isOpen}
      onClose={onClose}
      width="max-w-2xl"
      label="Quests and achievements"
      title="Quests & achievements"
      subtitle={`${unlockedCount} of ${achievements.length} unlocked · +${totalXP} XP earned`}
      icon={<Trophy className="h-4 w-4" />}
    >

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-3">
          {loading ? (
            <div>
              <LoadingAnnouncer label="Calculating achievements" />
              <SkeletonCards count={6} columns="repeat(auto-fill, minmax(17rem, 1fr))" height="3.5rem" />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {achievements.map((a) => {
                const pct = Math.round((a.current / a.target) * 100);
                const borderGlow = a.unlocked
                  ? a.tier === 'platinum'
                    ? 'border-note/40 bg-note-soft shadow-xs'
                    : a.tier === 'gold'
                    ? 'border-due/40 bg-due-soft shadow-xs'
                    : 'border-done/40 bg-done-soft shadow-xs'
                  : 'border-line opacity-60 bg-raised/50';

                return (
                  <div
                    key={a.id}
                    className={`p-4 rounded-xl border transition-all flex flex-col justify-between ${borderGlow}`}
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-3xl p-1 rounded-lg bg-surface shadow-xs shrink-0">
                        {a.icon}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <h4 className="font-bold text-sm text-ink truncate">
                            {a.title}
                          </h4>
                          <span
                            className={`text-[9px] uppercase font-extrabold px-1.5 py-0.2 rounded ${
                              a.unlocked
                                ? 'bg-done-soft text-done'
                                : 'bg-raised text-ink-muted'
                            }`}
                          >
                            {a.unlocked ? 'Unlocked' : `${a.xpReward} XP`}
                          </span>
                        </div>
                        <p className="text-xs text-ink-muted mt-1 leading-snug">
                          {a.desc}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 pt-2 border-t border-[var(--theme-border)]">
                      <div className="flex items-center justify-between text-[11px] text-ink-muted mb-1">
                        <span>Progress</span>
                        <span className="font-semibold">{a.current} / {a.target} ({pct}%)</span>
                      </div>
                      <div className="w-full bg-active h-1.5 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            a.unlocked ? 'bg-done' : 'bg-learning'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
    </ModalShell>
  );
}
