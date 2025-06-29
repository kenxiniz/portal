"use client";

import { useState } from 'react';

type Props = {
  children: React.ReactNode;
};

export default function CollapsibleContent({ children }: Props) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div>
    <button
    onClick={() => setIsOpen(!isOpen)}
    className="text-xs text-gray-400 hover:text-white mb-2"
    >
    {isOpen ? '상세내역 닫기' : '상세내역 보기'}
    </button>
    {isOpen && (
      <pre className="text-xs text-gray-500 whitespace-pre-wrap text-left max-w-full bg-gray-900 p-2 rounded">
      {children}
      </pre>
    )}
    </div>
  );
}
