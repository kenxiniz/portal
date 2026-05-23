/* app/aws-cost/page.tsx */

import { exec } from "child_process";
import util from "util";
import { AlertTriangle } from "lucide-react";
import { AwsCostClientUI } from "@/components/AwsCostClientUI";

const execAsync = util.promisify(exec);

// --- [추가됨] AWS CLI 응답을 위한 정확한 타입 정의 ---
interface AWSCostGroup {
  Keys?: string[];
  Metrics?: {
    UnblendedCost?: {
      Amount?: string;
      Unit?: string;
    };
  };
}

interface AWSCostResultByTime {
  TimePeriod?: {
    Start?: string;
    End?: string;
  };
  Groups?: AWSCostGroup[];
}

interface AWSCostResponse {
  ResultsByTime?: AWSCostResultByTime[];
}
// -----------------------------------------------------

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
  const today = new Date();
  const startDate = new Date(today.getFullYear(), 0, 1)
    .toISOString()
    .split("T")[0];
  const endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    .toISOString()
    .split("T")[0];

  const command = `aws ce get-cost-and-usage --time-period Start=${startDate},End=${endDate} --granularity MONTHLY --metrics UnblendedCost --group-by Type=DIMENSION,Key=SERVICE Type=DIMENSION,Key=USAGE_TYPE --output json`;

  try {
    console.log(
      `[AWS Cost] Fetching Cost Explorer data for ${startDate} to ${endDate}...`,
    );
    const { stdout } = await execAsync(command, {
      maxBuffer: 1024 * 1024 * 10,
    });

    // [수정됨] 명시적 타입 캐스팅
    const data = JSON.parse(stdout) as AWSCostResponse;

    const processedData: { [month: string]: CostData } = {};

    // [수정됨] 매개변수에서 : any 제거
    data.ResultsByTime?.forEach((result) => {
      if (result.TimePeriod && result.TimePeriod.Start) {
        const month = result.TimePeriod.Start.substring(0, 7);

        if (!processedData[month]) {
          processedData[month] = { month, total: 0, services: {} };
        }

        // [수정됨] 매개변수에서 : any 제거
        result.Groups?.forEach((group) => {
          const serviceName = group.Keys?.[0] || "Unknown";
          const usageType = group.Keys?.[1] || "N/A";
          const amount = parseFloat(
            group.Metrics?.UnblendedCost?.Amount || "0",
          );

          if (amount < 0.01) return;

          if (!processedData[month].services[serviceName]) {
            processedData[month].services[serviceName] = {
              total: 0,
              details: [],
            };
          }

          processedData[month].services[serviceName].details.push({
            usageType,
            amount,
          });
        });
      }
    });

    Object.values(processedData).forEach((monthData) => {
      let monthTotal = 0;
      Object.keys(monthData.services).forEach((serviceName) => {
        const service = monthData.services[serviceName];

        service.details = service.details.filter(
          (detail) => detail.amount >= 0.01,
        );

        if (service.details.length === 0) {
          delete monthData.services[serviceName];
        } else {
          const serviceTotal = service.details.reduce(
            (acc, detail) => acc + detail.amount,
            0,
          );
          service.total = serviceTotal;
          monthTotal += serviceTotal;
        }
      });
      monthData.total = monthTotal;
    });

    const finalData = Object.values(processedData).filter(
      (month) => month.total > 0,
    );

    return { data: finalData };
  } catch (error) {
    console.error("Failed to fetch AWS cost via CLI:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred.";
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
          데이터를 불러오는 데 실패했습니다.
          <br />
          {error}
        </p>
      </div>
    );
  }

  return <AwsCostClientUI initialData={data} />;
}
