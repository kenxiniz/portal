/* components/LottoMethodology.tsx */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Atom, BrainCircuit, Scaling } from 'lucide-react';

export const LottoMethodology = () => {
  return (
    <Card className="w-full bg-slate-900 border-blue-500/30 text-slate-200 shadow-xl mb-8">
    <CardHeader>
    <CardTitle className="text-center text-xl font-bold text-blue-300 flex items-center justify-center gap-2">
    <BrainCircuit className="h-6 w-6" />
    <span>현실의 추첨, 디지털로 완벽하게 재현하다</span>
    </CardTitle>
    </CardHeader>
    <CardContent className="text-sm text-slate-400 space-y-4">
    <div className="flex items-start gap-4">
    <Atom className="h-5 w-5 mt-1 text-blue-400 shrink-0" />
    <div>
    <h4 className="font-semibold text-slate-200">절대적 공정성의 원칙</h4>
    <p>
    단순히 랜덤 숫자를 나열하는 것을 넘어, 저희는 실제 로또 추첨기의 물리적 동작을 디지털 환경에 그대로 복제했습니다. 이는 모든 숫자가 매 순간 완벽하게 공평한 기회를 갖도록 보장하는 저희의 핵심 철학입니다.
      </p>
    </div>
    </div>
    <div className="flex items-start gap-4">
    <Scaling className="h-5 w-5 mt-1 text-blue-400 shrink-0" />
    <div>
    <h4 className="font-semibold text-slate-200">순차적 비복원추출: 진정한 무작위성의 구현</h4>
    {/* [수정] 따옴표를 HTML 엔티티 &apos;로 변경하여 ESLint 에러를 해결합니다. */}
    <p>
    45개의 가상 공이 담긴 디지털 드럼에서 하나의 공이 선택되는 순간, 그 공은 다시는 추첨 풀(pool)로 돌아오지 않습니다. 다음 공은 남은 44개 중에서, 그 다음은 43개 중에서 선택됩니다. 이 **순차적 비복원추출** 방식은 &apos;중복 시 재추첨&apos;하는 흔하지만 미세한 편향을 유발할 수 있는 방식을 원천적으로 배제하고, 매 선택이 이전 선택에 영향을 받는 실제 추첨 환경의 독립성을 완벽하게 시뮬레이션합니다.
      </p>
    </div>
    </div>
    </CardContent>
    </Card>
  );
};
