/* lib/scheduler/jobs/aws.ts */
import { exec } from "child_process";
import util from "util";
import { sendTelegramMessage } from "../../telegramUtils";

const execAsync = util.promisify(exec);

// ==========================================
// 🎯 [정상 상태(Baseline) 기준치 설정]
// 고객님의 실제 환경에 맞게 숫자를 수정해 주세요.
// ==========================================
const NORMAL_REGION = "ap-northeast-2";
const ALLOWED_EC2_ID = "i-0efd5339f0406606e";

// 현재 사용 중인 IAM 자원의 정상 개수 (초기 세팅 후 콘솔에서 확인하여 맞춰주세요)
const EXPECTED_IAM_USERS = 1; // 예: 본인 루트 계정 외에 생성한 사용자 수
const EXPECTED_IAM_ROLES = 2; // 예: 현재 존재하는 역할 수
const EXPECTED_IAM_POLICIES = 2; // 예: 고객 관리형 정책(커스텀 정책) 수

export const checkAllRegionsEC2Instances = async (): Promise<void> => {
  console.log("Starting full AWS resource & IAM security inspection...");

  try {
    // ---------------------------------------------------------
    // 1. [Global] IAM 보안 점검 (백도어 사용자 및 정책 감시)
    // ---------------------------------------------------------
    let iamUsers = 0,
      iamRoles = 0,
      iamPolicies = 0;
    try {
      const { stdout: usersOut } = await execAsync(
        "aws iam list-users --query 'Users[*].UserName' --output json",
      );
      iamUsers = JSON.parse(usersOut).length;

      const { stdout: rolesOut } = await execAsync(
        "aws iam list-roles --query 'Roles[*].RoleName' --output json",
      );
      iamRoles = JSON.parse(rolesOut).length;

      // --scope Local 옵션을 주면 수많은 AWS 기본 정책을 제외하고 '고객이 직접 만든 정책'만 세어줍니다.
      const { stdout: policiesOut } = await execAsync(
        "aws iam list-policies --scope Local --query 'Policies[*].PolicyName' --output json",
      );
      iamPolicies = JSON.parse(policiesOut).length;
    } catch (iamError) {
      console.error("Failed to fetch IAM data:", iamError);
    }

    const hasIamAnomaly =
      iamUsers > EXPECTED_IAM_USERS ||
      iamRoles > EXPECTED_IAM_ROLES ||
      iamPolicies > EXPECTED_IAM_POLICIES;

    // ---------------------------------------------------------
    // 2. [Regional] 컴퓨팅 자원 점검 (EC2, EKS, ECS, Lambda)
    // ---------------------------------------------------------
    const { stdout: regionsOut } = await execAsync(
      "aws ec2 describe-regions --query 'Regions[*].RegionName' --output json",
    );
    const regions: string[] = JSON.parse(regionsOut);

    let totalEC2 = 0,
      totalEKS = 0,
      totalECS = 0,
      totalLambda = 0;
    const abnormalComputeResources: string[] = [];

    // Helper function for introducing delay between region checks
    const delay = (ms: number) =>
      new Promise((resolve) => setTimeout(resolve, ms));

    // Process each region sequentially to avoid CPU/Memory spikes
    for (const region of regions) {
      try {
        // Execute resource checks concurrently within a single region
        const [ec2Res, eksRes, ecsRes, lambdaRes] = await Promise.all([
          execAsync(
            `aws ec2 describe-instances --region ${region} --query 'Reservations[*].Instances[*].[InstanceId, State.Name]' --output json`,
          ),
          execAsync(
            `aws eks list-clusters --region ${region} --query 'clusters' --output json`,
          ),
          execAsync(
            `aws ecs list-clusters --region ${region} --query 'clusterArns' --output json`,
          ),
          execAsync(
            `aws lambda list-functions --region ${region} --query 'Functions[*].FunctionName' --output json`,
          ),
        ]);

        const ec2Instances: [string, string][] = JSON.parse(
          ec2Res.stdout,
        ).flat();
        const unexpectedEC2 = ec2Instances.filter(
          ([id]) => id !== ALLOWED_EC2_ID,
        );
        totalEC2 += ec2Instances.length;

        const eksClusters: string[] = JSON.parse(eksRes.stdout);
        totalEKS += eksClusters.length;

        const ecsClusters: string[] = JSON.parse(ecsRes.stdout);
        totalECS += ecsClusters.length;

        const lambdaFunctions: string[] = JSON.parse(lambdaRes.stdout);
        totalLambda += lambdaFunctions.length;

        // [보안 로직] 허용된 리전의 특정 EC2 외에 발견된 컴퓨팅 자원 식별
        const regionHasAbnormalCompute =
          (region !== NORMAL_REGION &&
            (ec2Instances.length > 0 ||
              eksClusters.length > 0 ||
              ecsClusters.length > 0 ||
              lambdaFunctions.length > 0)) ||
          (region === NORMAL_REGION &&
            (unexpectedEC2.length > 0 ||
              eksClusters.length > 0 ||
              ecsClusters.length > 0 ||
              lambdaFunctions.length > 0));

        if (regionHasAbnormalCompute) {
          let detail = `- 📍 <b>${region}</b>: `;
          const items = [];
          if (ec2Instances.length > 0)
            items.push(`EC2 ${ec2Instances.length}대`);
          if (eksClusters.length > 0) items.push(`EKS ${eksClusters.length}개`);
          if (ecsClusters.length > 0)
            items.push(`ECS(Fargate) ${ecsClusters.length}개`);
          if (lambdaFunctions.length > 0)
            items.push(`Lambda ${lambdaFunctions.length}개`);
          detail += items.join(", ");
          abnormalComputeResources.push(detail);
        }

        // Sleep for 2000ms (2 seconds) before scanning the next region
        await delay(2000);
      } catch (error) {
        console.error(
          `Error inspecting compute resources in region ${region}:`,
          error,
        );
      }
    }

    // ---------------------------------------------------------
    // 3. 텔레그램 메시지 조립 및 전송
    // ---------------------------------------------------------
    const reportDate = new Date().toISOString().split("T")[0];
    const isComputeClean =
      abnormalComputeResources.length === 0 && totalEC2 === 1;
    const isTotallyClean = isComputeClean && !hasIamAnomaly;

    let message = `🛡️ <b>[AWS 철통 보안 리포트 - ${reportDate}]</b>\n\n`;

    if (isTotallyClean) {
      message += `✅ <b>상태: 완벽하게 안전함</b>\n`;
      message += `모든 글로벌 IAM 자원 및 리전별 컴퓨팅 자원이 기준치 이내입니다.\n\n`;
    } else {
      message += `🚨 <b>[경고] 비정상적인 자원 변동 감지!</b>\n\n`;
    }

    // 1) IAM 자원 요약표
    message += `<b>[글로벌 계정 권한 (IAM)]</b>\n`;
    message += `• 사용자(User): ${iamUsers}명 ${iamUsers > EXPECTED_IAM_USERS ? "⚠️ (초과)" : ""}\n`;
    message += `• 역할(Role): ${iamRoles}개 ${iamRoles > EXPECTED_IAM_ROLES ? "⚠️ (초과)" : ""}\n`;
    message += `• 직접 만든 정책: ${iamPolicies}개 ${iamPolicies > EXPECTED_IAM_POLICIES ? "⚠️ (초과)" : ""}\n\n`;

    // 2) 컴퓨팅 자원 요약표
    message += `<b>[글로벌 컴퓨팅 자원 (Compute)]</b>\n`;
    message += `• EC2: ${totalEC2}대 / EKS: ${totalEKS}개\n`;
    message += `• ECS: ${totalECS}개 / Lambda: ${totalLambda}개\n\n`;

    // 3) 비정상 컴퓨팅 자원 상세 내역
    if (!isComputeClean) {
      message += `<b>[⚠️ 감지된 비정상 컴퓨팅 상세]</b>\n${abnormalComputeResources.join("\n")}`;
    }

    console.log("AWS total security inspection completed.");
    await sendTelegramMessage(message);
  } catch (error) {
    console.error("Critical error during AWS total inspection:", error);
  }
};
