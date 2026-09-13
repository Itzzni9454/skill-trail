import { useEffect, useState, useRef } from 'react';
import { api } from '../lib/api';
import { soundEngine } from '../lib/soundGenerator';

function formatTime(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatMinutesSeconds(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

type TimerMode = 'stopwatch' | 'pomodoro';
type PomodoroType = 'focus' | 'shortBreak' | 'longBreak';

const POMO_PRESETS: Record<PomodoroType, { label: string; seconds: number; color: string }> = {
  focus: { label: '25m Focus', seconds: 25 * 60, color: 'var(--theme-done)' },
  shortBreak: { label: '5m Short Break', seconds: 5 * 60, color: 'var(--theme-accent)' },
  longBreak: { label: '15m Long Break', seconds: 15 * 60, color: 'var(--theme-note)' },
};

type AmbientSound = 'none' | 'rain' | 'waves' | 'alpha';

export default function TimeTracker({ slug, nodeId }: { slug: string; nodeId: string }) {
  const [total, setTotal] = useState(0);
  const [mode, setMode] = useState<TimerMode>('stopwatch');

  // Stopwatch state
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startTimeRef = useRef<number>(0);
  const intervalRef = useRef<number | null>(null);

  // Pomodoro state
  const [pomoType, setPomoType] = useState<PomodoroType>('focus');
  const [pomoRemaining, setPomoRemaining] = useState(POMO_PRESETS.focus.seconds);
  const [pomoRunning, setPomoRunning] = useState(false);
  const [pomoCompletedMsg, setPomoCompletedMsg] = useState<string | null>(null);
  const pomoIntervalRef = useRef<number | null>(null);

  // Ambient sound state
  const [ambientSound, setAmbientSound] = useState<AmbientSound>('none');
  const [ambientVolume, setAmbientVolume] = useState(0.3);
  const [autoPlaySound, setAutoPlaySound] = useState(false);

  // Load initial tracked time
  useEffect(() => {
    let alive = true;
    api.getTimeTracked().then((res) => {
      if (alive) {
        setTotal(res.timeTracked[slug]?.[nodeId] || 0);
      }
    });
    return () => { alive = false; };
  }, [slug, nodeId]);

  // Stopwatch interval effect
  useEffect(() => {
    if (running) {
      startTimeRef.current = Date.now() - elapsed * 1000;
      intervalRef.current = window.setInterval(() => {
        setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);
      if (autoPlaySound && ambientSound !== 'none') {
        playAmbient(ambientSound, ambientVolume);
      }
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (autoPlaySound && !pomoRunning) {
        soundEngine.stop();
      }
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running]);

  // Pomodoro interval effect
  useEffect(() => {
    if (pomoRunning) {
      pomoIntervalRef.current = window.setInterval(() => {
        setPomoRemaining((prev) => {
          if (prev <= 1) {
            // Completed!
            handlePomoCompleted();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      if (autoPlaySound && ambientSound !== 'none') {
        playAmbient(ambientSound, ambientVolume);
      }
    } else {
      if (pomoIntervalRef.current) clearInterval(pomoIntervalRef.current);
      if (autoPlaySound && !running) {
        soundEngine.stop();
      }
    }
    return () => {
      if (pomoIntervalRef.current) clearInterval(pomoIntervalRef.current);
    };
  }, [pomoRunning]);

  // Cleanup ambient sound on unmount
  useEffect(() => {
    return () => {
      soundEngine.stop();
    };
  }, []);

  const playAmbient = (sound: AmbientSound, vol: number) => {
    if (sound === 'rain') soundEngine.playRain(vol);
    else if (sound === 'waves') soundEngine.playWaves(vol);
    else if (sound === 'alpha') soundEngine.playBinauralAlpha(vol);
    else soundEngine.stop();
  };

  const handleAmbientChange = (sound: AmbientSound) => {
    setAmbientSound(sound);
    if (sound === 'none') {
      soundEngine.stop();
    } else {
      playAmbient(sound, ambientVolume);
    }
  };

  const handleVolumeChange = (vol: number) => {
    setAmbientVolume(vol);
    soundEngine.setVolume(vol);
  };

  const handlePomoCompleted = () => {
    setPomoRunning(false);
    soundEngine.playChime();
    if (pomoType === 'focus') {
      const addedSec = POMO_PRESETS.focus.seconds;
      api.addTimeTracked(slug, nodeId, addedSec, 'add').then((res) => {
        setTotal(res.total);
      });
      setPomoCompletedMsg('🎉 Focus Session Finished! +25 min logged. Time for a break!');
    } else {
      setPomoCompletedMsg('☕ Break Finished! Ready to dive back in?');
    }
    setTimeout(() => setPomoCompletedMsg(null), 6000);
  };

  const handleToggleStopwatch = () => {
    if (running) {
      // stop and save
      setRunning(false);
      if (elapsed > 0) {
        api.addTimeTracked(slug, nodeId, elapsed, 'add').then((res) => {
          setTotal(res.total);
          setElapsed(0);
        });
      }
    } else {
      setElapsed(0);
      setRunning(true);
    }
  };

  const handleResetStopwatch = () => {
    if (running) setRunning(false);
    setElapsed(0);
  };

  const handleSelectPomoType = (type: PomodoroType) => {
    setPomoRunning(false);
    setPomoType(type);
    setPomoRemaining(POMO_PRESETS[type].seconds);
  };

  const handleTogglePomo = () => {
    if (pomoRunning) {
      setPomoRunning(false);
    } else {
      if (pomoRemaining === 0) {
        setPomoRemaining(POMO_PRESETS[pomoType].seconds);
      }
      setPomoRunning(true);
    }
  };

  const handleResetPomo = () => {
    setPomoRunning(false);
    setPomoRemaining(POMO_PRESETS[pomoType].seconds);
  };

  const handleManualAdd = () => {
    const mins = window.prompt('Enter time to add (in minutes):');
    if (!mins) return;
    const m = parseInt(mins, 10);
    if (!Number.isFinite(m) || m <= 0) return alert('Invalid number of minutes.');

    api.addTimeTracked(slug, nodeId, m * 60, 'add').then((res) => {
      setTotal(res.total);
    });
  };

  const activePomoDuration = POMO_PRESETS[pomoType].seconds;
  const pomoProgressPct = Math.round(((activePomoDuration - pomoRemaining) / activePomoDuration) * 100);

  return (
    <div className="mt-6 border-t pt-4" style={{ borderColor: 'var(--theme-border)' }}>
      {/* Header with Total Time */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-xs uppercase tracking-wider font-bold" style={{ color: 'var(--theme-text)' }}>
            Study Timer
          </h3>
          <span className="text-[11px] opacity-70" style={{ color: 'var(--theme-text)' }}>
            Total spent on this topic:
          </span>
        </div>
        <span className="text-sm font-bold px-2 py-0.5 rounded-md bg-done-soft text-done border border-done/20">
          {formatTime(total + (running ? elapsed : 0))}
        </span>
      </div>

      {/* Mode Switcher Tabs */}
      <div
        className="flex rounded-lg p-1 mb-3 text-xs font-semibold border"
        style={{ backgroundColor: 'var(--theme-active-bg)', borderColor: 'var(--theme-border)' }}
      >
        <button
          onClick={() => { setMode('stopwatch'); setPomoRunning(false); }}
          className="flex-1 py-1 rounded-md transition-colors cursor-pointer"
          style={{
            backgroundColor: mode === 'stopwatch' ? 'var(--theme-surface)' : 'transparent',
            color: mode === 'stopwatch' ? 'var(--theme-text)' : 'var(--theme-text-muted)',
            boxShadow: mode === 'stopwatch' ? 'var(--theme-shadow)' : 'none',
          }}
        >
          ⏱️ Stopwatch
        </button>
        <button
          onClick={() => { setMode('pomodoro'); setRunning(false); }}
          className="flex-1 py-1 rounded-md transition-colors cursor-pointer"
          style={{
            backgroundColor: mode === 'pomodoro' ? 'var(--theme-surface)' : 'transparent',
            color: mode === 'pomodoro' ? 'var(--theme-text)' : 'var(--theme-text-muted)',
            boxShadow: mode === 'pomodoro' ? 'var(--theme-shadow)' : 'none',
          }}
        >
          🍅 Pomodoro
        </button>
      </div>

      {/* Mode: Stopwatch */}
      {mode === 'stopwatch' && (
        <div className="space-y-3">
          <div
            className="text-center py-2 rounded-xl border"
            style={{ backgroundColor: 'var(--theme-surface)', borderColor: 'var(--theme-border)' }}
          >
            <span className="font-mono text-3xl font-black tracking-wider" style={{ color: 'var(--theme-text)' }}>
              {formatMinutesSeconds(elapsed)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleToggleStopwatch}
              className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all border shadow-xs ${
                running
                  ? 'bg-danger-soft text-danger border-danger'
                  : 'bg-done on-accent border-done hover:bg-done'
              }`}
            >
              {running ? '⏹ Stop & Save' : '▶ Start Timer'}
            </button>
            {elapsed > 0 && !running && (
              <button
                onClick={handleResetStopwatch}
                className="px-3 py-2 rounded-lg text-xs font-semibold bg-raised text-ink-muted border border-line hover:bg-active"
              >
                Reset
              </button>
            )}
            <button
              onClick={handleManualAdd}
              className="px-3 py-2 rounded-lg text-xs font-semibold bg-raised text-ink-muted border border-line hover:bg-raised"
              title="Log time manually"
            >
              + Manual
            </button>
          </div>
        </div>
      )}

      {/* Mode: Pomodoro */}
      {mode === 'pomodoro' && (
        <div className="space-y-3">
          {/* Preset interval pills */}
          <div className="flex gap-1.5 justify-center">
            {(['focus', 'shortBreak', 'longBreak'] as PomodoroType[]).map((t) => (
              <button
                key={t}
                onClick={() => handleSelectPomoType(t)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-all ${
                  pomoType === t
                    ? 'bg-done on-accent border-done'
                    : 'bg-raised text-ink-muted border-line hover:bg-raised'
                }`}
              >
                {POMO_PRESETS[t].label}
              </button>
            ))}
          </div>

          {/* Countdown Clock Display */}
          <div className="relative text-center py-3 bg-raised rounded-xl border border-line overflow-hidden">
            {/* Progress bar background fill */}
            <div
              className="absolute left-0 top-0 bottom-0 bg-done-soft transition-all duration-1000"
              style={{ width: `${pomoProgressPct}%` }}
            />
            <span className="relative font-mono text-3xl font-black tracking-wider text-ink">
              {formatMinutesSeconds(pomoRemaining)}
            </span>
            <div className="relative text-[10px] text-ink-faint mt-0.5">
              {pomoType === 'focus' ? '🎯 Focus Session' : '☕ Rest & Refresh'}
            </div>
          </div>

          {pomoCompletedMsg && (
            <div className="p-2 rounded-lg bg-done-soft border border-done/30 text-done text-xs text-center font-medium animate-bounce">
              {pomoCompletedMsg}
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={handleTogglePomo}
              className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all border shadow-xs ${
                pomoRunning
                  ? 'bg-due-soft text-due border-due'
                  : 'bg-done on-accent border-done hover:bg-done'
              }`}
            >
              {pomoRunning ? '⏸ Pause' : pomoRemaining === 0 ? '🔄 Restart' : '▶ Start Focus'}
            </button>
            <button
              onClick={handleResetPomo}
              className="px-3 py-2 rounded-lg text-xs font-semibold bg-raised text-ink-muted border border-line hover:bg-active"
            >
              ↺ Reset
            </button>
          </div>
        </div>
      )}

      {/* Ambient Sound Synthesizer Controls */}
      <div className="mt-4 pt-3 border-t border-dashed border-line">
        <div className="flex items-center justify-between mb-2 text-xs">
          <span className="font-semibold text-ink-muted flex items-center gap-1.5">
            🎧 Ambient Focus Sound
            <span className="text-[9px] px-1 py-0.2 rounded bg-accent-soft text-accent border border-accent font-mono">
              Web Audio
            </span>
          </span>
          <label className="inline-flex items-center gap-1 text-[11px] text-ink-muted cursor-pointer">
            <input
              type="checkbox"
              checked={autoPlaySound}
              onChange={(e) => setAutoPlaySound(e.target.checked)}
              className="rounded accent-[var(--theme-primary)] text-xs"
            />
            Auto with timer
          </label>
        </div>

        <div className="grid grid-cols-4 gap-1 mb-2">
          {(
            [
              ['none', '🔇 Off'],
              ['rain', '🌧️ Rain'],
              ['waves', '🌊 Waves'],
              ['alpha', '🧠 Alpha'],
            ] as [AmbientSound, string][]
          ).map(([snd, label]) => (
            <button
              key={snd}
              onClick={() => handleAmbientChange(snd)}
              className={`py-1 rounded text-[11px] font-medium border transition-colors ${
                ambientSound === snd
                  ? 'bg-accent on-accent border-accent shadow-xs'
                  : 'bg-raised text-ink-muted border-line hover:bg-raised'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {ambientSound !== 'none' && (
          <div className="flex items-center gap-2 mt-1 px-1">
            <span className="text-[10px] text-ink-faint">Vol</span>
            <input
              type="range"
              aria-label="Ambient sound volume"
              min="0"
              max="1"
              step="0.05"
              value={ambientVolume}
              onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
              className="flex-1 accent-[var(--theme-primary)] h-1 bg-active rounded-lg cursor-pointer"
            />
            <span className="text-[10px] font-mono text-ink-faint w-7 text-right">
              {Math.round(ambientVolume * 100)}%
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
