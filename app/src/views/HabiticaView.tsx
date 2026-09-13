import { useEffect, useState } from 'react';
import {
  Award,
  Check,
  Coins,
  Flame,
  Heart,
  Loader2,
  Minus,
  Plus,
  PlusCircle,
  RefreshCw,
  Shield,
  Sparkles,
  Trash2,
  Zap,
} from 'lucide-react';
import { api, type HabiticaProfile, type HabiticaTask } from '../lib/api';

const DIFFICULTY_LABELS: Record<number, { label: string; color: string }> = {
  0.1: { label: 'Trivial', color: 'text-[var(--theme-text-faint)] bg-[var(--theme-border)] border-[var(--theme-border)]' },
  1: { label: 'Easy', color: 'text-done bg-done/10 border-done/20' },
  1.5: { label: 'Medium', color: 'text-exp bg-exp/10 border-exp/20' },
  2: { label: 'Hard', color: 'text-hp bg-hp/10 border-hp/20' },
};

export default function HabiticaView() {
  const [profile, setProfile] = useState<HabiticaProfile | null>(null);
  const [tasks, setTasks] = useState<HabiticaTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'dailys' | 'habits' | 'todos'>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [scoringId, setScoringId] = useState<string | null>(null);
  const [flashMsg, setFlashMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // New task form state
  const [newTaskText, setNewTaskText] = useState('');
  const [newTaskType, setNewTaskType] = useState<'daily' | 'habit' | 'todo'>('daily');
  const [newTaskPriority, setNewTaskPriority] = useState<number>(1.5);
  const [newTaskNotes, setNewTaskNotes] = useState('');
  const [newTaskTag, setNewTaskTag] = useState('');

  async function loadData() {
    setLoading(true);
    try {
      const [p, t] = await Promise.all([
        api.getHabiticaProfile().catch(() => ({ configured: false })),
        api.getHabiticaTasks().then((r) => r.tasks).catch(() => []),
      ]);
      setProfile(p);
      setTasks(t);
    } catch (err: any) {
      console.warn('Failed to load Habitica data:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  function notify(text: string, type: 'ok' | 'err' = 'ok') {
    setFlashMsg({ type, text });
    setTimeout(() => setFlashMsg(null), 4000);
  }

  async function handleScore(task: HabiticaTask, direction: 'up' | 'down') {
    const id = task.id || task._id;
    if (!id) return;
    setScoringId(id);

    // Identify if task maps to a roadmap key
    let roadmapKey: string | undefined = undefined;
    const text = task.text.toLowerCase();
    if (task.notes?.includes('roadmapKey:')) {
      const m = task.notes.match(/roadmapKey:([a-z0-9-]+)/);
      if (m) roadmapKey = m[1];
    } else if (text.includes('problem of the day')) roadmapKey = 'lc-potd';
    else if (text.includes('random problem')) roadmapKey = 'lc-random';
    else if (text.includes('quest')) roadmapKey = 'lc-quest';
    else if (text.includes('study plan')) roadmapKey = 'lc-studyplan';
    else if (text.includes('neetcode')) roadmapKey = 'nc-daily';
    else if (text.includes('project euler')) roadmapKey = 'euler-daily';
    else if (text.includes('4 roadmap topics')) roadmapKey = 'rm-topics';

    try {
      await api.scoreHabiticaTask(id, direction, roadmapKey);
      // Optimistically update local task state
      setTasks((prev) =>
        prev.map((t) => {
          if ((t.id || t._id) === id) {
            if (t.type === 'daily' || t.type === 'todo') {
              return { ...t, completed: direction === 'up' };
            }
          }
          return t;
        }),
      );
      notify(direction === 'up' ? `Completed "${task.text}"! +XP & Gold` : `Unchecked "${task.text}"`);
      // Refresh profile stats
      api.getHabiticaProfile().then(setProfile).catch(() => {});
    } catch (err: any) {
      notify(`Action failed: ${err.message}`, 'err');
    } finally {
      setScoringId(null);
    }
  }

  async function handleDelete(taskId: string) {
    if (!confirm('Are you sure you want to delete this Habitica task?')) return;
    try {
      await api.deleteHabiticaTask(taskId);
      setTasks((prev) => prev.filter((t) => (t.id || t._id) !== taskId));
      notify('Task deleted');
    } catch (err: any) {
      notify(`Delete failed: ${err.message}`, 'err');
    }
  }

  async function handleSyncDailies() {
    setSyncing(true);
    try {
      const res = await api.syncHabiticaDailies();
      if (res.ok) {
        notify(`Dailies synced! Provisioned: ${res.created?.length || 0}, Linked: ${res.matched?.length || 0}`);
        await loadData();
      } else {
        notify(`Sync error: ${res.error}`, 'err');
      }
    } catch (err: any) {
      notify(`Sync failed: ${err.message}`, 'err');
    } finally {
      setSyncing(false);
    }
  }

  async function handleCreateTask(e: React.FormEvent) {
    e.preventDefault();
    if (!newTaskText.trim()) return;
    try {
      const res = await api.createHabiticaTask({
        text: newTaskText.trim(),
        type: newTaskType,
        priority: newTaskPriority,
        notes: newTaskNotes.trim(),
        tags: newTaskTag ? [newTaskTag] : [],
      });
      if (res.ok && res.task) {
        setTasks((prev) => [res.task, ...prev]);
        setShowAddModal(false);
        setNewTaskText('');
        setNewTaskNotes('');
        setNewTaskTag('');
        notify(`Created ${newTaskType}: "${res.task.text}"`);
      }
    } catch (err: any) {
      notify(`Creation failed: ${err.message}`, 'err');
    }
  }

  const dailys = tasks.filter((t) => t.type === 'daily');
  const habits = tasks.filter((t) => t.type === 'habit');
  const todos = tasks.filter((t) => t.type === 'todo');

  const visibleTasks =
    activeTab === 'dailys'
      ? dailys
      : activeTab === 'habits'
        ? habits
        : activeTab === 'todos'
          ? todos
          : tasks;

  return (
    <div className="min-h-screen pb-24 text-[var(--theme-text)] bg-[var(--theme-bg)]">
      {/* Header Banner */}
      <div className="border-b border-[var(--theme-border)] bg-[var(--theme-surface)]">
        <div className="page">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            {/* Player Info */}
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-rpg to-rpg flex items-center justify-center on-accent shadow-lg shrink-0">
                <Award className="w-7 h-7" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold tracking-tight">
                    {profile?.name || 'Habitica Hero'}
                  </h1>
                  {profile?.lvl && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-rpg/15 text-rpg border border-rpg/20">
                      Level {profile.lvl}
                    </span>
                  )}
                  {profile?.class && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider bg-rpg/10 text-rpg border border-rpg/20">
                      {profile.class}
                    </span>
                  )}
                </div>
                <p className="text-xs text-[var(--theme-text-muted)] mt-0.5">
                  {profile?.username ? `@${profile.username}` : 'Two-way synced with Habitica API v3'}
                </p>
              </div>
            </div>

            {/* Quick Action Buttons */}
            <div className="flex items-center gap-2 w-full md:w-auto">
              <button
                onClick={handleSyncDailies}
                disabled={syncing}
                className="flex-1 md:flex-initial px-3.5 py-2 rounded-xl text-xs font-semibold bg-done hover:bg-done on-accent flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-95 disabled:opacity-50"
                title="Provisions the 7 required roadmap dailies into Habitica"
              >
                {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                <span>Sync 7 Dailies</span>
              </button>

              <button
                onClick={() => setShowAddModal(true)}
                className="flex-1 md:flex-initial px-3.5 py-2 rounded-xl text-xs font-semibold bg-[var(--theme-surface-2)] hover:bg-[var(--theme-hover-bg)] border border-[var(--theme-border)] flex items-center justify-center gap-1.5 transition-all active:scale-95"
              >
                <PlusCircle className="w-3.5 h-3.5 text-rpg" />
                <span>Add Task</span>
              </button>

              <button
                onClick={loadData}
                disabled={loading}
                className="p-2 rounded-xl text-xs font-semibold bg-[var(--theme-surface-2)] hover:bg-[var(--theme-hover-bg)] border border-[var(--theme-border)] flex items-center justify-center transition-all active:scale-95 disabled:opacity-50"
                title="Refresh Habitica tasks"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Character Stats Bars */}
          {profile?.configured && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-6">
              {/* Health (HP) */}
              <div className="p-3 rounded-xl bg-[var(--theme-surface-2)] border border-[var(--theme-border)]">
                <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
                  <span className="flex items-center gap-1.5 text-hp">
                    <Heart className="w-3.5 h-3.5 fill-hp" /> Health
                  </span>
                  <span>
                    {profile.hp} / {profile.maxHealth}
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-hp/20 overflow-hidden">
                  <div
                    className="h-full bg-hp rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(100, Math.max(0, ((profile.hp || 50) / (profile.maxHealth || 50)) * 100))}%` }}
                  />
                </div>
              </div>

              {/* Experience (EXP) */}
              <div className="p-3 rounded-xl bg-[var(--theme-surface-2)] border border-[var(--theme-border)]">
                <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
                  <span className="flex items-center gap-1.5 text-exp">
                    <Zap className="w-3.5 h-3.5 fill-exp" /> Experience
                  </span>
                  <span>
                    {profile.exp} / {profile.toNextLevel}
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-exp/20 overflow-hidden">
                  <div
                    className="h-full bg-exp rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(100, Math.max(0, ((profile.exp || 0) / (profile.toNextLevel || 100)) * 100))}%` }}
                  />
                </div>
              </div>

              {/* Mana (MP) */}
              <div className="p-3 rounded-xl bg-[var(--theme-surface-2)] border border-[var(--theme-border)]">
                <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
                  <span className="flex items-center gap-1.5 text-mp">
                    <Shield className="w-3.5 h-3.5 fill-mp" /> Mana
                  </span>
                  <span>
                    {profile.mp} / {profile.maxMP}
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-mp/20 overflow-hidden">
                  <div
                    className="h-full bg-mp rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(100, Math.max(0, ((profile.mp || 10) / (profile.maxMP || 10)) * 100))}%` }}
                  />
                </div>
              </div>

              {/* Gold (GP) */}
              <div className="p-3 rounded-xl bg-[var(--theme-surface-2)] border border-[var(--theme-border)] flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-gold">
                  <Coins className="w-4 h-4 text-gold fill-gold" /> Gold
                </span>
                <span className="text-base font-bold text-gold">{profile.gp} GP</span>
              </div>
            </div>
          )}

          {flashMsg && (
            <div
              className={`mt-4 p-3 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
                flashMsg.type === 'ok'
                  ? 'bg-done/10 text-done border border-done/20'
                  : 'bg-hp/10 text-hp border border-hp/20'
              }`}
            >
              <Check className="w-4 h-4 shrink-0" />
              <span>{flashMsg.text}</span>
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="page">
        {/* Navigation Filter Tabs */}
        <div className="flex items-center gap-2 border-b border-[var(--theme-border)] pb-3 mb-6">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'all'
                ? 'bg-rpg on-accent shadow-sm'
                : 'text-[var(--theme-text-muted)] hover:bg-[var(--theme-surface-2)]'
            }`}
          >
            All Tasks ({tasks.length})
          </button>
          <button
            onClick={() => setActiveTab('dailys')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'dailys'
                ? 'bg-rpg on-accent shadow-sm'
                : 'text-[var(--theme-text-muted)] hover:bg-[var(--theme-surface-2)]'
            }`}
          >
            Dailies ({dailys.length})
          </button>
          <button
            onClick={() => setActiveTab('habits')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'habits'
                ? 'bg-rpg on-accent shadow-sm'
                : 'text-[var(--theme-text-muted)] hover:bg-[var(--theme-surface-2)]'
            }`}
          >
            Habits ({habits.length})
          </button>
          <button
            onClick={() => setActiveTab('todos')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'todos'
                ? 'bg-rpg on-accent shadow-sm'
                : 'text-[var(--theme-text-muted)] hover:bg-[var(--theme-surface-2)]'
            }`}
          >
            To-Dos ({todos.length})
          </button>
        </div>

        {/* Task Cards Grid */}
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3 text-[var(--theme-text-muted)]">
            <Loader2 className="w-8 h-8 animate-spin text-rpg" />
            <p className="text-xs">Connecting to Habitica...</p>
          </div>
        ) : visibleTasks.length === 0 ? (
          <div className="py-16 text-center border-2 border-dashed border-[var(--theme-border)] rounded-2xl p-8">
            <Award className="w-12 h-12 mx-auto text-[var(--theme-text-muted)] opacity-40 mb-3" />
            <h3 className="text-sm font-semibold">No tasks found in this category</h3>
            <p className="text-xs text-[var(--theme-text-muted)] mt-1 max-w-sm mx-auto">
              Click &quot;Sync 7 Dailies&quot; to auto-provision your roadmap dailies or click &quot;Add Task&quot; to create a new task.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {visibleTasks.map((task) => {
              const id = task.id || task._id || '';
              const isScoring = scoringId === id;
              const isDone = Boolean(task.completed);
              const diffMeta = DIFFICULTY_LABELS[task.priority || 1.5] || DIFFICULTY_LABELS[1.5];

              return (
                <div
                  key={id}
                  className={`p-4 rounded-2xl border transition-all duration-200 flex flex-col justify-between ${
                    isDone
                      ? 'bg-done/5 border-done/30'
                      : 'bg-[var(--theme-surface)] border-[var(--theme-border)] hover:border-rpg/40 hover:shadow-md'
                  }`}
                >
                  <div>
                    {/* Top Row: Type, Difficulty, Streak */}
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[var(--theme-surface-2)] text-[var(--theme-text-muted)]">
                        {task.type}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {typeof task.streak === 'number' && task.streak > 0 && (
                          <span className="flex items-center gap-0.5 text-[10px] font-bold text-exp">
                            <Flame className="w-3 h-3 fill-exp" />
                            {task.streak}
                          </span>
                        )}
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${diffMeta.color}`}>
                          {diffMeta.label}
                        </span>
                      </div>
                    </div>

                    {/* Task Title */}
                    <h4
                      className={`text-sm font-semibold leading-snug ${
                        isDone ? 'line-through text-[var(--theme-text-muted)]' : ''
                      }`}
                    >
                      {task.text}
                    </h4>

                    {/* Notes */}
                    {task.notes && (
                      <p className="text-xs text-[var(--theme-text-muted)] mt-1 line-clamp-2 leading-relaxed">
                        {task.notes.replace(/\[roadmapKey:[a-z0-9-]+\]/, '')}
                      </p>
                    )}
                  </div>

                  {/* Actions Bottom Bar */}
                  <div className="mt-4 pt-3 border-t border-[var(--theme-border)] flex items-center justify-between">
                    {task.type === 'habit' ? (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleScore(task, 'up')}
                          disabled={isScoring}
                          className="w-8 h-8 rounded-lg bg-done/10 hover:bg-done text-done hover:on-accent flex items-center justify-center transition-all border border-done/30 active:scale-95"
                          title="Score positive"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleScore(task, 'down')}
                          disabled={isScoring}
                          className="w-8 h-8 rounded-lg bg-hp/10 hover:bg-hp text-hp hover:on-accent flex items-center justify-center transition-all border border-hp/30 active:scale-95"
                          title="Score negative"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleScore(task, isDone ? 'down' : 'up')}
                        disabled={isScoring}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all border active:scale-95 ${
                          isDone
                            ? 'bg-done on-accent border-done shadow-sm'
                            : 'bg-[var(--theme-surface-2)] text-[var(--theme-text)] border-[var(--theme-border)] hover:border-done/50 hover:bg-done/10'
                        }`}
                      >
                        {isScoring ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Check className="w-3.5 h-3.5" />
                        )}
                        <span>{isDone ? 'Completed' : 'Mark Done'}</span>
                      </button>
                    )}

                    <button
                      onClick={() => handleDelete(id)}
                      className="p-1.5 text-[var(--theme-text-muted)] hover:text-hp transition-colors"
                      title="Delete task"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Task Modal */}
      {showAddModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'var(--theme-scrim)', backdropFilter: 'blur(4px)' }}
          onClick={() => setShowAddModal(false)}
          role="presentation"
        >
          <div
            className="anim-pop w-full max-w-md rounded-xl border p-6"
            style={{
              backgroundColor: 'var(--theme-surface)',
              borderColor: 'var(--theme-border)',
              boxShadow: 'var(--theme-scrim-shadow)',
              color: 'var(--theme-text)',
            }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="habitica-add-task-title"
          >
            <h3 id="habitica-add-task-title" className="t-heading mb-4">
              Add Habitica task
            </h3>
            <form onSubmit={handleCreateTask} className="space-y-4">
              <div>
                <label htmlFor="ht-title" className="t-label mb-1 block" style={{ color: 'var(--theme-text-muted)' }}>
                  Task title
                </label>
                <input
                  id="ht-title"
                  type="text"
                  required
                  placeholder="e.g. Complete Dynamic Programming module"
                  value={newTaskText}
                  onChange={(e) => setNewTaskText(e.target.value)}
                  className="field"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="ht-type" className="t-label mb-1 block" style={{ color: 'var(--theme-text-muted)' }}>
                    Type
                  </label>
                  <select
                    id="ht-type"
                    value={newTaskType}
                    onChange={(e) => setNewTaskType(e.target.value as any)}
                    className="field"
                  >
                    <option value="daily">Daily</option>
                    <option value="habit">Habit</option>
                    <option value="todo">To-Do</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="ht-priority" className="t-label mb-1 block" style={{ color: 'var(--theme-text-muted)' }}>
                    Difficulty
                  </label>
                  <select
                    id="ht-priority"
                    value={newTaskPriority}
                    onChange={(e) => setNewTaskPriority(Number(e.target.value))}
                    className="field"
                  >
                    <option value={0.1}>Trivial (0.1)</option>
                    <option value={1}>Easy (1.0)</option>
                    <option value={1.5}>Medium (1.5)</option>
                    <option value={2}>Hard (2.0)</option>
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="ht-notes" className="t-label mb-1 block" style={{ color: 'var(--theme-text-muted)' }}>
                  Notes <span style={{ textTransform: 'none' }}>(optional)</span>
                </label>
                <textarea
                  id="ht-notes"
                  rows={2}
                  placeholder="Extra description or context…"
                  value={newTaskNotes}
                  onChange={(e) => setNewTaskNotes(e.target.value)}
                  className="field resize-none"
                />
              </div>

              <div>
                <label htmlFor="ht-tag" className="t-label mb-1 block" style={{ color: 'var(--theme-text-muted)' }}>
                  Tag <span style={{ textTransform: 'none' }}>(optional)</span>
                </label>
                <input
                  id="ht-tag"
                  type="text"
                  placeholder="e.g. Leetcode, Neetcode, Euler, Roadmap"
                  value={newTaskTag}
                  onChange={(e) => setNewTaskTag(e.target.value)}
                  className="field"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="btn btn-ghost"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn"
                  style={{
                    backgroundColor: 'var(--theme-rpg)',
                    color: 'var(--theme-primary-ink)',
                    borderColor: 'var(--theme-rpg)',
                  }}
                >
                  Create task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
