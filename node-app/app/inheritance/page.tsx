/* @/app/inheritance/page.tsx */
"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronUp,
  ArrowLeft,
  FileText,
  Coins,
  Building2,
  Scale,
  AlertTriangle,
  Home,
} from "lucide-react";

/* IMPORT COMPONENTS */
import InheritanceTaxSimulator from "@/components/InheritanceTaxSimulator";

/* IMPORT JSON DATA */
import propertiesData from "@/lib/properties.json";

interface ChecklistItem {
  id: string;
  title: string | JSX.Element;
  description: string;
  details: (string | JSX.Element)[];
}

interface PropertyData {
  type: string;
  address: string;
  acquisitionDate: string;
  purchasePrice: number;
  officialPrice: number;
  lastTransactionPrice: number;
  lastTransactionDate: string;
  notes: string;
  regulatedArea: boolean;
}

export default function InheritancePage() {
  const [openCard, setOpenCard] = useState<string | null>("step4");

  const toggleCard = (id: string) => {
    setOpenCard(openCard === id ? null : id);
  };

  const formatPrice = (price: number) => {
    if (!price || price === 0) return "0원";
    const uk = Math.floor(price / 10000);
    const man = Math.floor(price % 10000);
    if (uk > 0 && man > 0) return `${uk}억 ${man.toLocaleString()}만원`;
    if (uk > 0) return `${uk}억원`;
    return `${man.toLocaleString()}만원`;
  };

  const checklistData: ChecklistItem[] = [
    {
      id: "step1",
      title: "1단계: 사망신고 및 금융/재산 조회 (원스톱 서비스)",
      description:
        "별세 후 즉시 이행해야 하는 행정 절차 및 자산 파악 단계입니다.",
      details: [
        "사망진단서(또는 사체검안서) 발급 (병원 처방 및 행정 제출용 최소 5~10부 확보)",
        "관할 읍·면·동 주민센터 또는 정부24를 통해 1개월 이내 사망신고 완료 (기한 초과 시 과태료 발생)",
        "안심상속 원스톱 서비스 신청을 통해 고인 명의의 금융 계좌, 빚, 부동산, 세금 체납액 일괄 조회",
        "조회 결과 확인 전까지 고인 명의의 금융 계좌에서 예금 인출 자제 (향후 상속재산 협의 시 분쟁 방지)",
      ],
    },
    {
      id: "step2",
      title: "2단계: 입원비 및 보험료 청구 처리",
      description:
        "고인의 마지막 의료비 지출 정산 및 민간 보험 처리를 조율합니다.",
      details: [
        "사망 전 발생한 최종 입원비 및 치료비 영수증, 진료비 세부내역서 취합",
        "고인이 가입한 실손의료보험 및 사망보험금 약관 확인 후 구비 서류 제출",
        "수익자가 법정상속인으로 지정된 사망보험금은 고유재산으로 분류되어 압류 대상에서 제외되나, 상속세 계산 시에는 상속재산에 포함됨",
      ],
    },
    {
      id: "step3",
      title: "3단계: 상속재산 분할 협의 및 공증 계약 체결 (필독)",
      description:
        "세부 절세 전략을 바탕으로 공동상속인(아버지, 동생, 나) 간 합의서를 작성합니다.",
      details: [
        "상속재산 분할협의서 작성: 본 시나리오에 따라 단독 명의로 모든 부동산 지분을 상속받는 것으로 명시",
        <div
          key="warning"
          className="my-4 bg-red-50 dark:bg-red-950/20 border-l-4 border-red-600 rounded-r p-4 shadow-sm"
        >
          <span className="font-bold text-red-800 dark:text-red-400 block mb-2 text-base">
            [중요] 증여세 폭탄 방지를 위한 &apos;조건부 상속재산
            분할협의서&apos; 특약 필수
          </span>
          <span className="text-red-700 dark:text-red-300 leading-relaxed block mb-3 text-sm">
            단독 명의로 상속 등기를 마친 후, 매각 대금을 임의로 가족의 계좌에
            이체하면 국세청은 이를 상속이 아닌{" "}
            <strong>
              &apos;본인(나)이 아버지와 동생에게 현금을 무상으로 준
              것(증여)&apos;
            </strong>
            으로 간주하여 막대한 증여세를 부과합니다. 이를 완벽하게 방지하기
            위해 관할 등기소 제출용 분할협의서에 반드시 아래 특약을 기재하고
            공증을 받아야 합니다.
          </span>
          <div className="bg-white dark:bg-slate-900 border border-red-200 dark:border-red-800 rounded p-3 text-red-800 dark:text-red-300 text-sm space-y-3">
            <span className="font-bold block mb-1 border-b border-red-200 dark:border-red-800 pb-1">
              [특약 기재 예시]
            </span>
            <p className="italic leading-relaxed">
              1. 고양시 플러스빌라 입주권: 매각 및 부채 청산의 편의를 위해
              &apos;나&apos;의 단독 명의로 상속 등기한다. 단, 매각 대금에서 승계
              중도금, 관련 부채, 상속세 및 제반 비용을 공제한 최종 순수익금
              전액은 공동상속인인 <strong>&apos;아버지&apos;</strong>에게
              지급하여 정산하기로 한다.
            </p>
            <p className="italic leading-relaxed">
              2. 양재동 미창빌라: &apos;나&apos;의 단독 명의로 상속 등기하며,
              향후 매각 시 양도 대금에서 전세보증금 반환 및 제반 비용을 공제한
              순수익금은 공동상속인인{" "}
              <strong>&apos;나&apos;와 &apos;동생&apos;</strong>이 50:50의
              비율로 분배하여 정산하기로 한다.
            </p>
          </div>
        </div>,
        "위 조건부 협의서를 제출하면 대법원 판례에 따라 &apos;정당한 상속재산 분할에 의한 현금 정산&apos;으로 인정되어 증여세가 면제됩니다.",
      ],
    },
    {
      id: "step4",
      title: (
        <div className="flex items-center gap-2">
          <span>4단계: [셀프 상속등기] 1. 취득세 신고 및 서류 완비</span>
          <span className="text-[10px] bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-2 py-1 rounded font-bold">
            비용 300만원 절약
          </span>
        </div>
      ),
      description:
        "주민센터와 구청을 방문하여 법무사 없이 직접 등기 서류를 준비하는 단계입니다.",
      details: [
        <div key="doc-1" className="mb-2">
          <span className="font-bold text-slate-800 dark:text-slate-200 block mb-1">
            📋 피상속인 (어머니) 발급 서류 (주민등록번호 전체 공개)
          </span>
          <span className="text-slate-600 dark:text-slate-400 block ml-4">
            - 제적등본, 가족관계증명서(상세), 기본증명서(상세),
            친양자입양관계증명서(상세), 입양관계증명서(상세),
            혼인관계증명서(상세), 주민등록말소자 초본(과거 주소 변동내역 전체
            포함) 각 1부
          </span>
        </div>,
        <div key="doc-2" className="mb-2">
          <span className="font-bold text-slate-800 dark:text-slate-200 block mb-1">
            📋 공동상속인 전원 (아버지, 나, 동생) 발급 서류
          </span>
          <span className="text-slate-600 dark:text-slate-400 block ml-4">
            - 가족관계증명서(상세), 기본증명서(상세), 주민등록초본(과거 주소
            포함) 각 1부, 인감증명서(또는 본인서명사실확인서), 인감도장 지참
          </span>
        </div>,
        <div key="doc-3" className="mb-2">
          <span className="font-bold text-slate-800 dark:text-slate-200 block mb-1">
            📋 부동산 및 행정 서류
          </span>
          <span className="text-slate-600 dark:text-slate-400 block ml-4">
            - 토지대장 및 건축물대장 (정부24), 공증받은 상속재산 분할협의서 원본
          </span>
        </div>,
        <div
          key="doc-4"
          className="mt-3 p-3 bg-blue-50 dark:bg-blue-950/30 rounded border border-blue-100 dark:border-blue-900"
        >
          <span className="font-bold text-blue-800 dark:text-blue-300 block mb-1">
            🏦 구청 방문 및 취득세 납부 (매우 중요)
          </span>
          <span className="text-sm text-blue-700 dark:text-blue-400 leading-relaxed">
            위 서류를 모두 챙겨 물건지 관할 <strong>구청 세무과</strong>에
            방문합니다. 취득세 신고서를 작성하여 제출하면{" "}
            <strong>&apos;취득세 고지서&apos;</strong>를 발급해 줍니다. 구청 내
            은행이나 위택스(스마트폰)로 취득세를 즉시 납부하고{" "}
            <strong>&apos;취득세 영수필 확인서&apos;</strong>를 반드시 챙깁니다.
          </span>
        </div>,
      ],
    },
    {
      id: "step5",
      title: (
        <div className="flex items-center gap-2">
          <span>5단계: [셀프 상속등기] 2. 등기소 방문 및 접수</span>
          <span className="text-[10px] bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300 px-2 py-1 rounded font-bold">
            소유권 이전 완료
          </span>
        </div>
      ),
      description:
        "관할 등기소를 방문하여 최종 비용 납부 후 소유권 이전 등기를 접수합니다.",
      details: [
        "신청서 작성 꿀팁: 대법원 인터넷등기소(e-Form) 사이트에 접속하여 '소유권이전등기신청서(상속)'를 미리 작성해서 출력해가면 등기소에서 헤매지 않고 시간을 크게 단축할 수 있습니다.",
        "등기소 내 은행 업무: 등기소에 도착하면 1층 은행에 가서 ①국민주택채권 매입, ②등기신청수수료(부동산 당 약 15,000원)를 납부하고 각각 영수증을 받습니다.",
        "서류 편철: 등기신청서 맨 앞에 취득세 영수증, 채권매입 영수증, 등기수수료 영수증을 붙이고, 그 뒤에 상속재산분할협의서, 어머니 서류, 상속인 서류, 대장류를 순서대로 정리합니다.",
        "등기 접수 및 완료: 등기소 민원창구 민원안내관에게 한 번 검토를 받은 후 접수합니다. 서류에 이상이 없으면 영업일 기준 3~5일 내에 처리가 완료되며, 이후 신분증과 도장을 지참해 새로운 등기권리증(집문서)을 수령하면 내 명의 이전이 완벽히 끝납니다.",
      ],
    },
    {
      id: "step6",
      title: "6단계: 부동산 단독 명의 매각 (고양 6개월, 양재 5년 내)",
      description:
        "양도소득세 비과세 확정 및 채무 상환을 위해 기한 내 매각을 진행합니다.",
      details: [
        "상속개시일이 속하는 달의 말일부터 6개월 이내 고양시 입주권 매각(잔금 청산 기준) 시, 매각 가액이 상속재산 평가액으로 인정됩니다.",
        "이를 통해 &apos;취득가액 = 양도가액&apos;이 되어 입주권 매각에 따른 양도소득세가 전액 비과세(0원) 처리됩니다.",
        "매수자에게 분담금의 중도금 대출(실행 잔액 및 향후 납부액)을 전액 승계하는 조건으로 계약을 체결합니다.",
        "매각 후 확보된 대금으로 입주권 관련 채무, 일반 빚을 우선 상환하고 아버지께 순수익금을 지급합니다.",
      ],
    },
    {
      id: "step7",
      title: "7단계: 상속세 신고 및 납부 (최종 정산)",
      description:
        "매각 대금으로 현금을 확보한 뒤, 법정 기한 내 상속세를 자진 신고합니다.",
      details: [
        "상속개시일이 속하는 달의 말일부터 6개월 이내에 관할 세무서에 상속세 신고 및 납부",
        "피해갈 수 없는 고인 명의의 채무(빚)가 있을 경우, 상속재산가액에서 차감하는 채무공제 신청 준비",
        "입주권 매각 대금에서 확보된 현금으로 상속세를 납부하여 가족 간 현금 흐름 부담을 해소합니다.",
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 p-6 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <div className="max-w-5xl mx-auto">
        {/* Header Navigation */}
        <div className="mb-6">
          <Link
            href="/"
            className="inline-flex items-center text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline gap-1"
          >
            <ArrowLeft size={16} /> 메인 포트폴리오로 돌아가기
          </Link>
        </div>

        <div className="border-b border-slate-200 dark:border-slate-800 pb-5 mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            상속 프로세스 및 세무 분석 대시보드
          </h1>
          <p className="mt-2 text-base text-slate-600 dark:text-slate-400">
            어머니 별세 후 자산 이전 프로세스, 셀프 등기 실무, 그리고 자산
            데이터 기반 최적의 부동산 절세 시나리오를 검토합니다.
          </p>
        </div>

        {/* SECTION 1: Collapsible Checklist */}
        <section className="mb-12">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <FileText className="text-blue-500" /> 1. 상속 처리 행정 & 셀프 등기
            체크리스트
          </h2>
          <div className="space-y-3">
            {checklistData.map((item) => {
              const isOpen = openCard === item.id;
              // Add a special border color for self-registration steps
              const isSelfRegStep = item.id === "step4" || item.id === "step5";

              return (
                <div
                  key={item.id}
                  className={`border rounded-xl bg-white dark:bg-slate-900 overflow-hidden shadow-sm transition-all
                    ${isSelfRegStep ? "border-blue-400 dark:border-blue-600 shadow-blue-100 dark:shadow-blue-900/20" : "border-slate-200 dark:border-slate-800"}
                  `}
                >
                  <button
                    onClick={() => toggleCard(item.id)}
                    className={`w-full flex items-center justify-between p-5 text-left font-medium transition-colors
                      ${isSelfRegStep ? "hover:bg-blue-50/50 dark:hover:bg-blue-900/20" : "hover:bg-slate-50 dark:hover:bg-slate-800/50"}
                    `}
                  >
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                        {item.title}
                      </h3>
                      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                        {item.description}
                      </p>
                    </div>
                    {isOpen ? (
                      <ChevronUp
                        size={20}
                        className={
                          isSelfRegStep ? "text-blue-500" : "text-slate-400"
                        }
                      />
                    ) : (
                      <ChevronDown
                        size={20}
                        className={
                          isSelfRegStep ? "text-blue-500" : "text-slate-400"
                        }
                      />
                    )}
                  </button>

                  {isOpen && (
                    <div
                      className={`p-5 border-t 
                      ${isSelfRegStep ? "bg-blue-50/20 dark:bg-blue-900/10 border-blue-100 dark:border-blue-800" : "bg-slate-50/50 dark:bg-slate-900/50 border-slate-100 dark:border-slate-800"}
                    `}
                    >
                      <ul className="space-y-3 text-sm text-slate-700 dark:text-slate-300">
                        {item.details.map((detail, index) =>
                          typeof detail === "string" ? (
                            <li
                              key={index}
                              className="leading-relaxed flex gap-2 items-start"
                            >
                              <span
                                className={
                                  isSelfRegStep
                                    ? "text-blue-600 mt-0.5"
                                    : "text-blue-500 mt-0.5"
                                }
                              >
                                •
                              </span>
                              <span>{detail}</span>
                            </li>
                          ) : (
                            <div key={index}>{detail}</div>
                          ),
                        )}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* SECTION 2: Current Property Status */}
        <section className="mb-12">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Home className="text-purple-500" /> 2. 피상속인(어머니) 부동산 자산
            현황
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
            시스템에 등록된 피상속인의 보유 자산 목록입니다. 해당 부동산
            자산들이 상속 및 양도세 시나리오의 핵심 대상이 됩니다.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {propertiesData["엄마"].map((prop: PropertyData, idx: number) => (
              <div
                key={idx}
                className="border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 shadow-sm overflow-hidden"
              >
                <div className="bg-purple-50 dark:bg-purple-950/30 p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
                  <h3 className="font-bold text-purple-900 dark:text-purple-300">
                    {prop.type}
                  </h3>
                  <span className="text-xs font-semibold px-2 py-1 bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-300 rounded">
                    상속 대상 물건
                  </span>
                </div>
                <div className="p-5 space-y-4">
                  <div className="text-slate-800 dark:text-slate-200 font-medium text-sm leading-relaxed min-h-[40px]">
                    {prop.address}
                  </div>
                  <div className="grid grid-cols-2 gap-y-3 text-xs">
                    <div className="text-slate-500">취득일자:</div>
                    <div className="text-right font-medium text-slate-700 dark:text-slate-300">
                      {prop.acquisitionDate}
                    </div>
                    <div className="text-slate-500">취득가액:</div>
                    <div className="text-right font-medium text-slate-700 dark:text-slate-300">
                      {formatPrice(prop.purchasePrice)}
                    </div>
                    <div className="text-slate-500">최근 실거래가:</div>
                    <div className="text-right font-medium text-emerald-600 dark:text-emerald-400">
                      {formatPrice(prop.lastTransactionPrice)}
                    </div>
                    <div className="col-span-2 pt-2 mt-1 border-t border-slate-100 dark:border-slate-800">
                      <div className="text-slate-500 mb-1">참고사항:</div>
                      <div className="font-medium text-slate-700 dark:text-slate-300">
                        {prop.notes}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* SECTION 3: Tax Calculation Formulas & Bracket Table */}
        <section className="mb-12">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Coins className="text-emerald-500" /> 3. 세무 산정 기준 및
            상속세율표
          </h2>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm mb-6">
            <h3 className="font-bold text-slate-900 dark:text-white mb-3 border-b border-slate-100 dark:border-slate-800 pb-2">
              핵심 세액 산출 공식
            </h3>
            <ul className="space-y-3 text-sm text-slate-700 dark:text-slate-300">
              <li>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400 mr-2">
                  [상속세 과세표준]
                </span>
                = 상속재산가액 - 상속공제(배우자 미존재시 일괄공제 5억원) -
                피상속인 채무액(대출, 보증금 등)
              </li>
              <li>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400 mr-2">
                  [상속세 산출세액]
                </span>
                = (과세표준 × 과세표준 구간별 세율) - 누진공제액
              </li>
              <li>
                <span className="font-semibold text-blue-600 dark:text-blue-400 mr-2">
                  [양도세 산출세액]
                </span>
                = (양도가액 - 상속개시일 기준 취득가액 - 필요경비) × 양도세율
                <br />
                <span className="text-xs text-slate-500 ml-[100px]">
                  * 6개월 이내 처분 시 양도가액이 취득가액으로 인정되어 양도차익
                  0원 (비과세)
                </span>
              </li>
            </ul>
          </div>

          <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm bg-white dark:bg-slate-900">
            <table className="w-full text-center border-collapse text-sm">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800">
                  <th className="p-4 font-semibold">상속세 과세표준</th>
                  <th className="p-4 font-semibold">적용 세율</th>
                  <th className="p-4 font-semibold">누진공제액</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                <tr>
                  <td className="p-3">1억 원 이하</td>
                  <td className="p-3 font-semibold text-emerald-600">10%</td>
                  <td className="p-3">-</td>
                </tr>
                <tr>
                  <td className="p-3">1억 원 초과 ~ 5억 원 이하</td>
                  <td className="p-3 font-semibold text-emerald-600">20%</td>
                  <td className="p-3">1,000만 원</td>
                </tr>
                <tr>
                  <td className="p-3">5억 원 초과 ~ 10억 원 이하</td>
                  <td className="p-3 font-semibold text-emerald-600">30%</td>
                  <td className="p-3">6,000만 원</td>
                </tr>
                <tr>
                  <td className="p-3">10억 원 초과 ~ 30억 원 이하</td>
                  <td className="p-3 font-semibold text-emerald-600">40%</td>
                  <td className="p-3">1억 6,000만 원</td>
                </tr>
                <tr>
                  <td className="p-3">30억 원 초과</td>
                  <td className="p-3 font-semibold text-emerald-600">50%</td>
                  <td className="p-3">4억 6,000만 원</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* SECTION 4: Interactive Tax Simulator (Imported Component) */}
        <InheritanceTaxSimulator />

        {/* SECTION 5: Property Strategy & Simulation Scenario */}
        <section className="mb-12">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Building2 className="text-amber-500" /> 5. 부동산 단독 상속 및
            기간별 매각 최적화 시나리오
          </h2>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm space-y-6">
            <div className="border-l-4 border-blue-500 pl-4">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                단독 상속 명의 결정 요인 (데이터 기반)
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                {
                  "'나'는 이미 1주택(왕십리 아파트) 및 다수의 민간임대주택, 양재동 입주권을 보유하고 있으며, 동생 역시 재건축 빌라 및 조합원 계약건을 보유한 상태입니다. 지분을 쪼개어 상속받을 경우 양측 모두 복잡한 다주택자 양도세 중과 리스크에 노출됩니다. 따라서 일관된 매각 기한 통제를 위해 "
                }
                <strong>
                  {
                    "'내'가 어머니의 모든 자산(플러스빌라 입주권, 미창빌라)을 단독 상속받은 후 매각 대금을 공증에 따라 배분"
                  }
                </strong>
                {"하는 것이 양도세 관리 측면에서 가장 유리합니다."}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-4 bg-slate-50/50 dark:bg-slate-800/30">
                <span className="inline-block bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 text-xs px-2 py-1 rounded font-semibold mb-2">
                  시나리오 A: 고양시 플러스빌라 (입주권)
                </span>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  상속 개시일로부터 6개월 이내 처분
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">
                  현재 해당 물건은 주택이 아닌 입주권 상태입니다. 상속 후 6개월
                  이내에 매각할 경우,{" "}
                  <strong>
                    실제 매각 금액이 상속 당시의 자산 평가
                    가액(매매사례가액)으로 그대로 인정
                  </strong>
                  됩니다. 따라서 세법상 [취득가액 = 양도가액] 성립으로 인해{" "}
                  <strong>
                    양도차익이 0원이 되어 양도소득세가 전액 비과세(0원)
                  </strong>
                  되는 절세 효과를 거둘 수 있습니다.
                </p>
              </div>

              <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-4 bg-slate-50/50 dark:bg-slate-800/30">
                <span className="inline-block bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300 text-xs px-2 py-1 rounded font-semibold mb-2">
                  시나리오 B: 서울 서초구 양재동 미창빌라
                </span>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  상속 개시일로부터 5년 이내 처분
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">
                  {
                    "'나'의 기존 주택 보유 수와 무관하게, 세법상 소정 요건을 충족하는 상속주택을 "
                  }
                  <strong>
                    5년 이내에 양도하는 경우, 다주택자 양도세 중과 대상에서
                    배제되며 일반 세율(6~45%)이 적용
                  </strong>
                  됩니다. 이를 통해 매각을 위한 충분한 기간(5년)을 확보하면서
                  세금 폭탄을 방어합니다.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 6: Debt Settlement Scenario */}
        <section className="mb-6">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Scale className="text-indigo-500" /> 6. 상속재산 처분을 통한 단계별
            채무 변제 시나리오
          </h2>

          <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/60 rounded-xl p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle
                className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0"
                size={18}
              />
              <div>
                <h3 className="text-sm font-bold text-amber-900 dark:text-amber-400">
                  채무 공제 및 현금 흐름 최적화 순서
                </h3>
                <p className="text-xs text-amber-800 dark:text-amber-500/90 mt-1 leading-relaxed">
                  안심상속 원스톱 서비스를 통해 확정된 어머니의 법적
                  부채(피상속인 채무)는 상속세 자진 신고 시 총 상속재산가액에서
                  전액 공제 처리되어 상속세 과세 표준 자체를 낮추는 역할을
                  수행합니다.
                </p>
                <div className="mt-4 text-xs space-y-2 text-slate-700 dark:text-slate-300 font-medium">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 bg-amber-200 dark:bg-amber-900/60 text-amber-900 dark:text-amber-300 flex items-center justify-center rounded-full text-[10px]">
                      1
                    </span>
                    <span>
                      상속개시 후 즉시 고양 주교동 플러스빌라(입주권) 매각 절차
                      개시 (6개월 내 잔금 조건)
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 bg-amber-200 dark:bg-amber-900/60 text-amber-900 dark:text-amber-300 flex items-center justify-center rounded-full text-[10px]">
                      2
                    </span>
                    <span>
                      확보된 고양시 매각 대금으로 입주권 관련 채무 및 일반 빚을
                      최우선 상환하고 1단계 정산
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 bg-amber-200 dark:bg-amber-900/60 text-amber-900 dark:text-amber-300 flex items-center justify-center rounded-full text-[10px]">
                      3
                    </span>
                    <span>
                      이후 양재동 미창빌라 매각 시 발생한 대금으로 전세보증금을
                      반환하고 최종 2단계 정산 집행
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
