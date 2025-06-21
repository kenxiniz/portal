"use client";

import { useEffect } from "react";
import ReactDOM from "react-dom";

declare global {
  interface Window {
    kakao: KakaoNamespace;
  }
}

type KakaoNamespace = {
  maps: {
    LatLng: new (lat: number, lng: number) => KakaoLatLng;
    Map: new (container: HTMLElement, options: KakaoMapOptions) => KakaoMap;
    Marker: new (options: KakaoMarkerOptions) => KakaoMarker;
    services: {
      Geocoder: new () => KakaoGeocoder;
      Status: {
        OK: KakaoGeocoderStatus;
      };
    };
  };
};

type KakaoLatLng = {
  getLat: () => number;
  getLng: () => number;
};

type KakaoMapOptions = {
  center: KakaoLatLng;
  level: number;
};

type KakaoMap = {
  setCenter: (latlng: KakaoLatLng) => void;
};

type KakaoMarkerOptions = {
  map: KakaoMap;
  position: KakaoLatLng;
};

type KakaoMarker = object;

type KakaoGeocoder = {
  addressSearch: (
    address: string,
    callback: (result: KakaoGeocoderResult[], status: KakaoGeocoderStatus) => void
  ) => void;
};

type KakaoGeocoderResult = {
  address_name: string;
  y: string;
  x: string;
};

type KakaoGeocoderStatus = "OK" | "ZERO_RESULT" | "ERROR";

type Props = { address: string; onClose: () => void };

export default function KakaoMapPortal({ address, onClose }: Props) {
  useEffect(() => {
    const mapContainer = document.getElementById("kakao-map-container");
    if (!window.kakao || !mapContainer) return;

    const mapOption: KakaoMapOptions = {
      center: new window.kakao.maps.LatLng(37.5665, 126.9780),
      level: 3,
    };
    const map = new window.kakao.maps.Map(mapContainer, mapOption);

    const geocoder = new window.kakao.maps.services.Geocoder();
    geocoder.addressSearch(address, (result, status) => {
      if (status === "OK") {
        const coords = new window.kakao.maps.LatLng(
          Number(result[0].y),
          Number(result[0].x)
        );
        map.setCenter(coords);
        new window.kakao.maps.Marker({ map, position: coords });
      }
    });
  }, [address]);

  return ReactDOM.createPortal(
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white p-4 rounded shadow-lg w-[90%] max-w-md relative">
        <button onClick={onClose} className="absolute top-2 right-2 text-gray-500 text-xl">&times;</button>
        <div id="kakao-map-container" className="w-full h-64 bg-gray-200 rounded" />
      </div>
    </div>,
    document.body
  );
}

