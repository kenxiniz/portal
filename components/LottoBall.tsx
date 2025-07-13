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

export const LottoBall: React.FC<LottoBallProps> = ({ number, isWinning, isBonus }) => {
  return (
    <div
    className={cn(
      "flex items-center justify-center h-10 w-10 rounded-full text-white font-bold text-lg shadow-md transition-transform transform",
      getBallColor(number),
      isWinning && "ring-4 ring-offset-2 ring-yellow-400 dark:ring-yellow-300 scale-110",
      isBonus && "ring-4 ring-offset-2 ring-green-400 dark:ring-green-300 scale-110"
    )}
    >
    {number}
    </div>
  );
};
