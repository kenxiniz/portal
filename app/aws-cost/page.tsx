/* app/aws-cost/page.tsx */

import { CostExplorerClient, GetCostAndUsageCommand } from "@aws-sdk/client-cost-explorer";
import { AlertTriangle } from "lucide-react";
import { AwsCostClientUI } from "@/components/AwsCostClientUI";

export interface CostData {
  month: string;
  total: number;
  services: {
    [serviceName: string]: {
      total: number;
      details: {
        usageType: string;
        amount: number;
      }[];
    };
  };
}

async function getAwsCost(): Promise<{ data?: CostData[]; error?: string }> {
  if (
    !process.env.AWS_ACCESS_KEY_ID ||
    !process.env.AWS_SECRET_ACCESS_KEY ||
  !process.env.AWS_REGION
  ) {
    const errorMsg = "AWS 자격증명이 서버에 설정되지 않았습니다. .env 파일을 확인하세요.";
    console.error(errorMsg);
    return { error: errorMsg };
  }

  const client = new CostExplorerClient({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });

  const today = new Date();
  const startDate = new Date(today.getFullYear(), 0, 1).toISOString().split('T')[0];
  const endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];

  const command = new GetCostAndUsageCommand({
    TimePeriod: { Start: startDate, End: endDate },
    Granularity: "MONTHLY",
    Metrics: ["UnblendedCost"],
    GroupBy: [
      { Type: "DIMENSION", Key: "SERVICE" },
      { Type: "DIMENSION", Key: "USAGE_TYPE" }
    ],
  });

  try {
    const data = await client.send(command);

    const processedData: { [month: string]: CostData } = {};

    data.ResultsByTime?.forEach(result => {
      if (result.TimePeriod && result.TimePeriod.Start) {
        const month = result.TimePeriod.Start.substring(0, 7);

        if (!processedData[month]) {
          processedData[month] = { month, total: 0, services: {} };
        }

        result.Groups?.forEach(group => {
          const serviceName = group.Keys?.[0] || 'Unknown';
          const usageType = group.Keys?.[1] || 'N/A';
          const amount = parseFloat(group.Metrics?.UnblendedCost?.Amount || "0");

          if (amount < 0.01) return;

          if (!processedData[month].services[serviceName]) {
            processedData[month].services[serviceName] = { total: 0, details: [] };
          }

          processedData[month].services[serviceName].details.push({ usageType, amount });
        });
      }
    });

    Object.values(processedData).forEach(monthData => {
      let monthTotal = 0;
      Object.keys(monthData.services).forEach(serviceName => {
        const service = monthData.services[serviceName];

        service.details = service.details.filter(detail => detail.amount >= 0.01);

        if (service.details.length === 0) {
          delete monthData.services[serviceName];
        } else {
          const serviceTotal = service.details.reduce((acc, detail) => acc + detail.amount, 0);
          service.total = serviceTotal;
          monthTotal += serviceTotal;
        }
      });
      monthData.total = monthTotal;
    });

    const finalData = Object.values(processedData).filter(month => month.total > 0);

    return { data: finalData };
  } catch (error) {
    console.error("Failed to fetch AWS cost:", error);
    const errorMessage = error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
    return { error: `AWS 비용 조회 실패: ${errorMessage}` };
  }
}

export default async function AwsCostPage() {
  const { data, error } = await getAwsCost();

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center p-4 md:p-8 bg-slate-100 dark:bg-slate-950 min-h-screen">
      <AlertTriangle className="h-12 w-12 text-red-500" />
      <p className="mt-4 text-red-500 text-center">
      데이터를 불러오는 데 실패했습니다.<br />
      {error}
      </p>
      </div>
    );
  }

  return <AwsCostClientUI initialData={data} />;
}
