import { fetchAllProperties } from "@/lib/api";
import PropertyCardDynamic from "@/components/PropertyCardDynamic";

export default async function MyPropertiesPage() {
  const allData = await fetchAllProperties();
  const owners = Object.keys(allData);

  return (
    <div className="flex flex-col items-center justify-center space-y-10 p-6">
      {owners.map(owner => (
        <section key={owner} className="w-full max-w-5xl flex flex-col items-center space-y-6">
          <h2 className="text-2xl font-bold text-indigo-600 dark:text-indigo-300 text-center">
            [{owner}]
          </h2>
          <div className="flex flex-wrap justify-center gap-6">
            {allData[owner].map((property, idx) => (
              <PropertyCardDynamic key={idx} property={property} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

