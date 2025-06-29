/* @/app/my-properties/page.tsx */

import { calculateComprehensiveRealEstateTax, calculatePropertyTax, type OwnerProperties, type Property } from "@/lib/tax";
import PropertyCardDynamic from "@/components/PropertyCardDynamic";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import allDataJson from "@/lib/properties.json";

export default function MyPropertiesPage() {
  const allData: OwnerProperties = allDataJson;
  const owners = Object.keys(allData);
  const comprehensiveTaxResults = calculateComprehensiveRealEstateTax(allData);
  const propertyTaxResults = calculatePropertyTax(allData);

  return (
    <div className="flex flex-col items-center p-4 md:p-8 bg-slate-50 dark:bg-slate-950 min-h-screen">
    <h1 className="text-4xl font-extrabold text-slate-900 dark:text-slate-100 mb-8">
    부동산 재테크
    </h1>

    <Accordion type="single" collapsible className="w-full max-w-7xl space-y-4">
    {owners.map((owner) => {
      const properties = allData[owner];
      const comprehensiveTaxInfo = comprehensiveTaxResults.find((t) => t.owner === owner);
      const propertyTaxInfo = propertyTaxResults.find((t) => t.owner === owner);

      const totalTax = (propertyTaxInfo?.totalPayableAmount ?? 0) + (comprehensiveTaxInfo?.taxAmount ?? 0);

      return (
        <AccordionItem value={owner} key={owner} className="border bg-white dark:bg-slate-900 rounded-lg shadow-sm">
        <AccordionTrigger className="text-xl font-bold text-slate-800 dark:text-slate-200 hover:no-underline p-6">
        <div className="flex justify-between items-center w-full">
        <h2 className="text-2xl font-bold">{owner}</h2>
        <p className="text-lg text-slate-600 dark:text-slate-300 font-medium">
        총 납부예상세액: <span className="font-bold text-blue-600 dark:text-blue-400">{totalTax.toLocaleString()} 원</span>
        </p>
        </div>
        </AccordionTrigger>
        <AccordionContent className="p-6 pt-2">
        <div className="border-t border-slate-200 dark:border-slate-800 pt-6">
        <section className="w-full flex flex-col items-center space-y-6">
        <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 재산세 */}
        <Collapsible className="w-full p-4 rounded-lg bg-slate-50 dark:bg-slate-800 space-y-2">
        <CollapsibleTrigger className="w-full">
        <div className="text-center">
        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">재산세</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400">
        총 납부액: <span className="font-semibold text-slate-900 dark:text-slate-100">{propertyTaxInfo?.totalPayableAmount.toLocaleString()} 원</span>
        </p>
        {/* [수정] 색상을 붉은 계열로 변경 */}
        {propertyTaxInfo?.referenceAmount && (
          <p className="text-xs text-red-500 dark:text-red-400">
          (임대사업 아닐 시: {propertyTaxInfo.referenceAmount.toLocaleString()} 원)
          </p>
        )}
        </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
        <pre className="mt-2 w-full text-xs text-slate-600 dark:text-slate-400 whitespace-pre-wrap text-left font-mono bg-white dark:bg-slate-900 p-3 rounded-md">
        {propertyTaxInfo?.description}
        </pre>
        </CollapsibleContent>
        </Collapsible>
        {/* 종부세 */}
        <Collapsible className="w-full p-4 rounded-lg bg-slate-50 dark:bg-slate-800 space-y-2">
        <CollapsibleTrigger className="w-full">
        <div className="text-center">
        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">종합부동산세</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400">
        총 납부액: <span className="font-semibold text-slate-900 dark:text-slate-100">{comprehensiveTaxInfo?.taxAmount.toLocaleString()} 원</span>
        </p>
        {/* [수정] 색상을 붉은 계열로 변경 */}
        {comprehensiveTaxInfo?.referenceAmount && (
          <p className="text-xs text-red-500 dark:text-red-400">
          (임대사업 아닐 시: {comprehensiveTaxInfo.referenceAmount.toLocaleString()} 원)
          </p>
        )}
        </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
        <pre className="mt-2 w-full text-xs text-slate-600 dark:text-slate-400 whitespace-pre-wrap text-left font-mono bg-white dark:bg-slate-900 p-3 rounded-md">
        {comprehensiveTaxInfo?.description}
        </pre>
        </CollapsibleContent>
        </Collapsible>
        </div>
        <hr className="w-full border-slate-200 dark:border-slate-800 my-4" />
        <h3 className="text-xl font-bold text-slate-800 dark:text-slate-200">자산 상세 목록</h3>
        <div className="w-full grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 justify-items-center">
        {properties.map((property: Property, idx: number) => (
          <PropertyCardDynamic key={idx} property={property} />
        ))}
        </div>
        </section>
        </div>
        </AccordionContent>
        </AccordionItem>
      );
    })}
    </Accordion>
    </div>
  );
}
