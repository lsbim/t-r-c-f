// 해당 함수들은 잘라야할 위치와 크기를 반환함
export function sliceClashCells() {
  // 사진 크기는 왼쪽 위 시작점부터 60X49 크기로 자른다.
  const CELL_WIDTH = 60;
  const CELL_HEIGHT = 49;

  // 1~5번 셀 (첫 번째 행)
  const firstRow = [
    { x: 350, y: 22 }, // 옆칸과 X축 73차이
    { x: 423, y: 22 }, // 73
    { x: 496, y: 22 }, // 
    { x: 569, y: 22 }, // 
    { x: 643, y: 22 },
  ];

  // 두 행의 Y축 차이는 71이다.

  // 6~9번 셀 (두 번째 행)
  const secondRow = [
    { x: 350, y: 93 },
    { x: 423, y: 93 }, 
    { x: 496, y: 93 },
    { x: 569, y: 93 },
  ];

  // 지도 배열과 고정 크기를 합쳐서 최종 rect 리스트 생성
  const rects = [
    ...firstRow.map((pos, idx) => ({
      index: idx + 1,        // 1-based 인덱스 (필요에 따라 0-based로 조정)
      x: pos.x,
      y: pos.y,
      w: CELL_WIDTH,
      h: CELL_HEIGHT
    })),
    ...secondRow.map((pos, idx) => ({
      index: idx + 6,        // 두 번째 행은 6번부터
      x: pos.x,
      y: pos.y,
      w: CELL_WIDTH,
      h: CELL_HEIGHT
    }))
  ];

  return rects;
}

export function sliceFrontierCells() {
  // 매크로로 캡쳐한 사진 원본을 기준으로 자른다.
  // 사진 크기는 왼쪽 위 시작점부터 66X54 크기로 자른다.
  const CELL_WIDTH = 66;
  const CELL_HEIGHT = 54;

  // 1~6번 셀 (첫 번째 행)
  const firstRow = [
    { x: 442, y: 22 }, // 옆칸과 X축 81차이
    { x: 523, y: 22 }, // 81
    { x: 604, y: 22 }, // 81
    { x: 686, y: 22 }, // 82
    { x: 767, y: 22 }, // 81
    { x: 848, y: 22 }, // 81
  ];

  // 두 행의 Y축 차이는 71이다.

  // 7~9번 셀 (두 번째 행)
  const secondRow = [
    { x: 442, y: 101 },
    { x: 523, y: 101 }, 
    { x: 604, y: 101 },
  ];

  // 지도 배열과 고정 크기를 합쳐서 최종 rect 리스트 생성
  const rects = [
    ...firstRow.map((pos, idx) => ({
      index: idx + 1,        // 1-based 인덱스 (필요에 따라 0-based로 조정)
      x: pos.x,
      y: pos.y,
      w: CELL_WIDTH,
      h: CELL_HEIGHT
    })),
    ...secondRow.map((pos, idx) => ({
      index: idx + 6,        // 두 번째 행은 6번부터
      x: pos.x,
      y: pos.y,
      w: CELL_WIDTH,
      h: CELL_HEIGHT
    }))
  ];

  return rects;
}