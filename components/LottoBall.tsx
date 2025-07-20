/* components/LottoBall.tsx */

import { cn } from "@/lib/utils";

interface LottoBallProps {
  number: number;
  isWinning?: boolean;
  isBonus?: boolean;
}

const getBallColor = (number: number) => {
  if (number <= 10) return "bg-yellow-400";
  if (number <= 20) return "bg-blue-500";
  if (number <= 30) return "bg-red-500";
  if (number <= 40) return "bg-gray-500";
  return "bg-green-500";
};

/* [수정] 함수의 인자에서 사용하지 않는 isWinning, isBonus를 제거합니다. */
export const LottoBall: React.FC<LottoBallProps> = ({ number }) => {
  return (
    <div
    className={cn(
      "flex items-center justify-center h-10 w-10 rounded-full text-white font-bold text-lg shadow-md",
      getBallColor(number)
    )}
    >
    {number}
    </div>
  );
};
