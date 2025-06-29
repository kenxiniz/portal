"use client";

import { useState } from 'react';

type Props = {
  title: string;
  children: React.ReactNode;
};

export default function CollapsibleSection({ title, children }: Props) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="w-full">
    <button
    onClick={() => setIsOpen(!isOpen)}
    className="text-xs text-gray-400 hover:text-white mb-2"
    >
    {isOpen ? `▼ ${title} 닫기` : `▶ ${title} 보기`}
    </button>
    {isOpen && (
      <pre className="text-xs text-gray-500 whitespace-pre-wrap text-left max-w-full bg-gray-900 p-2 rounded">
      {children}
      </pre>
    )}
    </div>
  );
}
