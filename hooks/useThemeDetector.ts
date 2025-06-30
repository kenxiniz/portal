/* hooks/useThemeDetector.ts */

import { useState, useEffect } from 'react';

export const useThemeDetector = () => {
  const [gridStrokeColor, setGridStrokeColor] = useState('#e0e0e0'); /* 그리드 선 색상 상태 */

  useEffect(() => {
    /* 테마 변경 감지 및 그리드 색상 업데이트 함수 */
    const updateGridColor = () => {
      if (typeof window !== 'undefined' && document.documentElement.classList.contains('dark')) {
        setGridStrokeColor('#444444');
      } else {
        setGridStrokeColor('#e0e0e0');
      }
    };

    updateGridColor(); /* 초기 로드 시 색상 설정 */

    /* MutationObserver를 사용하여 html 태그의 class 변경 감지 */
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'class') {
          updateGridColor();
        }
      });
    });

    observer.observe(document.documentElement, { attributes: true });

    return () => observer.disconnect(); /* 클린업 함수 */
  }, []);

  return gridStrokeColor;
};
