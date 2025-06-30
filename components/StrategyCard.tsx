/* @/components/StrategyCard.tsx */

'use client';

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Home, ArrowRightLeft, Target, Key, ShieldCheck } from 'lucide-react';

interface StrategyCardProps {
  strategy: {
    title: string;
    description: string;
  };
}

/* 설명 텍스트를 기반으로 적절한 아이콘을 반환하는 함수 */
const getIconForStep = (step: string) => {
  if (step.includes('유지') || step.includes('보유')) return <Home className="h-5 w-5 text-blue-500" />;
  if (step.includes('매도') || step.includes('수익 실현')) return <Target className="h-5 w-5 text-green-500" />;
  if (step.includes('이주') || step.includes('입주') || step.includes('정착')) return <Key className="h-5 w-5 text-purple-500" />;
  if (step.includes('비과세') || step.includes('절감') || step.includes('혜택')) return <ShieldCheck className="h-5 w-5 text-yellow-500" />;
  return <ArrowRightLeft className="h-5 w-5 text-gray-500" />;
};

export default function StrategyCard({ strategy }: StrategyCardProps) {
  /* description 문자열을 줄바꿈(\n) 기준으로 나눠 배열로 만듭니다. */
  const steps = strategy.description.split('\n');

  return (
    <Card className="w-full bg-yellow-50 dark:bg-yellow-900/20 border-2 border-yellow-400 dark:border-yellow-600">
    <CardHeader>
    <CardTitle className="text-center text-lg font-semibold text-yellow-800 dark:text-yellow-300">
    {strategy.title}
    </CardTitle>
    </CardHeader>
    <CardContent>
    <div className="space-y-4">
    {steps.map((step, index) => (
      <div key={index} className="flex items-start space-x-4">
      <div className="flex flex-col items-center">
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-yellow-200 dark:bg-yellow-800">
      {getIconForStep(step)}
      </div>
      {/* 마지막 단계가 아니면 세로선 추가 */}
      {index < steps.length - 1 && (
        <div className="h-12 w-px bg-yellow-300 dark:bg-yellow-700"></div>
      )}
      </div>
      <div className="flex-1 pt-1">
      <p className="text-sm font-medium text-yellow-900 dark:text-yellow-200">{step}</p>
      </div>
      </div>
    ))}
    </div>
    </CardContent>
    </Card>
  );
}
