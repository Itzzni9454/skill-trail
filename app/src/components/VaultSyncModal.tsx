import { FolderSync } from 'lucide-react';
import ModalShell from './ModalShell';
import { SkeletonBar } from './Skeleton';
import { useEffect, useState } from 'react';
import { api, type VaultConfig, type VaultSyncResult, type VaultExportResult } from '../lib/api';

interface VaultSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSynced?: () => void;
}

export default function VaultSyncModal({ isOpen, onClose, onSynced }: VaultSyncModalProps) {
  const [config, setConfig] = useState<VaultConfig | null>(null);
  const [customPath, setCustomPath] = useState('');
  const [editingPath, setEditingPath] = useState(false);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState<VaultSyncResult | null>(null);
  const [lastExportResult, setLastExportResult] = useState<VaultExportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchConfig = () => {
    setLoading(true);
    api
      .getVaultConfig()
      .then((cfg) => {
        setConfig(cfg);
        setCustomPath(cfg.path);
        setLoading(false);
      })
      .catch((err) => {
        setError(String(err));
        setLoading(false);
      });
  };

  useEffect(() => {
    if (isOpen) {
      fetchConfig();
      setLastSyncResult(null);
      setLastExportResult(null);
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleToggleEnabled = async () => {
    if (!config) return;
    try {
      setLoading(true);
      const res = await api.setVaultConfig({ enabled: !config.enabled });
      setConfig(res.config);
      if (onSynced) onSynced();
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleToggleAutoWatch = async () => {
    if (!config) return;
    try {
      setLoading(true);
      const res = await api.setVaultConfig({ autoWatch: !config.autoWatch });
      setConfig(res.config);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSavePath = async () => {
    if (!customPath.trim()) return;
    try {
      setLoading(true);
      const res = await api.setVaultConfig({ path: customPath.trim() });
      setConfig(res.config);
      setEditingPath(false);
      if (onSynced) onSynced();
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    try {
      setSyncing(true);
      setError(null);
      const res = await api.syncVault();
      setLastSyncResult(res);
      fetchConfig();
      if (onSynced) onSynced();
    } catch (err) {
      setError(String(err));
    } finally {
      setSyncing(false);
    }
  };

  const handleExportAll = async () => {
    if (!window.confirm('Export all roadmaps into your local vault folder? Existing notes and progress will be preserved.')) {
      return;
    }
    try {
      setExporting(true);
      setError(null);
      const res = await api.exportAllToVault();
      setLastExportResult(res);
      fetchConfig();
      if (onSynced) onSynced();
    } catch (err) {
      setError(String(err));
    } finally {
      setExporting(false);
    }
  };

  return (
    <ModalShell
      open={isOpen}
      onClose={onClose}
      width="max-w-2xl"
      label="Obsidian and local markdown vault sync"
      title="Vault sync"
      subtitle="Own your notes as real local .md files, with two-way sync and wikilinks."
      icon={<FolderSync className="h-4 w-4" />}
    >

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 text-sm">
          {error && (
            <div className="p-3 rounded-lg bg-danger-soft border border-danger/30 text-danger text-xs">
              {error}
            </div>
          )}

          {/* Sync Status Banner */}
          <div
            className="p-4 rounded-xl border flex items-center justify-between gap-4"
            style={{ borderColor: 'var(--theme-border)', backgroundColor: 'var(--theme-bg)' }}
          >
            <div>
              <div className="font-semibold flex items-center gap-2">
                <span
                  className={`w-2.5 h-2.5 rounded-full ${config?.enabled ? 'bg-done animate-pulse' : 'bg-active'}`}
                />
                Vault Sync {config?.enabled ? 'Active' : 'Disabled'}
              </div>
              <div className="text-xs text-ink-faint mt-1">
                {config?.enabled
                  ? 'Changes to notes or topic status instantly sync with your local markdown files.'
                  : 'Enable to save all notes and roadmap checklists as local .md files.'}
              </div>
            </div>
            <button
              onClick={handleToggleEnabled}
              disabled={loading}
              className={`px-4 py-2 rounded-lg font-semibold text-xs transition-all ${
                config?.enabled
                  ? 'bg-danger-soft text-danger border border-danger/20 hover:bg-danger-soft'
                  : 'bg-done on-accent hover:bg-done shadow-sm'
              }`}
            >
              {config?.enabled ? 'Disable Sync' : 'Enable Vault Sync'}
            </button>
          </div>

          {/* Vault Path Setting */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-ink-faint">
                Local Vault Directory Path
              </label>
              {!editingPath ? (
                <button
                  onClick={() => setEditingPath(true)}
                  className="text-xs text-learning hover:underline font-medium"
                >
                  Change Path
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={handleSavePath}
                    disabled={loading}
                    className="text-xs font-semibold text-done hover:underline"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => {
                      setCustomPath(config?.path || '');
                      setEditingPath(false);
                    }}
                    className="text-xs text-ink-faint hover:underline"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>

            {!editingPath ? (
              <div
                className="px-3 py-2.5 rounded-lg border font-mono text-xs flex items-center justify-between"
                style={{ borderColor: 'var(--theme-border)', backgroundColor: 'var(--theme-bg)' }}
              >
                {config?.path ? (
                  <span className="truncate mr-2" title={config.path}>
                    {config.path}
                  </span>
                ) : (
                  <SkeletonBar width="14rem" height="0.8rem" className="mr-2" />
                )}
                <span className="text-[11px] px-2 py-0.5 rounded-md bg-done-soft text-done font-medium shrink-0">
                  {config?.fileCount ?? 0} .md files
                </span>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text"
                  aria-label="Obsidian vault folder path"
                  value={customPath}
                  onChange={(e) => setCustomPath(e.target.value)}
                  placeholder="e.g. C:\Users\YourName\Documents\Obsidian\MyVault\Roadmaps"
                  className="flex-1 px-3 py-2 rounded-lg border font-mono text-xs"
                  style={{
                    borderColor: 'var(--theme-border-strong)',
                    backgroundColor: 'var(--theme-surface)',
                    color: 'var(--theme-text)',
                  }}
                />
              </div>
            )}
            <p className="text-[11px] text-ink-faint">
              Point this to your existing Obsidian Vault or any local folder. Subfolders will be created per roadmap.
            </p>
          </div>

          {/* Options */}
          <div className="space-y-2 pt-2 border-t" style={{ borderColor: 'var(--theme-border)' }}>
            <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
              <input
                type="checkbox"
                checked={config?.autoWatch ?? true}
                onChange={handleToggleAutoWatch}
                className="w-4 h-4 accent-[var(--theme-primary)] rounded"
              />
              <span>Live Watcher: automatically sync changes made externally in Obsidian back into this app</span>
            </label>
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              onClick={handleSync}
              disabled={syncing || exporting || !config?.enabled}
              className="p-3 rounded-xl border flex items-center justify-center gap-2 font-medium hover:border-done transition-colors disabled:opacity-50"
              style={{ borderColor: 'var(--theme-border)' }}
            >
              <span>{syncing ? '⏳' : '🔄'}</span>
              <span>{syncing ? 'Syncing...' : 'Sync Vault Now'}</span>
            </button>

            <button
              onClick={handleExportAll}
              disabled={syncing || exporting || !config?.enabled}
              className="p-3 rounded-xl border flex items-center justify-center gap-2 font-medium hover:border-learning transition-colors disabled:opacity-50"
              style={{ borderColor: 'var(--theme-border)' }}
            >
              <span>{exporting ? '⏳' : '📦'}</span>
              <span>{exporting ? 'Exporting...' : 'Export Full Library'}</span>
            </button>
          </div>

          {/* Results Feedback */}
          {lastSyncResult && (
            <div className="p-3 rounded-lg bg-done-soft border border-done/20 text-done text-xs flex items-center justify-between">
              <span>
                ✓ Scanned {lastSyncResult.filesScanned} markdown files • Updated {lastSyncResult.notesUpdated} notes • Updated {lastSyncResult.progressUpdated} statuses
              </span>
              <span className="text-[10px] text-ink-faint">
                {new Date(lastSyncResult.syncedAt).toLocaleTimeString()}
              </span>
            </div>
          )}

          {lastExportResult && (
            <div className="p-3 rounded-lg bg-learning-soft border border-learning/20 text-learning text-xs">
              ✓ Exported {lastExportResult.exportedNotes} topic notes and {lastExportResult.exportedOverviews} roadmap overviews across {lastExportResult.totalRoadmaps} roadmaps!
            </div>
          )}

          {/* Obsidian Features & Tips */}
          <div
            className="p-4 rounded-xl text-xs space-y-2"
            style={{ backgroundColor: 'var(--theme-bg)', color: 'var(--theme-text-muted)' }}
          >
            <div className="font-bold text-ink-muted">💡 Obsidian Integration Superpowers</div>
            <ul className="list-disc pl-4 space-y-1">
              <li>
                <strong>Obsidian Knowledge Graph:</strong> Roadmap <code className="px-1 py-0.5 rounded bg-[var(--theme-hover-bg)]">_overview.md</code> files use native wikilinks (e.g. <code className="px-1 py-0.5 rounded bg-[var(--theme-hover-bg)]">[[CSS Grid]]</code>), building a connected topic graph in Obsidian.
              </li>
              <li>
                <strong>Interactive Checklists:</strong> Change <code className="px-1 py-0.5 rounded bg-[var(--theme-hover-bg)]">- [ ] [[Topic]]</code> to <code className="px-1 py-0.5 rounded bg-[var(--theme-hover-bg)]">- [x]</code> (Done) or <code className="px-1 py-0.5 rounded bg-[var(--theme-hover-bg)]">- [/]</code> (Learning) in Obsidian and watch the app update your progress!
              </li>
              <li>
                <strong>Metadata Tags:</strong> Each note includes YAML frontmatter tags like <code className="px-1 py-0.5 rounded bg-[var(--theme-hover-bg)]">#roadmap</code> and <code className="px-1 py-0.5 rounded bg-[var(--theme-hover-bg)]">#status/done</code> for easy Dataview and search queries.
              </li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex justify-end" style={{ borderColor: 'var(--theme-border)' }}>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-lg btn btn-primary hover:bg-raised transition-colors"
          >
            Done
          </button>
        </div>
    </ModalShell>
  );
}
