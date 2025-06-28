import propertiesData from './properties.json';

/*
export type MyProperty = {
  type: string;
  address: string;
  acquisitionDate: string;
  officialPrice: number;
  lastTransactionDate: string;
  lastTransactionPrice: number;
  notes: string;
  regulatedArea: boolean;
};
*/

export type MyProperty = {
  type: string;
  acquisitionDate: string;
  purchasePrice: number;
  officialPrice: number;
  lastTransactionPrice: number;
  lastTransactionDate: string;
  notes: string;
  regulatedArea: boolean;
  sigunguCode: string;
  bjdCode: string;
  bonbun: string;
  bubun: string;
  address: string;
};

export type PropertyData = MyProperty & {
  sigunguCode: string;
  bjdCode: string;
  bonbun: string;
  bubun: string;
};

type OfficialPriceApiResponse = {
  field?: { pblntfPclnd: string };
  response?: {
    body?: {
      items?: {
        item?: { pblntfPclnd: string }[];
      };
    };
  };
};

type RealTransactionApiResponse = {
  field?: { 거래금액: string };
  response?: {
    body?: {
      items?: {
        item?: { 거래금액: string }[];
      };
    };
  };
};

const OPENAPI_KEY = process.env.NEXT_PUBLIC_MOLIT_API_KEY as string;

const getMaskedAddress = (address: string): string => {
  return address
    .replace(/(\d+동\s*\d+호)/g, '')
    .replace(/(\d+층\s*\d+호)/g, '')
    .trim();
};

const fetchOfficialPrice = async (prop: PropertyData): Promise<number | null> => {
  const year = new Date().getFullYear().toString();
  const url = `https://apis.data.go.kr/1611000/nsdi/LandPriceService/attr/getLandPriceAttr?ServiceKey=${OPENAPI_KEY}&stdrYear=${year}&ldCode=${prop.sigunguCode}${prop.bjdCode}&mnnm=${prop.bonbun}&slno=${prop.bubun}&format=json`;

  try {
    const res = await fetch(url);
    const json = await res.json() as OfficialPriceApiResponse;
    const item = json.field || json.response?.body?.items?.item?.[0];
    return item?.pblntfPclnd ? parseInt(item.pblntfPclnd, 10) / 10000 : null;
  } catch {
    return null;
  }
};

const fetchRealTransactionPrice = async (prop: PropertyData): Promise<number | null> => {
  const yearMonth = new Date().toISOString().slice(0, 7).replace('-', '');
  const url = `https://apis.data.go.kr/1611000/AptListService/getAptList?ServiceKey=${OPENAPI_KEY}&LAWD_CD=${prop.sigunguCode}&DEAL_YMD=${yearMonth}&format=json`;

  try {
    const res = await fetch(url);
    const json = await res.json() as RealTransactionApiResponse;
    const items = json.field ? [json.field] : json.response?.body?.items?.item;

    if (items && items.length > 0) {
      const priceStr = items[0]?.거래금액?.replace(/,/g, '');
      return priceStr ? parseInt(priceStr, 10) : null;
    }
    return null;
  } catch {
    return null;
  }
};

export async function fetchAllProperties(): Promise<Record<string, MyProperty[]>> {
  const result: Record<string, MyProperty[]> = {};

  for (const owner of Object.keys(propertiesData)) {
    const props = (propertiesData as Record<string, PropertyData[]>)[owner];

    const fetched = await Promise.all(
      props.map(async (prop) => {
        let officialPrice = prop.officialPrice;
        let lastTransactionPrice = prop.lastTransactionPrice;

        if (owner === "나") { // OpenAPI 호출은 "나"만
          const apiOfficial = await fetchOfficialPrice(prop);
          const apiTransaction = await fetchRealTransactionPrice(prop);
          if (apiOfficial !== null) officialPrice = apiOfficial;
          if (apiTransaction !== null) lastTransactionPrice = apiTransaction;
        }

//        const { sigunguCode, bjdCode, bonbun, bubun, ...rest } = prop;

        return {
          ...prop,
          officialPrice,
          lastTransactionPrice,
          address: getMaskedAddress(prop.address)
        };
      })
    );

    result[owner] = fetched;
  }

  return result;
}

