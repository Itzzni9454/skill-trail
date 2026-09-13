import { useState, useRef, useEffect } from 'react';

interface LogMessage {
  type: 'log' | 'info' | 'warn' | 'error' | 'result';
  text: string;
  time: string;
}

interface Props {
  initialCode?: string;
  topicLabel?: string;
}

const DEFAULT_CODE = `// ⚡ Offline JavaScript & TypeScript Sandbox
// Try experimenting with this topic!

console.log("Hello from sandbox!");

const numbers = [1, 2, 3, 4, 5];
const doubled = numbers.map(n => n * 2);
console.log("Doubled:", doubled);

// Return values are automatically displayed
doubled.reduce((sum, n) => sum + n, 0);
`;

export default function CodePlayground({ initialCode, topicLabel }: Props) {
  const [code, setCode] = useState(initialCode || DEFAULT_CODE);
  const [logs, setLogs] = useState<LogMessage[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const workerRef = useRef<Worker | null>(null);

  // Clean up any running worker
  useEffect(() => {
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, []);

  function runCode() {
    if (isRunning && workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }

    setIsRunning(true);
    setLogs([]);

    const timestamp = () => new Date().toLocaleTimeString().split(' ')[0];

    // Sandboxed Web Worker source with virtual console
    const workerScript = `
      self.onmessage = function(e) {
        const code = e.data;
        const capturedLogs = [];

        function formatArg(arg) {
          if (arg === null) return 'null';
          if (arg === undefined) return 'undefined';
          if (typeof arg === 'object') {
            try { return JSON.stringify(arg, null, 2); }
            catch(err) { return String(arg); }
          }
          return String(arg);
        }

        const customConsole = {
          log: function(...args) {
            self.postMessage({ type: 'log', text: args.map(formatArg).join(' ') });
          },
          info: function(...args) {
            self.postMessage({ type: 'info', text: args.map(formatArg).join(' ') });
          },
          warn: function(...args) {
            self.postMessage({ type: 'warn', text: args.map(formatArg).join(' ') });
          },
          error: function(...args) {
            self.postMessage({ type: 'error', text: args.map(formatArg).join(' ') });
          }
        };

        try {
          const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
          let runFn;
          try {
            runFn = new AsyncFunction('console', code);
          } catch(e) {
            runFn = new Function('console', code);
          }
          const result = runFn(customConsole);
          if (result && typeof result.then === 'function') {
            result.then(function(res) {
              if (res !== undefined) {
                self.postMessage({ type: 'result', text: '↳ ' + formatArg(res) });
              }
              setTimeout(function() { self.postMessage({ type: '__done__' }); }, 200);
            }).catch(function(err) {
              self.postMessage({ type: 'error', text: String(err) });
              self.postMessage({ type: '__done__' });
            });
          } else {
            if (result !== undefined) {
              self.postMessage({ type: 'result', text: '↳ ' + formatArg(result) });
            }
            setTimeout(function() { self.postMessage({ type: '__done__' }); }, 50);
          }
        } catch(err) {
          self.postMessage({ type: 'error', text: err.name + ': ' + err.message });
          self.postMessage({ type: '__done__' });
        }
      };
    `;

    const blob = new Blob([workerScript], { type: 'application/javascript' });
    const blobUrl = URL.createObjectURL(blob);
    const worker = new Worker(blobUrl);
    workerRef.current = worker;

    // Timeout safety guard (3000ms max execution)
    const timeout = setTimeout(() => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
        setIsRunning(false);
        setLogs((prev) => [
          ...prev,
          {
            type: 'error',
            text: '⏱️ Execution timed out (>3000ms). Terminated to prevent freezing.',
            time: timestamp(),
          },
        ]);
      }
    }, 3000);

    worker.onmessage = function (ev) {
      if (ev.data.type === '__done__') {
        clearTimeout(timeout);
        setIsRunning(false);
        if (workerRef.current) {
          workerRef.current.terminate();
          workerRef.current = null;
        }
        URL.revokeObjectURL(blobUrl);
        return;
      }

      setLogs((prev) => [
        ...prev,
        {
          type: ev.data.type,
          text: ev.data.text,
          time: timestamp(),
        },
      ]);
    };

    worker.onerror = function (err) {
      clearTimeout(timeout);
      setIsRunning(false);
      setLogs((prev) => [
        ...prev,
        {
          type: 'error',
          text: 'Runtime Error: ' + err.message,
          time: timestamp(),
        },
      ]);
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
      URL.revokeObjectURL(blobUrl);
    };

    worker.postMessage(code);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      runCode();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const target = e.currentTarget;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const val = target.value;
      setCode(val.substring(0, start) + '  ' + val.substring(end));
      setTimeout(() => {
        target.selectionStart = target.selectionEnd = start + 2;
      }, 0);
    }
  }

  function loadTemplate(template: string) {
    if (template === 'async') {
      setCode(`// Async / Promise example\nasync function fetchData() {\n  console.log("Starting async request...");\n  return new Promise((resolve) => {\n    setTimeout(() => resolve({ status: 200, topic: "${topicLabel || 'Async JS'}" }), 300);\n  });\n}\n\nfetchData().then(data => console.log("Received:", data));\n`);
    } else if (template === 'array') {
      setCode(`// Functional Array Methods\nconst items = [\n  { name: 'Apple', price: 1.2 },\n  { name: 'Banana', price: 0.8 },\n  { name: 'Cherry', price: 2.5 }\n];\n\nconst affordable = items.filter(x => x.price < 2);\nconsole.log("Affordable:", affordable);\n\nitems.reduce((total, item) => total + item.price, 0);\n`);
    } else if (template === 'clean') {
      setCode(`// Clean Playground for ${topicLabel || 'Practice'}\nconsole.log("Ready!");\n\n`);
    }
    setLogs([]);
  }

  return (
    <div className="flex flex-col h-full space-y-3 select-none">
      {/* Sandbox Toolbar */}
      <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
        <div className="flex items-center gap-1.5">
          <span className="font-bold text-ink">⚡ Web Worker Sandbox</span>
          <span className="text-[10px] text-ink-faint">Ctrl+Enter to run</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => loadTemplate('array')}
            className="px-2 py-0.5 rounded border border-line hover:bg-raised text-[11px] text-ink-muted cursor-pointer"
          >
            Array
          </button>
          <button
            onClick={() => loadTemplate('async')}
            className="px-2 py-0.5 rounded border border-line hover:bg-raised text-[11px] text-ink-muted cursor-pointer"
          >
            Async
          </button>
          <button
            onClick={() => loadTemplate('clean')}
            className="px-2 py-0.5 rounded border border-line hover:bg-raised text-[11px] text-ink-muted cursor-pointer"
          >
            Clear
          </button>
          <button
            onClick={runCode}
            disabled={isRunning}
            className="px-3 py-1 rounded-lg bg-done hover:bg-done on-accent font-bold text-xs shadow-xs cursor-pointer flex items-center gap-1 ml-1 transition-all"
          >
            <span>{isRunning ? '⏳' : '▶'}</span>
            <span>{isRunning ? 'Running…' : 'Run'}</span>
          </button>
        </div>
      </div>

      {/* Code Editor Area */}
      <div className="flex-1 min-h-[180px] relative rounded-xl border border-line overflow-hidden bg-raised shadow-inner">
        <textarea
          aria-label="Code editor"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={handleKeyDown}
          spellCheck={false}
          className="w-full h-full p-3 font-mono text-xs text-done bg-transparent resize-none leading-relaxed"
          style={{ tabSize: 2 }}
        />
      </div>

      {/* Output Console */}
      <div className="h-44 rounded-xl border border-line bg-raised p-3 overflow-y-auto font-mono text-xs flex flex-col justify-start">
        <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-line text-[10px] text-ink-muted">
          <span>CONSOLE OUTPUT</span>
          {logs.length > 0 && (
            <button
              onClick={() => setLogs([])}
              className="text-ink-faint hover:text-ink-faint cursor-pointer"
            >
              Clear
            </button>
          )}
        </div>

        {logs.length === 0 ? (
          <div className="text-ink-muted text-xs italic my-auto text-center">
            Click "Run" or press Ctrl+Enter to execute code in isolated Web Worker.
          </div>
        ) : (
          <div className="space-y-1">
            {logs.map((log, i) => {
              const color =
                log.type === 'error'
                  ? 'text-danger'
                  : log.type === 'warn'
                  ? 'text-due'
                  : log.type === 'result'
                  ? 'text-note font-bold'
                  : 'text-ink';

              return (
                <div key={i} className={`flex items-start gap-2 ${color}`}>
                  <span className="text-[10px] text-ink-muted select-none">{log.time}</span>
                  <pre className="whitespace-pre-wrap break-all flex-1 font-mono">{log.text}</pre>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
