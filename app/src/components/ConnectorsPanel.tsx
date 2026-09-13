/**
 * Integrations panel — Obsidian, Habitica, Notion, Microsoft To Do.
 *
 * Deliberately honest about what each one needs: the three network connectors
 * say so up front and surface a real Test button, because a silently-failing
 * integration is worse than none. Credentials are never echoed back from the
 * server; configured fields only report whether a value is stored.
 */
import { useEffect, useState } from 'react';
import { Cloud, CloudOff, FolderOpen, Loader2, Plug, Trash2 } from 'lucide-react';
import { api } from '../lib/api';

type Field = {
  key: string;
  label: string;
  type: string;
  placeholder?: string;
  configured: boolean;
};

type Connector = {
  id: string;
  name: string;
  kind: string;
  description: string;
  docs: string;
  fields: Field[];
  enabled: boolean;
  configured: boolean;
  queued: number;
  lastError: string | null;
  lastSyncAt: string | null;
};

export default function ConnectorsPanel() {
  const [items, setItems] = useState<Connector[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<Record<string, { ok: boolean; text: string }>>({});

  function load() {
    api
      .getConnectors()
      .then((r) => setItems(r.connectors))
      .catch(() => setItems([]));
  }

  useEffect(load, []);

  function setDraft(id: string, key: string, value: string) {
    setDrafts((d) => ({ ...d, [id]: { ...(d[id] || {}), [key]: value } }));
  }

  function note(id: string, ok: boolean, text: string) {
    setFlash((f) => ({ ...f, [id]: { ok, text } }));
  }

  async function save(id: string) {
    setBusy(id);
    try {
      await api.saveConnectorConfig(id, { ...(drafts[id] || {}), enabled: true });
      note(id, true, 'Saved and enabled');
      setDrafts((d) => ({ ...d, [id]: {} }));
      load();
    } catch (e) {
      note(id, false, String((e as Error)?.message ?? e));
    } finally {
      setBusy(null);
    }
  }

  async function test(id: string) {
    setBusy(id);
    try {
      const r = await api.testConnector(id);
      note(id, true, r.detail || 'Connected');
      load();
    } catch (e) {
      note(id, false, String((e as Error)?.message ?? e));
    } finally {
      setBusy(null);
    }
  }

  async function sync(id: string) {
    setBusy(id);
    try {
      const r = await api.syncConnector(id);
      note(id, !!r.ok, r.detail || r.error || (r.ok ? `Sent ${r.pushed ?? 0}` : 'Failed'));
      load();
    } catch (e) {
      note(id, false, String((e as Error)?.message ?? e));
    } finally {
      setBusy(null);
    }
  }

  async function disable(id: string) {
    setBusy(id);
    try {
      await api.saveConnectorConfig(id, { enabled: false });
      load();
    } finally {
      setBusy(null);
    }
  }

  async function clearQueue(id: string) {
    setBusy(id);
    try {
      await api.clearConnectorQueue(id);
      load();
    } finally {
      setBusy(null);
    }
  }

  if (!items) return null;

  return (
    <section className="mb-8">
      <div className="mb-2 flex items-baseline gap-2.5">
        <h2 className="t-heading" style={{ color: 'var(--theme-text)' }}>
          Integrations
        </h2>
        <span className="t-label" style={{ color: 'var(--theme-text-faint)' }}>
          {items.filter((c) => c.enabled).length} of {items.length} on
        </span>
      </div>

      <div
        className="overflow-hidden rounded-xl"
        style={{ backgroundColor: 'var(--theme-surface)', border: '1px solid var(--theme-border)' }}
      >
        {items.map((c, i) => {
          const open = openId === c.id;
          const msg = flash[c.id];
          const Icon = c.kind === 'local' ? FolderOpen : Cloud;
          return (
            <div
              key={c.id}
              className="px-5 py-4"
              style={i ? { borderTop: '1px solid var(--theme-border)' } : undefined}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-3">
                  <span
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-lg"
                    style={{
                      backgroundColor: c.enabled ? 'var(--theme-primary-soft)' : 'var(--theme-surface-2)',
                      color: c.enabled ? 'var(--theme-primary)' : 'var(--theme-text-faint)',
                    }}
                    aria-hidden="true"
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="t-small font-medium" style={{ color: 'var(--theme-text)' }}>
                        {c.name}
                      </span>
                      <span className="t-label" style={{ color: 'var(--theme-text-faint)' }}>
                        {c.kind === 'local' ? 'works offline' : 'needs internet'}
                      </span>
                      {c.enabled && c.configured && (
                        <span
                          className="t-label rounded px-1.5 py-px"
                          style={{ backgroundColor: 'var(--theme-done-soft)', color: 'var(--theme-done)' }}
                        >
                          on
                        </span>
                      )}
                      {c.queued > 0 && (
                        <span
                          className="t-label rounded px-1.5 py-px"
                          style={{ backgroundColor: 'var(--theme-due-soft)', color: 'var(--theme-due)' }}
                          title="Waiting to send — sync will retry"
                        >
                          {c.queued} queued
                        </span>
                      )}
                    </div>
                    <p className="t-micro mt-0.5" style={{ color: 'var(--theme-text-muted)' }}>
                      {c.description}
                    </p>
                    {c.lastError && (
                      <p className="t-micro mt-1 flex items-center gap-1.5" style={{ color: 'var(--theme-danger)' }}>
                        <CloudOff className="h-3 w-3 shrink-0" />
                        {c.lastError}
                      </p>
                    )}
                    {msg && (
                      <p
                        className="t-micro mt-1"
                        style={{ color: msg.ok ? 'var(--theme-done)' : 'var(--theme-danger)' }}
                      >
                        {msg.text}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  {busy === c.id && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: 'var(--theme-text-faint)' }} />
                  )}
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : c.id)}
                    className="t-micro rounded px-2 py-1 font-medium transition-colors hover:bg-[var(--theme-hover-bg)]"
                    style={{ color: 'var(--theme-text-muted)', border: '1px solid var(--theme-border)' }}
                  >
                    {open ? 'Close' : c.configured ? 'Settings' : 'Connect'}
                  </button>
                  {c.configured && (
                    <button
                      type="button"
                      onClick={() => sync(c.id)}
                      className="t-micro rounded px-2 py-1 font-medium transition-colors hover:bg-[var(--theme-hover-bg)]"
                      style={{ color: 'var(--theme-text-muted)', border: '1px solid var(--theme-border)' }}
                      title="Send every completed topic now"
                    >
                      Sync
                    </button>
                  )}
                </div>
              </div>

              {open && (
                <div className="mt-4 pl-12">
                  <p className="t-micro mb-3" style={{ color: 'var(--theme-text-faint)' }}>
                    {c.docs}
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {c.fields.map((f) => (
                      <label key={f.key} className="block">
                        <span className="t-label block" style={{ color: 'var(--theme-text-faint)' }}>
                          {f.label}
                          {f.configured && !drafts[c.id]?.[f.key] && (
                            <span style={{ color: 'var(--theme-done)' }}> · saved</span>
                          )}
                        </span>
                        <input
                          type={f.type === 'password' ? 'password' : 'text'}
                          value={drafts[c.id]?.[f.key] ?? ''}
                          onChange={(e) => setDraft(c.id, f.key, e.target.value)}
                          placeholder={f.placeholder}
                          autoComplete="off"
                          className="t-small mt-1 w-full rounded-lg px-2.5 py-1.5"
                          style={{
                            border: '1px solid var(--theme-border)',
                            backgroundColor: 'var(--theme-surface-2)',
                            color: 'var(--theme-text)',
                          }}
                        />
                      </label>
                    ))}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => save(c.id)}
                      className="t-small rounded-lg px-3 py-1.5 font-medium transition-colors"
                      style={{ backgroundColor: 'var(--theme-primary)', color: 'var(--theme-primary-ink)' }}
                    >
                      Save & enable
                    </button>
                    <button
                      type="button"
                      onClick={() => test(c.id)}
                      disabled={!c.configured}
                      className="t-small rounded-lg px-3 py-1.5 font-medium transition-colors disabled:opacity-40"
                      style={{ border: '1px solid var(--theme-border)', color: 'var(--theme-text)' }}
                    >
                      Test connection
                    </button>
                    {c.queued > 0 && (
                      <button
                        type="button"
                        onClick={() => clearQueue(c.id)}
                        className="t-micro rounded-lg px-2 py-1.5 transition-colors hover:bg-[var(--theme-hover-bg)]"
                        style={{ color: 'var(--theme-text-faint)' }}
                        title="Drop queued items"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                    {c.enabled && (
                      <button
                        type="button"
                        onClick={() => disable(c.id)}
                        className="t-micro rounded-lg px-2 py-1.5 transition-colors hover:bg-[var(--theme-hover-bg)]"
                        style={{ color: 'var(--theme-text-faint)' }}
                      >
                        Disconnect
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="t-micro mt-2 flex items-center gap-1.5" style={{ color: 'var(--theme-text-faint)' }}>
        <Plug className="h-3 w-3 shrink-0" />
        Credentials are stored locally in <span className="font-mono">data/connectors.json</span>, separate from your
        progress. Nothing is sent unless you enable it.
      </p>
    </section>
  );
}
