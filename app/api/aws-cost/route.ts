/* app/api/aws-cost/route.ts */

import { NextResponse } from "next/server";
import { CostExplorerClient, GetCostAndUsageCommand } from "@aws-sdk/client-cost-explorer";

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
  if (
    !process.env.AWS_ACCESS_KEY_ID ||
    !process.env.AWS_SECRET_ACCESS_KEY ||
  !process.env.AWS_REGION
  ) {
    const errorMsg = "AWS 자격증명이 서버에 설정되지 않았습니다. .env 파일을 확인하세요.";
    console.error(errorMsg);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
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

    const processedData: { [month: string]: MonthlyCost } = {};

    data.ResultsByTime?.forEach(result => {
      /* [수정] result.TimePeriod와 result.TimePeriod.Start가 모두 존재하는지 명확하게 확인합니다. */
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

    return NextResponse.json({ data: finalData });
  } catch (error) {
    console.error("Failed to fetch AWS cost:", error);
    const errorMessage = error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
    return NextResponse.json({ error: `AWS 비용 조회 실패: ${errorMessage}` }, { status: 500 });
  }
}
