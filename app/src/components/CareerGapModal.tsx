import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Target, X, CheckCircle2, AlertCircle, ArrowRight } from 'lucide-react';
import { api } from '../lib/api';
import type { ProgressMap } from '../lib/types';

export interface CareerRole {
  id: string;
  title: string;
  badge: string;
  category: string;
  description: string;
  primaryRoadmaps: { slug: string; name: string }[];
  requiredSkills: {
    name: string;
    slug: string;
    keywords: string[];
    priority: 'high' | 'medium';
  }[];
}

const CAREER_ROLES: CareerRole[] = [
  {
    id: 'frontend-engineer',
    title: 'Senior Frontend Engineer',
    badge: '🎨',
    category: 'Web & UI Engineering',
    description: 'Specializes in high-performance web applications, modern component architecture, state management, and accessibility.',
    primaryRoadmaps: [
      { slug: 'frontend', name: 'Frontend Developer' },
      { slug: 'javascript', name: 'JavaScript' },
      { slug: 'react', name: 'React' },
    ],
    requiredSkills: [
      { name: 'HTML5 Semantic Structure & Forms', slug: 'frontend', keywords: ['html', 'semantic', 'dom'], priority: 'high' },
      { name: 'Modern CSS, Flexbox & Grid', slug: 'frontend', keywords: ['css', 'flexbox', 'grid', 'responsive'], priority: 'high' },
      { name: 'JavaScript ES6+ & Async/Await', slug: 'javascript', keywords: ['javascript', 'promise', 'async', 'closure', 'event loop'], priority: 'high' },
      { name: 'TypeScript & Type Safety', slug: 'typescript', keywords: ['typescript', 'generics', 'interface'], priority: 'high' },
      { name: 'React Component Lifecycle & Hooks', slug: 'react', keywords: ['react', 'hooks', 'component', 'props', 'state'], priority: 'high' },
      { name: 'Global State Management (Zustand/Redux)', slug: 'frontend', keywords: ['state management', 'redux', 'context'], priority: 'medium' },
      { name: 'Core Web Vitals & Web Performance', slug: 'frontend-performance-best-practices', keywords: ['performance', 'bundle', 'lazy', 'vitals'], priority: 'high' },
      { name: 'Unit & Integration Testing (Jest/Vitest)', slug: 'frontend', keywords: ['testing', 'unit test', 'jest', 'cypress'], priority: 'medium' },
      { name: 'Git Workflow & CI/CD Basics', slug: 'git-github', keywords: ['git', 'branch', 'pull request', 'merge'], priority: 'high' },
      { name: 'Web Security: CORS, XSS, CSP', slug: 'frontend', keywords: ['security', 'cors', 'xss', 'csp'], priority: 'medium' },
    ],
  },
  {
    id: 'backend-architect',
    title: 'Backend & Systems Architect',
    badge: '⚙️',
    category: 'Infrastructure & APIs',
    description: 'Designs resilient distributed systems, scalable REST/GraphQL APIs, relational schemas, caching, and microservices.',
    primaryRoadmaps: [
      { slug: 'backend', name: 'Backend Developer' },
      { slug: 'system-design', name: 'System Design' },
      { slug: 'sql', name: 'SQL & Relational DBs' },
    ],
    requiredSkills: [
      { name: 'Server Runtime (Node.js / Go / Python)', slug: 'backend', keywords: ['nodejs', 'go', 'python', 'server', 'http'], priority: 'high' },
      { name: 'REST & GraphQL API Design', slug: 'api-design', keywords: ['rest', 'graphql', 'api', 'endpoints'], priority: 'high' },
      { name: 'Relational Database Design & Indexing', slug: 'sql', keywords: ['sql', 'postgres', 'database', 'index', 'acid'], priority: 'high' },
      { name: 'In-Memory Caching (Redis / Memcached)', slug: 'redis', keywords: ['redis', 'cache', 'invalidation'], priority: 'high' },
      { name: 'Authentication: OAuth2, JWT & RBAC', slug: 'backend', keywords: ['auth', 'jwt', 'oauth', 'security'], priority: 'high' },
      { name: 'Message Brokers & Event Streams (Kafka/RabbitMQ)', slug: 'backend', keywords: ['kafka', 'queue', 'event', 'pubsub'], priority: 'medium' },
      { name: 'System Scalability, Sharding & CAP Theorem', slug: 'system-design', keywords: ['system design', 'scalability', 'sharding', 'cap'], priority: 'high' },
      { name: 'Docker Containerization', slug: 'docker', keywords: ['docker', 'container', 'dockerfile'], priority: 'high' },
      { name: 'Database Migrations & ORMs', slug: 'backend', keywords: ['migration', 'orm', 'prisma'], priority: 'medium' },
      { name: 'API Security & Rate Limiting', slug: 'api-security-best-practices', keywords: ['rate limit', 'dos', 'sanitize'], priority: 'medium' },
    ],
  },
  {
    id: 'devops-engineer',
    title: 'DevOps & Cloud Platform Engineer',
    badge: '☁️',
    category: 'Cloud & Operations',
    description: 'Champions infrastructure as code, automated continuous deployment pipelines, Kubernetes orchestration, and observability.',
    primaryRoadmaps: [
      { slug: 'devops', name: 'DevOps' },
      { slug: 'docker', name: 'Docker' },
      { slug: 'kubernetes', name: 'Kubernetes' },
    ],
    requiredSkills: [
      { name: 'Linux OS & Bash Shell Scripting', slug: 'linux', keywords: ['linux', 'bash', 'shell', 'permissions'], priority: 'high' },
      { name: 'Git & Trunk-Based Version Control', slug: 'git-github', keywords: ['git', 'github', 'version control'], priority: 'high' },
      { name: 'Docker Containers & Multi-stage Builds', slug: 'docker', keywords: ['docker', 'image', 'container'], priority: 'high' },
      { name: 'Kubernetes Pods, Services & Deployments', slug: 'kubernetes', keywords: ['kubernetes', 'k8s', 'pod', 'deployment'], priority: 'high' },
      { name: 'CI/CD Automation (GitHub Actions / GitLab)', slug: 'devops', keywords: ['ci/cd', 'pipeline', 'automation', 'actions'], priority: 'high' },
      { name: 'Infrastructure as Code (Terraform)', slug: 'terraform', keywords: ['terraform', 'iac', 'provisioning'], priority: 'high' },
      { name: 'Cloud Provider Fundamentals (AWS / GCP)', slug: 'aws', keywords: ['aws', 'cloud', 's3', 'ec2', 'iam'], priority: 'high' },
      { name: 'Monitoring & Telemetry (Prometheus / Grafana)', slug: 'devops', keywords: ['prometheus', 'grafana', 'metrics', 'logs'], priority: 'medium' },
      { name: 'Networking: DNS, TLS/SSL, Load Balancers', slug: 'network-engineer', keywords: ['dns', 'tls', 'ssl', 'load balancer'], priority: 'medium' },
      { name: 'DevSecOps & Secrets Management (Vault)', slug: 'devsecops', keywords: ['vault', 'secrets', 'security', 'cve'], priority: 'medium' },
    ],
  },
  {
    id: 'fullstack-engineer',
    title: 'Fullstack Web Engineer',
    badge: '⚡',
    category: 'Product & End-to-End',
    description: 'Bridges frontend and backend to deliver entire products end-to-end with high velocity.',
    primaryRoadmaps: [
      { slug: 'full-stack', name: 'Full Stack' },
      { slug: 'frontend', name: 'Frontend' },
      { slug: 'backend', name: 'Backend' },
    ],
    requiredSkills: [
      { name: 'Frontend Essentials: HTML, CSS, JavaScript', slug: 'frontend', keywords: ['html', 'css', 'javascript'], priority: 'high' },
      { name: 'React or Modern UI Framework', slug: 'react', keywords: ['react', 'vue', 'component'], priority: 'high' },
      { name: 'Node.js & Backend HTTP Handlers', slug: 'nodejs', keywords: ['nodejs', 'express', 'server'], priority: 'high' },
      { name: 'SQL & Database Queries', slug: 'sql', keywords: ['sql', 'database', 'query'], priority: 'high' },
      { name: 'RESTful APIs & JSON Contracts', slug: 'backend', keywords: ['rest', 'api', 'json'], priority: 'high' },
      { name: 'Authentication & Session Cookies', slug: 'backend', keywords: ['auth', 'session', 'cookie', 'jwt'], priority: 'medium' },
      { name: 'Git & Collaboration Workflow', slug: 'git-github', keywords: ['git', 'commit', 'branch'], priority: 'high' },
      { name: 'Dockerized Local Development', slug: 'docker', keywords: ['docker', 'compose'], priority: 'medium' },
      { name: 'Automated Testing Fundamentals', slug: 'qa', keywords: ['testing', 'test', 'qa'], priority: 'medium' },
      { name: 'Cloud Deployment (Vercel, AWS, or Docker)', slug: 'devops-beginner', keywords: ['deploy', 'cloud', 'hosting'], priority: 'medium' },
    ],
  },
  {
    id: 'ai-engineer',
    title: 'AI & Machine Learning Engineer',
    badge: '🤖',
    category: 'AI & Data Science',
    description: 'Builds modern generative AI applications, vector search pipelines, LLM fine-tuning, and scalable inference services.',
    primaryRoadmaps: [
      { slug: 'ai-engineer', name: 'AI Engineer' },
      { slug: 'python', name: 'Python' },
      { slug: 'prompt-engineering', name: 'Prompt Engineering' },
    ],
    requiredSkills: [
      { name: 'Python 3, NumPy & Vector Math', slug: 'python', keywords: ['python', 'numpy', 'math', 'vectors'], priority: 'high' },
      { name: 'Data Manipulation (Pandas / SQL)', slug: 'python-data-analysis', keywords: ['pandas', 'data', 'dataframe'], priority: 'high' },
      { name: 'Machine Learning Fundamentals & Scikit-Learn', slug: 'machine-learning', keywords: ['machine learning', 'regression', 'classification'], priority: 'high' },
      { name: 'Prompt Engineering & System Prompt Design', slug: 'prompt-engineering', keywords: ['prompt', 'few-shot', 'system'], priority: 'high' },
      { name: 'Embeddings & Vector Databases (Chroma/Pinecone)', slug: 'ai-engineer', keywords: ['embedding', 'vector', 'similarity'], priority: 'high' },
      { name: 'Retrieval Augmented Generation (RAG)', slug: 'ai-engineer', keywords: ['rag', 'retrieval', 'context window'], priority: 'high' },
      { name: 'Agentic Tool Calling & Function Calling', slug: 'ai-agents', keywords: ['agent', 'tools', 'autonomous'], priority: 'medium' },
      { name: 'Model Evaluation & Benchmarking', slug: 'ai-engineer', keywords: ['eval', 'benchmark', 'hallucination'], priority: 'medium' },
      { name: 'REST/FastAPI Model Serving', slug: 'python', keywords: ['fastapi', 'serving', 'api'], priority: 'medium' },
      { name: 'AI Red Teaming & Guardrails', slug: 'ai-red-teaming', keywords: ['jailbreak', 'security', 'guardrail'], priority: 'medium' },
    ],
  },
];

