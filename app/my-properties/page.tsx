import { fetchAllProperties } from "@/lib/api";
import { calculateComprehensiveRealEstateTax, calculatePropertyTax } from "@/lib/tax";
import PropertyCardDynamic from "@/components/PropertyCardDynamic";
import CollapsibleContent from "@/components/CollapsibleContent";

export default async function MyPropertiesPage() {
  const allData = await fetchAllProperties();
  const comprehensiveTaxResults = calculateComprehensiveRealEstateTax(allData);
  const propertyTaxResults = calculatePropertyTax(allData);
  const owners = Object.keys(allData);

  return (
    <div className="flex flex-col items-center justify-center space-y-10 p-6">
    {owners.map((owner, ownerIndex) => {
      const properties = allData[owner];
      const comprehensiveTaxInfo = comprehensiveTaxResults.find((t) => t.owner === owner);
      const propertyTaxInfo = propertyTaxResults.find((t) => t.owner === owner);

      return (
        <div key={owner} className="w-full">
        <section className="w-full max-w-5xl flex flex-col items-center space-y-4">
        <h2 className="text-2xl font-bold text-gray-800 bg-yellow-300 px-4 py-1 rounded-md">
        [{owner}]
        </h2>

        <div className="w-full max-w-md flex flex-col items-center space-y-6">
        {/* 재산세 정보 섹션 */}
        <div className="w-full flex flex-col items-center p-2">
        <h3 className="text-lg font-semibold mb-2">재산세</h3>
        <p className="text-sm text-gray-400 mb-1">
        총 납부액: <span className="font-semibold text-white">{propertyTaxInfo?.totalPayableAmount.toLocaleString()} 원</span>
        </p>
        {/* [수정] 참고 정보 표시 */}
        {propertyTaxInfo?.referenceAmount && (
          <p className="text-xs text-yellow-400 mb-1">
          임대사업 아닌 경우: {propertyTaxInfo.referenceAmount.toLocaleString()} 원
          </p>
        )}
        <CollapsibleContent>
        {propertyTaxInfo?.description}
        </CollapsibleContent>
        </div>

        {/* 종합부동산세 정보 섹션 */}
        <div className="w-full flex flex-col items-center p-2">
        <h3 className="text-lg font-semibold mb-2">종합부동산세</h3>
        <p className="text-sm text-gray-400 mb-1">
        총 납부액: <span className="font-semibold text-white">{comprehensiveTaxInfo?.taxAmount.toLocaleString()} 원</span>
        </p>
        {/* [수정] 참고 정보 표시 */}
        {comprehensiveTaxInfo?.referenceAmount && (
          <p className="text-xs text-yellow-400 mb-1">
          임대사업 아닌 경우: {comprehensiveTaxInfo.referenceAmount.toLocaleString()} 원
          </p>
        )}
        <CollapsibleContent>
        {comprehensiveTaxInfo?.description}
        </CollapsibleContent>
        </div>
        </div>

        <div className="flex flex-wrap justify-center gap-6 mt-4">
        {properties.map((property, idx) => (
          <PropertyCardDynamic key={idx} property={property} />
        ))}
        </div>
        </section>

        {ownerIndex < owners.length - 1 && (
          <hr className="w-full max-w-5xl border-gray-700 my-8" />
        )}
        </div>
      );
    })}
    </div>
  );
}
