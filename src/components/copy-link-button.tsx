'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button type="button" variant="secondary" size="sm" onClick={handleCopy}>
      {copied ? <Check size={14} /> : <Copy size={14} />}
      {copied ? 'Copied' : 'Copy Link'}
    </Button>
  );
}
