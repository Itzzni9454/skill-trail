import { useEffect, useRef, useState } from 'react';
import { NotebookPen } from 'lucide-react';
import { api } from '../lib/api';
import EmptyState from './EmptyState';

/**
 * Rich Markdown Notes Editor with formatting toolbar, live preview,
 * interactive task checklists, and autosave.
 */
export default function NotesEditor({ slug, nodeId }: { slug: string; nodeId: string }) {
  const [note, setNote] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'write' | 'preview'>('write');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load the note whenever a new node is opened
  useEffect(() => {
    let alive = true;
    setLoaded(false);
    setSavedAt(null);
    setError(null);
    api
      .getNotes(slug)
      .then((r) => {
        if (!alive) return;
        setNote(r.notes[nodeId] || '');
        setLoaded(true);
      })
      .catch(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, [slug, nodeId]);

  // Debounced autosave
  useEffect(() => {
    if (!loaded) return;
    setSaving(true);
    const t = setTimeout(() => {
      api
        .setNote(slug, nodeId, note.trim() ? note : null)
        .then(() => {
          setSavedAt(new Date().toLocaleTimeString());
          setSaving(false);
        })
        .catch(() => {
          setError('Save failed — is the server running?');
          setSaving(false);
        });
    }, 600);
    return () => clearTimeout(t);
  }, [note, loaded, slug, nodeId]);

  function insertFormatting(before: string, after = '') {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = note.substring(start, end);
    const replacement = before + (selected || 'text') + after;
    const nextVal = note.substring(0, start) + replacement + note.substring(end);
    setNote(nextVal);
    setTimeout(() => {
      el.focus();
      el.selectionStart = start + before.length;
      el.selectionEnd = el.selectionStart + (selected.length || 4);
    }, 0);
  }

  function toggleTask(index: number) {
    const lines = note.split('\n');
    let taskIdx = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim().match(/^-\s*\[([ xX])\]/)) {
        if (taskIdx === index) {
          if (lines[i].includes('[ ]')) {
            lines[i] = lines[i].replace('[ ]', '[x]');
          } else {
            lines[i] = lines[i].replace(/\[[xX]\]/, '[ ]');
          }
          break;
        }
        taskIdx++;
      }
    }
    setNote(lines.join('\n'));
  }

  function renderPreview(markdown: string) {
    if (!markdown.trim()) {
      return (
        <EmptyState
          compact
          icon={<NotebookPen className="h-5 w-5" />}
          title="No notes yet"
          description="Notes autosave against this topic and are searchable later. Markdown and code snippets are supported."
          action={
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setMode('write')}>
              <NotebookPen className="h-3.5 w-3.5" aria-hidden="true" />
              Start writing
            </button>
          }
        />
      );
    }

    const lines = markdown.split('\n');
    let taskCounter = 0;

    return (
      <div className="space-y-1.5 text-xs text-ink-muted leading-relaxed font-sans">
        {lines.map((line, idx) => {
          const taskMatch = line.trim().match(/^-\s*\[([ xX])\]\s*(.*)$/);
          if (taskMatch) {
            const isChecked = taskMatch[1].toLowerCase() === 'x';
            const label = taskMatch[2];
            const currentTaskIdx = taskCounter++;
            return (
              <div
                key={idx}
                className="flex items-center gap-2 py-0.5 cursor-pointer hover:bg-raised px-1 rounded"
                onClick={() => toggleTask(currentTaskIdx)}
              >
                <input
                  type="checkbox"
                  aria-label={label}
                  checked={isChecked}
                  onChange={() => {}}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleTask(currentTaskIdx);
                  }}
                  className="rounded accent-[var(--theme-primary)] cursor-pointer"
                />
                <span className={isChecked ? 'line-through text-ink-faint' : ''}>
                  {label}
                </span>
              </div>
            );
          }

          if (line.startsWith('### ')) {
            return <h4 key={idx} className="font-bold text-sm text-ink pt-2">{line.replace('### ', '')}</h4>;
          }
          if (line.startsWith('## ')) {
            return <h3 key={idx} className="font-bold text-base text-ink pt-2">{line.replace('## ', '')}</h3>;
          }
          if (line.startsWith('# ')) {
            return <h2 key={idx} className="font-bold text-lg text-ink pt-2">{line.replace('# ', '')}</h2>;
          }
          if (line.startsWith('- ')) {
            return (
              <div key={idx} className="flex items-start gap-1.5 pl-2">
                <span className="text-ink-faint">•</span>
                <span>{line.replace('- ', '')}</span>
              </div>
            );
          }
          if (line.startsWith('```')) {
            return <div key={idx} className="font-mono bg-raised text-done p-2 rounded text-[11px] my-1">{line}</div>;
          }

          // Format inline bold & code
          const formatted = line
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/`([^`]+)`/g, '<code class="bg-raised px-1 py-0.5 rounded text-[11px] font-mono">$1</code>')
            .replace(/\$([^$]+)\$/g, '<em class="font-serif text-learning font-semibold">$1</em>');

          return (
            <p
              key={idx}
              dangerouslySetInnerHTML={{ __html: formatted || '&nbsp;' }}
              className="min-h-[1rem]"
            />
          );
        })}
      </div>
    );
  }

  return (
    <div className="mt-4 border-t pt-3" style={{ borderColor: 'var(--theme-border)' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <h3 className="text-xs uppercase tracking-wide font-bold" style={{ color: 'var(--theme-text)' }}>
            📝 Personal Notes
          </h3>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] text-ink-faint">
            {saving ? 'Saving…' : savedAt ? `Saved ${savedAt}` : ''}
          </span>
          <div className="flex rounded border border-line overflow-hidden text-[11px] font-medium">
            <button
              onClick={() => setMode('write')}
              className={`px-2 py-0.5 cursor-pointer ${
                mode === 'write' ? 'bg-learning on-accent' : 'text-ink-muted hover:bg-raised'
              }`}
            >
              Write
            </button>
            <button
              onClick={() => setMode('preview')}
              className={`px-2 py-0.5 cursor-pointer ${
                mode === 'preview' ? 'bg-learning on-accent' : 'text-ink-muted hover:bg-raised'
              }`}
            >
              Preview
            </button>
          </div>
        </div>
      </div>

      {/* Formatting Toolbar in Write Mode */}
      {mode === 'write' && (
        <div className="flex items-center gap-1 mb-1.5 flex-wrap pb-1 text-[11px] border-b border-line">
          <button
            onClick={() => insertFormatting('**', '**')}
            className="px-1.5 py-0.5 font-bold rounded hover:bg-raised text-ink-muted cursor-pointer"
            title="Bold (**text**)"
          >
            B
          </button>
          <button
            onClick={() => insertFormatting('*', '*')}
            className="px-1.5 py-0.5 italic rounded hover:bg-raised text-ink-muted cursor-pointer"
            title="Italic (*text*)"
          >
            I
          </button>
          <button
            onClick={() => insertFormatting('### ')}
            className="px-1.5 py-0.5 font-semibold rounded hover:bg-raised text-ink-muted cursor-pointer"
            title="Heading (### Title)"
          >
            H
          </button>
          <span className="text-ink-faint">|</span>
          <button
            onClick={() => insertFormatting('`', '`')}
            className="px-1.5 py-0.5 font-mono rounded hover:bg-raised text-ink-muted cursor-pointer"
            title="Inline Code (`code`)"
          >
            &lt;/&gt;
          </button>
          <button
            onClick={() => insertFormatting('```js\n', '\n```')}
            className="px-1.5 py-0.5 font-mono rounded hover:bg-raised text-ink-muted cursor-pointer"
            title="Code Block (```)"
          >
            ```
          </button>
          <button
            onClick={() => insertFormatting('- ')}
            className="px-1.5 py-0.5 rounded hover:bg-raised text-ink-muted cursor-pointer"
            title="Bullet list (- item)"
          >
            • List
          </button>
          <button
            onClick={() => insertFormatting('- [ ] ')}
            className="px-1.5 py-0.5 rounded hover:bg-raised text-done font-semibold cursor-pointer"
            title="Task Checklist item (- [ ] task)"
          >
            ☑ Checklist
          </button>
          <button
            onClick={() => insertFormatting('$', '$')}
            className="px-1.5 py-0.5 font-serif rounded hover:bg-raised text-learning cursor-pointer"
            title="LaTeX Math ($E=mc^2$)"
          >
            ∑ Math
          </button>
        </div>
      )}

      {/* Editor or Preview Pane */}
      {mode === 'write' ? (
        <textarea
          ref={textareaRef}
          aria-label="Topic notes"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Write your personal notes, code snippets, or checklists for this topic... (Autosaved & backed up)"
          rows={6}
          className="w-full px-3 py-2 text-xs rounded-lg border resize-y font-mono leading-relaxed"
          style={{
            borderColor: 'var(--theme-border-strong)',
            color: 'var(--theme-text)',
            backgroundColor: 'var(--theme-surface)',
          }}
        />
      ) : (
        <div
          className="w-full min-h-[140px] max-h-72 overflow-y-auto p-3 rounded-lg border bg-raised/50 select-text"
          style={{ borderColor: 'var(--theme-border)' }}
        >
          {renderPreview(note)}
        </div>
      )}

      {error && <div className="text-xs mt-1 text-danger">{error}</div>}
    </div>
  );
}
