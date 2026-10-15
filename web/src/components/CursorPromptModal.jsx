import { useState } from 'react';
export default function CursorPromptModal({ open, title, text, downloadName, onClose }) {
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function download() {
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = downloadName ?? 'cursor-repair-prompt.md';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cursor-prompt-title"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ maxWidth: 720, width: '100%', maxHeight: '85vh', overflow: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="cursor-prompt-title" style={{ marginTop: 0 }}>{title}</h3>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
          <button type="button" className="primary" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
          <button type="button" onClick={download}>Download</button>
          <button type="button" onClick={onClose}>Close</button>
        </div>
        <pre
          style={{
            fontSize: '0.75rem',
            whiteSpace: 'pre-wrap',
            background: '#121a26',
            padding: '1rem',
            borderRadius: 8,
            maxHeight: '55vh',
            overflow: 'auto',
          }}
        >
          {text}
        </pre>
      </div>
    </div>
  );
}
