import React from 'react';
import { ClipboardPaste, Search } from 'lucide-react';

export function UrlInput({
  value,
  onChange,
  onLoad,
  loading,
}: {
  value: string;
  onChange: (value: string) => void;
  onLoad: () => void;
  loading: boolean;
}) {
  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        onChange(text.trim());
      }
    } catch {
      // Clipboard access might be blocked in some iframe contexts
    }
  };

  return (
    <div className="row">
      <input
        aria-label="Video URL"
        className="input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Paste a YouTube or Instagram URL"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && value && !loading) {
            e.preventDefault();
            onLoad();
          }
        }}
      />
      <button
        type="button"
        className="btn subtle"
        onClick={paste}
        aria-label="Paste URL"
        title="Paste from clipboard"
      >
        <ClipboardPaste size={19} />
      </button>
      <button
        type="button"
        className="btn"
        onClick={onLoad}
        disabled={!value || loading}
      >
        {loading ? (
          'Loading…'
        ) : (
          <>
            <Search size={18} /> Load
          </>
        )}
      </button>
    </div>
  );
}
