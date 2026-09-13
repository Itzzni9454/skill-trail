import { useEffect, useState } from 'react';
import { Shield, Copy, Check, Download, Layers } from 'lucide-react';
import ModalShell from './ModalShell';

interface BadgeModalProps {
  isOpen: boolean;
  onClose: () => void;
  slug?: string;
  title?: string;
}

export default function BadgeModal({ isOpen, onClose, slug = 'frontend', title = 'Roadmap' }: BadgeModalProps) {
  const [badgeType, setBadgeType] = useState<'roadmap' | 'overall'>('roadmap');
  const [badgeStyle, setBadgeStyle] = useState<'flat' | 'card'>('card');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [copied, setCopied] = useState<'md' | 'html' | null>(null);

  // Escape key closes modal
  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const origin = window.location.origin;
  const targetPath = badgeType === 'roadmap' ? `api/badge/${encodeURIComponent(slug)}.svg` : 'api/badge/overall.svg';
  const badgeUrl = `${origin}/${targetPath}?style=${badgeStyle}&theme=${theme}`;
  const displayTitle = badgeType === 'roadmap' ? title : 'Developer Learning Progress';

  const markdownCode = `[![${displayTitle} Progress](${badgeUrl})](https://github.com/kamranahmedse/developer-roadmap)`;
  const htmlCode = `<a href="https://github.com/kamranahmedse/developer-roadmap"><img src="${badgeUrl}" alt="${displayTitle} Progress" /></a>`;

  const copyToClipboard = (text: string, type: 'md' | 'html') => {
    navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2500);
  };

  return (
    <ModalShell
      open={isOpen}
      onClose={onClose}
      label="GitHub profile badge and Anki deck"
      title="Badge & Anki"
      subtitle="Embed your live progress in a GitHub README, or export a deck to Anki."
      icon={<Shield className="h-4 w-4" />}
      footer={
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="t-small rounded-lg px-4 py-1.5 font-medium transition-colors hover:bg-[var(--theme-hover-bg)]"
            style={{ border: '1px solid var(--theme-border)', color: 'var(--theme-text)' }}
          >
            Close
          </button>
        </div>
      }
    >

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 text-sm">
          {/* Controls */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label htmlFor="badge-scope" className="text-[11px] font-bold uppercase tracking-wider text-ink-faint block mb-1.5">
                Scope
              </label>
              <select
                id="badge-scope"
                value={badgeType}
                onChange={(e) => setBadgeType(e.target.value as any)}
                className="w-full px-3 py-1.5 rounded-lg border text-xs"
                style={{ borderColor: 'var(--theme-border)', backgroundColor: 'var(--theme-bg)', color: 'var(--theme-text)' }}
              >
                <option value="roadmap">Current Roadmap</option>
                <option value="overall">All Roadmaps (Overall)</option>
              </select>
            </div>

            <div>
              <label htmlFor="badge-style" className="text-[11px] font-bold uppercase tracking-wider text-ink-faint block mb-1.5">
                Badge Style
              </label>
              <select
                id="badge-style"
                value={badgeStyle}
                onChange={(e) => setBadgeStyle(e.target.value as any)}
                className="w-full px-3 py-1.5 rounded-lg border text-xs"
                style={{ borderColor: 'var(--theme-border)', backgroundColor: 'var(--theme-bg)', color: 'var(--theme-text)' }}
              >
                <option value="card">Detailed Card</option>
                <option value="flat">Compact Flat</option>
              </select>
            </div>

            <div>
              <label htmlFor="badge-theme" className="text-[11px] font-bold uppercase tracking-wider text-ink-faint block mb-1.5">
                Theme
              </label>
              <select
                id="badge-theme"
                value={theme}
                onChange={(e) => setTheme(e.target.value as any)}
                className="w-full px-3 py-1.5 rounded-lg border text-xs"
                style={{ borderColor: 'var(--theme-border)', backgroundColor: 'var(--theme-bg)', color: 'var(--theme-text)' }}
              >
                <option value="dark">Dark Theme</option>
                <option value="light">Light Theme</option>
              </select>
            </div>
          </div>

          {/* Live Preview */}
          <div className="space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-ink-faint block">
              Live Badge Preview
            </span>
            <div
              className="p-6 rounded-xl border flex items-center justify-center min-h-[120px]"
              style={{
                backgroundColor: 'var(--theme-bg)',
                borderColor: 'var(--theme-border)',
              }}
            >
              <img src={badgeUrl} alt="Badge preview" className="max-w-full h-auto drop-shadow-sm" />
            </div>
          </div>

          {/* Code Snippets */}
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-ink-muted">Markdown (for GitHub README)</span>
                <button
                  onClick={() => copyToClipboard(markdownCode, 'md')}
                  className="text-xs text-done hover:text-done font-medium inline-flex items-center gap-1 active:scale-95 transition-transform"
                >
                  {copied === 'md' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-done" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Markdown</span>
                    </>
                  )}
                </button>
              </div>
              <textarea
                readOnly
                aria-label="Badge markdown code"
                value={markdownCode}
                rows={2}
                className="w-full px-3 py-2 rounded-lg border font-mono text-xs select-all"
                style={{
                  borderColor: 'var(--theme-border)',
                  backgroundColor: 'var(--theme-bg)',
                  color: 'var(--theme-text)',
                }}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-ink-muted">HTML</span>
                <button
                  onClick={() => copyToClipboard(htmlCode, 'html')}
                  className="text-xs text-done hover:text-done font-medium inline-flex items-center gap-1 active:scale-95 transition-transform"
                >
                  {copied === 'html' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-done" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy HTML</span>
                    </>
                  )}
                </button>
              </div>
              <textarea
                readOnly
                aria-label="Badge HTML code"
                value={htmlCode}
                rows={2}
                className="w-full px-3 py-2 rounded-lg border font-mono text-xs select-all"
                style={{
                  borderColor: 'var(--theme-border)',
                  backgroundColor: 'var(--theme-bg)',
                  color: 'var(--theme-text)',
                }}
              />
            </div>
          </div>

          {/* Anki Flashcards Export */}
          <div
            className="p-4 rounded-xl border flex items-center justify-between gap-4"
            style={{ borderColor: 'var(--theme-border)', backgroundColor: 'var(--theme-bg)' }}
          >
            <div>
              <div className="font-semibold flex items-center gap-2">
                <Layers className="w-4 h-4 text-learning shrink-0" />
                <span>Export to Anki Flashcards</span>
              </div>
              <div className="text-xs text-ink-faint mt-0.5">
                Download a ready-to-import flashcard deck with questions, notes, and guides.
              </div>
            </div>
            <a
              href={`/api/anki/${encodeURIComponent(slug)}/export`}
              download
              className="px-4 py-2 rounded-lg bg-learning hover:bg-learning on-accent font-semibold text-xs transition-colors shrink-0 shadow-sm flex items-center gap-1.5 active:scale-95"
            >
              <Download className="w-3.5 h-3.5 shrink-0" />
              <span>Download .txt</span>
            </a>
          </div>
        </div>
    </ModalShell>
  );
}
