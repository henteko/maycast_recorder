/**
 * GuestUrlInput - ゲスト招待URL入力とコピーボタン
 */

import { useState } from 'react';
import { ClipboardDocumentIcon, CheckIcon } from '@heroicons/react/24/solid';
import { Button } from '../atoms/Button';

interface GuestUrlInputProps {
  url: string;
}

export const GuestUrlInput: React.FC<GuestUrlInputProps> = ({ url }) => {
  const [copied, setCopied] = useState(false);

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy URL:', err);
    }
  };

  return (
    <div>
      <label className="text-xs text-maycast-text-secondary mb-2 block font-medium">
        Guest Invitation URL
      </label>
      <div className="flex items-center gap-2">
        <input
          type="text"
          readOnly
          value={url}
          className="flex-1 bg-maycast-bg/50 text-maycast-text text-sm px-4 py-2.5 rounded-xl border border-maycast-border/50 font-mono focus:outline-none focus:border-maycast-primary/50"
        />
        <Button
          onClick={copyUrl}
          variant={copied ? 'success' : 'primary'}
          size="sm"
          className="!p-2.5"
        >
          {copied ? (
            <CheckIcon className="w-5 h-5" />
          ) : (
            <ClipboardDocumentIcon className="w-5 h-5" />
          )}
        </Button>
      </div>
      {copied && (
        <p className="text-xs text-maycast-safe mt-2 font-medium">
          Copied to clipboard!
        </p>
      )}
    </div>
  );
};
