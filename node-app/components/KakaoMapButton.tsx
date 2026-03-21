"use client";

type Props = {
  address: string;
};

export default function KakaoMapButton({ address }: Props) {
  const openKakaoMap = () => {
    const url = `https://map.kakao.com/link/search/${encodeURIComponent(address)}`;
    window.open(url, "_blank", "noopener,noreferrer"); // 👉 새 탭에서 열기
  };

  return (
    <button
      onClick={openKakaoMap}
      className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs px-3 py-1 rounded"
    >
      지도 보기
    </button>
  );
}