export default function CareerGapModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [selectedRoleId, setSelectedRoleId] = useState(CAREER_ROLES[0].id);
  const [allProgress, setAllProgress] = useState<Record<string, ProgressMap>>({});
  const [allDoneTopics, setAllDoneTopics] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isOpen) return;
    api.getProgress().then((p) => {
      const nodeProg = p.nodeProgress || {};
      setAllProgress(nodeProg as Record<string, ProgressMap>);

      // Collect all done topic IDs and labels
      const doneKeys = new Set<string>();
      for (const [s, map] of Object.entries(nodeProg)) {
        for (const [nodeId, st] of Object.entries(map as ProgressMap)) {
          if (st === 'done') {
            doneKeys.add(`${s}:${nodeId}`.toLowerCase());
            doneKeys.add(nodeId.toLowerCase());
          }
        }
      }
      setAllDoneTopics(doneKeys);
    }).catch(() => {});
  }, [isOpen]);

  const activeRole = useMemo(() => {
    return CAREER_ROLES.find((r) => r.id === selectedRoleId) || CAREER_ROLES[0];
  }, [selectedRoleId]);

  // Evaluate skills against user's progress
  const evaluation = useMemo(() => {
    const evaluated = activeRole.requiredSkills.map((skill) => {
      const slugMap = allProgress[skill.slug] || {};

      // Check if any done topic in this skill's roadmap matches keywords
      const hasDoneInRoadmap = Object.entries(slugMap).some(([nodeId, st]) => {
        if (st !== 'done') return false;
        const lowerId = nodeId.toLowerCase();
        return skill.keywords.some((kw) => lowerId.includes(kw.toLowerCase()));
      });

      // Check if any keyword matches a completed topic across other roadmaps
      const hasCrossDone = skill.keywords.some((kw) => {
        for (const key of allDoneTopics) {
          if (key.includes(kw.toLowerCase())) return true;
        }
        return false;
      });

      const isMastered = hasDoneInRoadmap || hasCrossDone;

      return {
        ...skill,
        isMastered,
      };
    });

    const masteredCount = evaluated.filter((s) => s.isMastered).length;
    const matchPct = Math.round((masteredCount / evaluated.length) * 100);

    const missingHighPriority = evaluated.filter((s) => !s.isMastered && s.priority === 'high');
    const missingMediumPriority = evaluated.filter((s) => !s.isMastered && s.priority === 'medium');

    const recommendedNext = [...missingHighPriority, ...missingMediumPriority].slice(0, 3);

    return {
      evaluated,
      masteredCount,
      totalCount: evaluated.length,
      matchPct,
      recommendedNext,
    };
  }, [activeRole, allProgress, allDoneTopics]);

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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--theme-scrim)] backdrop-blur-xs animate-in fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Career Role Gap Analysis"
    >
      <div
        className="w-full max-w-4xl max-h-[90vh] rounded-2xl border shadow-2xl flex flex-col overflow-hidden"
        style={{
          backgroundColor: 'var(--theme-surface)',
          borderColor: 'var(--theme-border)',
          color: 'var(--theme-text)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="px-6 py-4 border-b flex items-center justify-between"
          style={{
            backgroundColor: 'var(--theme-hover-bg)',
            borderColor: 'var(--theme-border)',
          }}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent to-note flex items-center justify-center on-accent shadow-md shadow-[color-mix(in_oklab,var(--theme-primary)_22%,transparent)] shrink-0">
              <Target className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: 'var(--theme-text)' }}>
                Career Role Gap Analysis
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-accent-soft text-accent border border-accent/30">
                  Market Fit
                </span>
              </h2>
              <p className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>
                Measure your knowledge against industry hiring expectations and pinpoint missing competencies.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-[var(--theme-hover-bg)] flex items-center justify-center transition-all cursor-pointer active:scale-95"
            style={{ color: 'var(--theme-text-muted)' }}
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body: Left Role Selector + Right Skill Analysis */}
        <div className="flex-1 overflow-y-auto flex flex-col md:flex-row">
          {/* Left Sidebar: Roles */}
          <div
            className="w-full md:w-64 border-b md:border-b-0 md:border-r p-3 space-y-1.5"
            style={{
              backgroundColor: 'var(--theme-surface-soft)',
              borderColor: 'var(--theme-border)',
            }}
          >
            <div className="text-[10px] font-bold uppercase tracking-wider px-2 py-1" style={{ color: 'var(--theme-text-faint)' }}>
              Select Target Role
            </div>
            {CAREER_ROLES.map((role) => {
              const isSelected = role.id === selectedRoleId;
              return (
                <button
                  key={role.id}
                  onClick={() => setSelectedRoleId(role.id)}
                  className={`w-full text-left p-2.5 rounded-xl border transition-all flex items-center gap-2.5 cursor-pointer ${
                    isSelected ? 'shadow-xs font-semibold' : 'hover:opacity-80'
                  }`}
                  style={{
                    backgroundColor: isSelected ? 'var(--theme-primary-soft)' : 'var(--theme-surface)',
                    borderColor: isSelected ? 'var(--theme-primary)' : 'var(--theme-border)',
                    color: 'var(--theme-text)',
                  }}
                >
                  <span className="text-xl shrink-0">{role.badge}</span>
                  <div className="min-w-0">
                    <div className="text-xs font-bold truncate">{role.title}</div>
                    <div className="text-[10px] truncate" style={{ color: 'var(--theme-text-muted)' }}>
                      {role.category}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Right Main Panel */}
          <div className="flex-1 p-6 space-y-6 overflow-y-auto">
            {/* Role Summary Banner */}
            <div
              className="p-4 rounded-2xl border flex items-start justify-between gap-4 flex-wrap"
              style={{
                backgroundColor: 'var(--theme-hover-bg)',
                borderColor: 'var(--theme-border)',
              }}
            >
              <div className="space-y-1 max-w-lg">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{activeRole.badge}</span>
                  <h3 className="text-base font-black" style={{ color: 'var(--theme-text)' }}>
                    {activeRole.title}
                  </h3>
                </div>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--theme-text-muted)' }}>
                  {activeRole.description}
                </p>
                <div className="flex items-center gap-1.5 pt-1 text-[11px]" style={{ color: 'var(--theme-text-faint)' }}>
                  <span>Mapped Roadmaps:</span>
                  {activeRole.primaryRoadmaps.map((rm) => (
                    <Link
                      key={rm.slug}
                      to={`/roadmap/${rm.slug}`}
                      onClick={onClose}
                      className="px-2 py-0.5 rounded border hover:underline font-medium transition-colors"
                      style={{
                        backgroundColor: 'var(--theme-surface)',
                        borderColor: 'var(--theme-border)',
                        color: 'var(--theme-text)',
                      }}
                    >
                      {rm.name} →
                    </Link>
                  ))}
                </div>
              </div>

              {/* Match Score Gauge */}
              <div
                className="flex flex-col items-center justify-center p-3 rounded-xl border min-w-28 text-center shadow-xs"
                style={{
                  backgroundColor: 'var(--theme-surface)',
                  borderColor: 'var(--theme-border)',
                }}
              >
                <div className="text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color: 'var(--theme-text-faint)' }}>
                  Role Readiness
                </div>
                <div
                  className={`text-3xl font-black font-mono ${
                    evaluation.matchPct >= 75
                      ? 'text-done'
                      : evaluation.matchPct >= 40
                      ? 'text-due'
                      : 'text-accent'
                  }`}
                >
                  {evaluation.matchPct}%
                </div>
                <div className="text-[11px] font-semibold" style={{ color: 'var(--theme-text-muted)' }}>
                  {evaluation.masteredCount} / {evaluation.totalCount} Skills
                </div>
              </div>
            </div>

            {/* Recommended Next Actions */}
            {evaluation.recommendedNext.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: 'var(--theme-text-muted)' }}>
                  <AlertCircle className="w-3.5 h-3.5 text-due" />
                  <span>Priority Action Plan — Next Topics to Study</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {evaluation.recommendedNext.map((rec) => (
                    <div
                      key={rec.name}
                      className="p-3 rounded-xl border text-xs flex flex-col justify-between space-y-2"
                      style={{
                        backgroundColor: 'var(--theme-surface)',
                        borderColor: 'var(--theme-border-strong)',
                      }}
                    >
                      <div>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase bg-due-soft text-due">
                          {rec.priority} Priority
                        </span>
                        <div className="font-bold mt-1.5" style={{ color: 'var(--theme-text)' }}>
                          {rec.name}
                        </div>
                      </div>
                      <Link
                        to={`/roadmap/${rec.slug}`}
                        onClick={onClose}
                        className="text-[11px] font-semibold text-done hover:underline flex items-center gap-1"
                      >
                        <span>Start topic in roadmap</span>
                        <ArrowRight className="w-3 h-3" />
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Comprehensive Competencies Checklist */}
            <div className="space-y-2">
              <div className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--theme-text-muted)' }}>
                Core Competencies Checklist
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {evaluation.evaluated.map((skill) => (
                  <div
                    key={skill.name}
                    className="p-3 rounded-xl border flex items-center justify-between text-xs transition-colors"
                    style={{
                      backgroundColor: skill.isMastered ? 'var(--theme-primary-soft)' : 'var(--theme-surface)',
                      borderColor: skill.isMastered ? 'var(--theme-primary)' : 'var(--theme-border)',
                      color: 'var(--theme-text)',
                    }}
                  >
                    <div className="flex items-center gap-2.5">
                      {skill.isMastered ? (
                        <CheckCircle2 className="w-5 h-5 text-done shrink-0" />
                      ) : (
                        <div
                          className="w-5 h-5 rounded-full border border-dashed flex items-center justify-center shrink-0"
                          style={{ borderColor: 'var(--theme-border)' }}
                        />
                      )}
                      <div>
                        <div className={`font-semibold ${skill.isMastered ? 'text-done' : ''}`}>
                          {skill.name}
                        </div>
                        <div className="text-[10px] mt-0.5 font-mono" style={{ color: 'var(--theme-text-faint)' }}>
                          Roadmap: {skill.slug}
                        </div>
                      </div>
                    </div>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        skill.isMastered
                          ? 'bg-done-soft text-done'
                          : 'border text-ink-faint'
                      }`}
                      style={{ borderColor: skill.isMastered ? undefined : 'var(--theme-border)' }}
                    >
                      {skill.isMastered ? 'Mastered' : 'Missing'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
