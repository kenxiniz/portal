import { fetchAllProperties } from "@/lib/api";
import { calculateComprehensiveRealEstateTax } from "@/lib/tax";
import PropertyCardDynamic from "@/components/PropertyCardDynamic";

export default async function MyPropertiesPage() {
  const allData = await fetchAllProperties();
  const taxResults = calculateComprehensiveRealEstateTax(allData);

  return (
    <div className="flex flex-col items-center justify-center space-y-10 p-6">
    {Object.entries(allData).map(([owner, properties]) => {
      const ownerTaxInfo = taxResults.find((t) => t.owner === owner);

      return (
        <section key={owner} className="w-full max-w-5xl flex flex-col items-center space-y-4">
        <h2 className="text-2xl font-bold text-indigo-600 dark:text-indigo-300 text-center">
        [{owner}]
        </h2>
        <p className="text-sm text-gray-400 mb-1">
        종부세 예상액: <span className="font-semibold text-white">{ownerTaxInfo?.taxAmount.toLocaleString()} 원</span>
        </p>
        <pre className="text-xs text-gray-500 whitespace-pre-wrap text-left max-w-full">
        {ownerTaxInfo?.description}
        </pre>
        <div className="flex flex-wrap justify-center gap-6">
        {properties.map((property, idx) => (
          <PropertyCardDynamic key={idx} property={property} />
        ))}
        </div>
        </section>
      );
    })}
    </div>
  );
}

