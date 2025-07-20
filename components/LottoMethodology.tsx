/* components/LottoMethodology.tsx */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
/* [수정] 사용하지 않는 'Atom' 아이콘을 import 목록에서 제거합니다. */
import { BrainCircuit, Scaling } from 'lucide-react';

export const LottoMethodology = () => {
  return (
    <Card className="w-full bg-slate-900 border-blue-500/30 text-slate-200 shadow-xl mb-8">
    <CardHeader>
    <CardTitle className="text-center text-xl font-bold text-blue-300 flex items-center justify-center gap-2">
    <BrainCircuit className="h-6 w-6" />
    <span>번호 생성 원리</span>
    </CardTitle>
    </CardHeader>
    <CardContent className="text-sm text-slate-400 space-y-4">
    <div className="flex items-start gap-4">
    <Scaling className="h-5 w-5 mt-1 text-blue-400 shrink-0" />
    <div>
    <h4 className="font-semibold text-slate-200">순차적 비복원추출</h4>
    <p>
    실제 추첨기처럼 45개의 공에서 하나를 뽑고, 뽑힌 공은 제외한 뒤 다음 공을 뽑는 방식을 사용하여 완벽한 무작위성을 구현합니다.
      </p>
    </div>
    </div>
    </CardContent>
    </Card>
  );
};
