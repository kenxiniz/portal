/* app/api/aws-cost/route.ts */

import { NextResponse } from "next/server";
import { exec } from "child_process";
import util from "util";

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

/* 최종적으로 가공될 데이터의 타입을 정의합니다. */
interface MonthlyCost {
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

export async function GET() {
  const today = new Date();
  const startDate = new Date(today.getFullYear(), 0, 1)
    .toISOString()
    .split("T")[0];
  const endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    .toISOString()
    .split("T")[0];

  const command = `aws ce get-cost-and-usage --time-period Start=${startDate},End=${endDate} --granularity MONTHLY --metrics UnblendedCost --group-by Type=DIMENSION,Key=SERVICE Type=DIMENSION,Key=USAGE_TYPE --output json`;

  try {
    const { stdout } = await execAsync(command, {
      maxBuffer: 1024 * 1024 * 10,
    });

    // [수정됨] JSON.parse 결과를 명시적으로 타입 캐스팅합니다.
    const data = JSON.parse(stdout) as AWSCostResponse;

    const processedData: { [month: string]: MonthlyCost } = {};

    // [수정됨] 매개변수에서 : any 제거 (인터페이스를 통해 자동 추론됨)
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

    return NextResponse.json({ data: finalData });
  } catch (error) {
    console.error("Failed to execute AWS CLI for Cost Explorer:", error);
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Unknown error occurred while fetching cost.";
    return NextResponse.json(
      { error: `AWS 비용 조회 실패: ${errorMessage}` },
      { status: 500 },
    );
  }
}
