
/* @/components/OwnerSection.tsx */

'use client';

import { useState } from 'react';
import PropertyCardDynamic from '@/components/PropertyCardDynamic';
import type { Property, PropertyTaxResult, TaxResult as ComprehensiveTaxResult } from "@/lib/tax";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp } from 'lucide-react';
/* [추가] 접기/펼치기 기능을 위해 Collapsible 컴포넌트를 가져옵니다. */
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface OwnerSectionProps {
  owner: string;
  properties: Property[];
  propertyTaxInfo: PropertyTaxResult | undefined;
  comprehensiveTaxInfo: ComprehensiveTaxResult | undefined;
}

export default function OwnerSection({
  owner,
  properties,
  propertyTaxInfo,
  comprehensiveTaxInfo,
}: OwnerSectionProps) {
  const [isOpen, setIsOpen] = useState(false);

  const totalTax = (propertyTaxInfo?.totalPayableAmount ?? 0) + (comprehensiveTaxInfo?.taxAmount ?? 0);

  return (
    <div className="w-full max-w-7xl border bg-card text-card-foreground rounded-lg shadow-md p-6">
    <div className="flex justify-between items-center">
    <div className="flex flex-col items-start text-left">
    <h2 className="text-2xl font-bold">{owner}</h2>
    <p className="mt-1 text-base text-muted-foreground">
    총 납부예상세액: <span className="font-semibold text-indigo-600 dark:text-indigo-400">{totalTax.toLocaleString()} 원</span>
    </p>
    </div>
    <Button onClick={() => setIsOpen(!isOpen)} variant="outline" size="sm">
    {isOpen ? "접기" : "상세 정보 보기"}
    {isOpen ? <ChevronUp className="h-4 w-4 ml-2" /> : <ChevronDown className="h-4 w-4 ml-2" />}
    </Button>
    </div>

    {isOpen && (
      <div className="mt-6 border-t border-border pt-6">
      <section className="w-full flex flex-col items-center space-y-6">
      {/* [수정] 세금 정보 섹션을 Collapsible 컴포넌트로 감쌉니다. */}
      <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* 재산세 */}
      <Collapsible className="w-full flex flex-col p-4 rounded-lg bg-background">
      <CollapsibleTrigger className="w-full text-left">
      <h3 className="text-lg font-semibold text-center text-foreground">재산세</h3>
      <p className="text-sm text-muted-foreground mb-1 text-center">
      총 납부액: <span className="font-semibold text-foreground">{propertyTaxInfo?.totalPayableAmount.toLocaleString()} 원</span>
      </p>
      {/* [추가] 참고 금액을 접힌 상태에서도 표시합니다. */}
      {propertyTaxInfo?.referenceAmount && (
        <p className="text-xs text-yellow-600 dark:text-yellow-400 mb-2 text-center">
        (임대사업 아닐 시: {propertyTaxInfo.referenceAmount.toLocaleString()} 원)
        </p>
      )}
      <div className="flex justify-center items-center text-xs text-blue-500 hover:underline">
      <ChevronDown className="h-4 w-4 mr-1 transition-transform [&[data-state=open]]:-rotate-180" />
      계산 근거 보기
      </div>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2">
      <pre className="w-full text-xs text-muted-foreground whitespace-pre-wrap text-left font-mono bg-white dark:bg-black/20 p-3 rounded-md">
      {propertyTaxInfo?.description}
      </pre>
      </CollapsibleContent>
      </Collapsible>

      {/* 종합부동산세 */}
      <Collapsible className="w-full flex flex-col p-4 rounded-lg bg-background">
      <CollapsibleTrigger className="w-full text-left">
      <h3 className="text-lg font-semibold text-center text-foreground">종합부동산세</h3>
      <p className="text-sm text-muted-foreground mb-1 text-center">
      총 납부액: <span className="font-semibold text-foreground">{comprehensiveTaxInfo?.taxAmount.toLocaleString()} 원</span>
      </p>
      {comprehensiveTaxInfo?.referenceAmount && (
        <p className="text-xs text-yellow-600 dark:text-yellow-400 mb-2 text-center">
        (임대사업 아닐 시: {comprehensiveTaxInfo.referenceAmount.toLocaleString()} 원)
        </p>
      )}
      <div className="flex justify-center items-center text-xs text-blue-500 hover:underline">
      <ChevronDown className="h-4 w-4 mr-1 transition-transform [&[data-state=open]]:-rotate-180" />
      계산 근거 보기
      </div>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2">
      <pre className="w-full text-xs text-muted-foreground whitespace-pre-wrap text-left font-mono bg-white dark:bg-black/20 p-3 rounded-md">
      {comprehensiveTaxInfo?.description}
      </pre>
      </CollapsibleContent>
      </Collapsible>
      </div>

      <hr className="w-full border-border my-4" />

      <div className="w-full grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
      {properties.map((property, idx) => (
        <PropertyCardDynamic key={idx} property={property} />
      ))}
      </div>
      </section>
      </div>
    )}
    </div>
  );
}
