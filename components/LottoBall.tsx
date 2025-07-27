/* components/LottoBall.tsx */

import { cn } from '@/lib/utils';

interface LottoBallProps {
  number: number;
  isWinning?: boolean;
  isBonus?: boolean;
}

const getBallColor = (number: number): string => {
  if (number <= 10) return 'bg-yellow-400';
  if (number <= 20) return 'bg-blue-500';
  if (number <= 30) return 'bg-red-500';
  if (number <= 40) return 'bg-gray-500';
  return 'bg-green-500';
};

export const LottoBall: React.FC<LottoBallProps> = ({ number, isWinning, isBonus }) => {
  return (
    <div
    className={cn(
      'flex items-center justify-center w-8 h-8 rounded-full text-white font-bold text-sm shadow-md transition-all duration-300',
      getBallColor(number),
      {
        /* [수정] 보너스 번호의 테두리 색상을 검은색으로 변경합니다. */
        'border-4 border-black scale-110': isBonus,
        'winning-match-glow': isWinning,
      }
    )}
    >
    {number}
    </div>
  );
};
