import { useEffect, useState } from 'react';
import { Layers, Sparkles, StickyNote } from 'lucide-react';
import ModalShell from './ModalShell';
import { api } from '../lib/api';
import { pushToast } from './ToastHost';
import { calculateRetention } from '../lib/retention';
import EmptyState from './EmptyState';
import { SkeletonText, LoadingAnnouncer } from './Skeleton';

export interface FlashcardItem {
  slug: string;
  nodeId: string;
  label: string;
  stage: number;
  dueAt: string;
  intervalDays?: number;
  lastReviewedAt?: string;
  roadmapTitle?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  items?: FlashcardItem[];
  onComplete?: () => void;
}

export default function FlashcardModal({ isOpen, onClose, items: initialItems, onComplete }: Props) {
  const [cards, setCards] = useState<FlashcardItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [content, setContent] = useState<string | null>(null);
  const [loadingContent, setLoadingContent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sessionResults, setSessionResults] = useState<{
    reviewed: number;
    again: number;
    hard: number;
    good: number;
    easy: number;
  }>({ reviewed: 0, again: 0, hard: 0, good: 0, easy: 0 });
  const [isFinished, setIsFinished] = useState(false);

  // Escape key closes modal
  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  // Initialize or fetch reviews
  useEffect(() => {
    if (!isOpen) {
      setIsFlipped(false);
      setContent(null);
      setCurrentIndex(0);
      setIsFinished(false);
      return;
    }

    if (initialItems && initialItems.length > 0) {
      setCards(initialItems);
      setCurrentIndex(0);
      setIsFinished(false);
      setSessionResults({ reviewed: 0, again: 0, hard: 0, good: 0, easy: 0 });
    } else {
      // scope=all folds in not-yet-due items: reviews are scheduled a day out,
      // so a strict "due only" deck is empty the entire day you learn something.
      api.getReviews('all').then((data) => {
        setCards(data.due);
        setCurrentIndex(0);
        setIsFinished(data.due.length === 0);
        setSessionResults({ reviewed: 0, again: 0, hard: 0, good: 0, easy: 0 });
      }).catch(() => {
        pushToast({ tone: 'info', message: 'Failed to load review cards' });
      });
    }
  }, [isOpen, initialItems]);

  const currentCard = cards[currentIndex];

  // Fetch content when card changes
  useEffect(() => {
    if (!isOpen || !currentCard) return;
    setIsFlipped(false);
    setContent(null);
    setLoadingContent(true);

    api.getNodeContent(currentCard.slug, currentCard.nodeId)
      .then((res) => {
        setContent(res.content);
      })
      .catch(() => {
        setContent(null);
      })
      .finally(() => {
        setLoadingContent(false);
      });
  }, [isOpen, currentCard]);

  // Answer grade handler
  async function handleGrade(grade: 'again' | 'hard' | 'good' | 'easy') {
    if (!currentCard || busy) return;
    setBusy(true);

    try {
      await api.answerReview(currentCard.slug, currentCard.nodeId, grade);

      setSessionResults((prev) => ({
        ...prev,
        reviewed: prev.reviewed + 1,
        [grade]: prev[grade] + 1,
      }));

      if (currentIndex + 1 < cards.length) {
        setCurrentIndex((i) => i + 1);
        setIsFlipped(false);
      } else {
        setIsFinished(true);
        onComplete?.();
      }
    } catch {
      pushToast({ tone: 'info', message: 'Failed to record review response' });
    } finally {
      setBusy(false);
    }
  }

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'Escape') {
        onClose();
      } else if (e.code === 'Space' || e.key === 'Enter') {
        e.preventDefault();
        if (!isFinished) setIsFlipped((f) => !f);
      } else if (isFlipped && !busy && !isFinished) {
        if (e.key === '1') handleGrade('again');
        else if (e.key === '2') handleGrade('hard');
        else if (e.key === '3') handleGrade('good');
        else if (e.key === '4') handleGrade('easy');
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, isFlipped, isFinished, busy, currentIndex, cards]);

  if (!isOpen) return null;

  const retention = currentCard
    ? calculateRetention(currentCard.lastReviewedAt || currentCard.dueAt, currentCard.intervalDays || 1)
    : null;

  return (
    <ModalShell
      open={isOpen}
      onClose={onClose}
      width="max-w-2xl"
      label="Active recall flashcards"
      title="Active recall"
      subtitle="Grade yourself and the interval ladder adjusts."
      icon={<Layers className="h-4 w-4" />}
      badge={
        !isFinished && cards.length > 0 ? (
          <span
            className="tnum t-micro rounded-full px-2 py-0.5 font-mono font-medium"
            style={{ backgroundColor: 'var(--theme-primary-soft)', color: 'var(--theme-primary)' }}
          >
            {currentIndex + 1} / {cards.length}
          </span>
        ) : null
      }
    >
        {/* Header */}
        {/* Progress Bar */}
        {!isFinished && cards.length > 0 && (
          <div className="w-full h-1" style={{ backgroundColor: 'var(--theme-border)' }}>
            <div
              className="bg-learning h-1 transition-all duration-300"
              style={{ width: `${((currentIndex) / cards.length) * 100}%` }}
            />
          </div>
        )}

        {/* Finished / Empty State */}
        {isFinished || cards.length === 0 ? (
          <div className="p-8 text-center flex flex-col items-center justify-center my-auto">
            <Sparkles className="mb-3 h-10 w-10" style={{ color: 'var(--theme-due)' }} aria-hidden="true" />
            <h3 className="text-lg font-bold" style={{ color: 'var(--theme-text)' }}>Review Session Complete!</h3>
            <p className="text-sm mt-1 max-w-sm" style={{ color: 'var(--theme-text-muted)' }}>
              {sessionResults.reviewed > 0
                ? `You've reviewed ${sessionResults.reviewed} topic${sessionResults.reviewed === 1 ? '' : 's'}. Spaced repetition intervals have been recalculated.`
                : 'All caught up! No cards are due for review right now.'}
            </p>

            {sessionResults.reviewed > 0 && (
              <div className="grid grid-cols-4 gap-3 my-6 w-full max-w-md">
                <div className="rounded-xl p-2.5 text-center"
                  style={{ backgroundColor: 'var(--theme-danger-soft)', border: '1px solid var(--theme-danger)' }}>
                  <div className="text-xs text-danger font-semibold">Again</div>
                  <div className="text-lg font-bold text-danger">{sessionResults.again}</div>
                </div>
                <div className="rounded-xl p-2.5 text-center"
                  style={{ backgroundColor: 'var(--theme-due-soft)', border: '1px solid var(--theme-due)' }}>
                  <div className="text-xs text-due font-semibold">Hard</div>
                  <div className="text-lg font-bold text-due">{sessionResults.hard}</div>
                </div>
                <div className="rounded-xl p-2.5 text-center"
                  style={{ backgroundColor: 'var(--theme-learning-soft)', border: '1px solid var(--theme-learning)' }}>
                  <div className="text-xs text-learning font-semibold">Good</div>
                  <div className="text-lg font-bold text-learning">{sessionResults.good}</div>
                </div>
                <div className="rounded-xl p-2.5 text-center"
                  style={{ backgroundColor: 'var(--theme-done-soft)', border: '1px solid var(--theme-done)' }}>
                  <div className="text-xs text-done font-semibold">Easy</div>
                  <div className="text-lg font-bold text-done">{sessionResults.easy}</div>
                </div>
              </div>
            )}

            <button
              onClick={onClose}
              className="px-6 py-2.5 bg-learning hover:bg-learning on-accent rounded-xl text-sm font-semibold shadow-md cursor-pointer transition-colors active:scale-95"
            >
              Done
            </button>
          </div>
        ) : (
          /* Card View */
          <div className="flex-1 overflow-y-auto p-6 flex flex-col">
            <div
              onClick={() => setIsFlipped(!isFlipped)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setIsFlipped((f) => !f);
                }
              }}
              role="button"
              tabIndex={0}
              aria-label={isFlipped ? 'Hide answer' : 'Reveal answer'}
              className="min-h-[260px] border rounded-2xl p-6 cursor-pointer hover:border-learning transition-all flex flex-col justify-between shadow-xs"
              style={{
                backgroundColor: 'var(--theme-surface-soft)',
                borderColor: 'var(--theme-border)',
              }}
            >
              {/* Card Meta */}
              <div className="flex items-center justify-between text-xs" style={{ color: 'var(--theme-text-muted)' }}>
                <span className="capitalize font-medium">
                  {currentCard.roadmapTitle || currentCard.slug}
                </span>
                {retention && (
                  <span
                    className="font-semibold flex items-center gap-1 px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: `${retention.color}15`, color: retention.color }}
                  >
                    <span>●</span> {retention.percentage}% memory retention
                  </span>
                )}
              </div>

              {/* Front vs Back */}
              <div className="my-auto py-4 text-center">
                {!isFlipped ? (
                  <div>
                    <span className="text-xs uppercase font-bold tracking-wider text-learning block mb-2">
                      Prompt / Topic
                    </span>
                    <h2 className="text-2xl font-bold" style={{ color: 'var(--theme-text)' }}>
                      {currentCard.label}
                    </h2>
                    <p className="text-xs mt-4" style={{ color: 'var(--theme-text-muted)' }}>
                      Can you explain or define this concept from memory?
                    </p>
                  </div>
                ) : (
                  <div className="text-left animate-fadeIn">
                    <span className="text-xs uppercase font-bold tracking-wider text-done block mb-2 text-center">
                      ✓ Definition & Concept Notes
                    </span>
                    <h2 className="text-lg font-bold mb-3 text-center" style={{ color: 'var(--theme-text)' }}>
                      {currentCard.label}
                    </h2>

                    {loadingContent ? (
                      <div className="py-2">
                        <LoadingAnnouncer label="Loading topic notes" />
                        <SkeletonText lines={4} />
                      </div>
                    ) : content ? (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs sm:text-sm max-h-56 overflow-y-auto pr-2 whitespace-pre-wrap leading-relaxed cursor-text select-text"
                        style={{ color: 'var(--theme-text)' }}
                      >
                        {content}
                      </div>
                    ) : (
                      <EmptyState
                        compact
                        icon={<StickyNote className="h-5 w-5" />}
                        title="No notes for this topic yet"
                        description="Open the topic's Notes tab in the roadmap to write a summary, and it will show up here as the answer side of the card."
                      />
                    )}
                  </div>
                )}
              </div>

              {/* Bottom Flip Hint */}
              <div className="text-center text-[11px] text-ink-faint font-medium">
                {isFlipped ? 'Click card or press [Space] to flip back' : 'Click card or press [Space] to reveal answer'}
              </div>
            </div>

            {/* Answer buttons.
                These were `bg-<state> ... text-<state>` — a solid state fill
                with the label in the *same* colour, so "Again / Hard / Good /
                Easy" rendered as four unlabelled blocks. The correct treatment
                for a state chip is the soft fill with the state ink on top. */}
            {isFlipped && (
              <div className="mt-4 pt-4 border-t border-line flex items-center justify-between gap-2 animate-fadeIn">
                {(
                  [
                    ['again', 'Again', '<1d', 'danger'],
                    ['hard', 'Hard', '1d', 'due'],
                    ['good', 'Good', '3d+', 'learning'],
                    ['easy', 'Easy', '7d+', 'done'],
                  ] as const
                ).map(([grade, label, interval, tone], i) => (
                  <button
                    key={grade}
                    onClick={() => handleGrade(grade)}
                    disabled={busy}
                    className="flex-1 py-2.5 px-2 rounded-xl text-xs font-bold transition-all cursor-pointer text-center disabled:opacity-50"
                    style={{
                      backgroundColor: `var(--theme-${tone}-soft)`,
                      border: `1px solid color-mix(in oklab, var(--theme-${tone}) 45%, transparent)`,
                      color: `var(--theme-${tone})`,
                    }}
                    aria-label={`Grade ${label}, next review in ${interval}`}
                  >
                    <div className="text-[10px] opacity-70">{i + 1}</div>
                    <div>
                      {label} ({interval})
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
    </ModalShell>
  );
}
