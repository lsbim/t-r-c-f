// 해당 함수들은 잘라야할 위치와 크기를 반환함
export function sliceClashCells() {
  // 사진 크기는 왼쪽 위 시작점부터 60X49 크기로 자른다.
  const CELL_WIDTH = 60;
  const CELL_HEIGHT = 49;

  // 2025-10-09일자로 y좌표 1씩 증가
  // 랭킹이 내림차순으로 변경되면서 카카오토의 좌표가 맞지 않아 내리게 된 결정
  // 이전 이미지는 y좌표를 22, 93으로 시작해야한다

  // 1~5번 셀 (첫 번째 행)
  const firstRow = [
    { x: 350, y: 23 }, // 옆칸과 X축 73차이
    { x: 423, y: 23 }, // 73
    { x: 496, y: 23 }, // 
    { x: 569, y: 23 }, // 
    { x: 643, y: 23 },
  ];

  // 두 행의 Y축 차이는 71이다.

  // 6~9번 셀 (두 번째 행)
  const secondRow = [
    { x: 350, y: 94 },
    { x: 423, y: 94 },
    { x: 496, y: 94 },
    { x: 569, y: 94 },
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
      index: idx + 7,        // 두 번째 행은 6번부터
      x: pos.x,
      y: pos.y,
      w: CELL_WIDTH,
      h: CELL_HEIGHT
    }))
  ];

  return rects;
}

// 차원 대충돌 2.0
export function sliceClashV2Cells(type) {
  // 사진 크기는 왼쪽 위 시작점부터 55X45 크기로 자른다.
  const CELL_WIDTH = 55;
  const CELL_HEIGHT = 45;

  const SKILL_CELL_WIDTH = 52;
  const SKILL_CELL_HEIGHT = 45;

  // 1~9번 셀 (셰이디의 차원)
  const firstRow = [
    { x: 258, y: 95 },
    { x: 326, y: 95 },
    { x: 393, y: 95 },
    { x: 461, y: 95 },
    { x: 528, y: 95 },
    { x: 597, y: 95 },
    { x: 665, y: 95 },
    { x: 733, y: 95 },
    { x: 800, y: 95 },
  ];

  // 두 행의 Y축 차이는 71이다.

  // 10~18번 셀 (림의 이면세계)
  const secondRow = [
    { x: 258, y: 223 },
    { x: 326, y: 223 },
    { x: 393, y: 223 },
    { x: 461, y: 223 },
    { x: 528, y: 223 },
    { x: 597, y: 223 },
    { x: 665, y: 223 },
    { x: 733, y: 223 },
    { x: 800, y: 223 },
  ];

  const thirdRow = [
    { x: 260, y: 349 },
    { x: 329, y: 349 },
    { x: 398, y: 349 },
  ];

  // 지도 배열과 고정 크기를 합쳐서 최종 rect 리스트 생성
  const rects = type === 'slice' ? [
    ...firstRow.map((pos, idx) => ({
      index: idx,
      x: pos.x,
      y: pos.y,
      w: CELL_WIDTH,
      h: CELL_HEIGHT
    })),
    ...secondRow.map((pos, idx) => ({
      index: idx + 9,
      x: pos.x,
      y: pos.y,
      w: CELL_WIDTH,
      h: CELL_HEIGHT
    }))
  ] : [
    ...firstRow.map((pos, idx) => ({
      index: idx,
      x: pos.x,
      y: pos.y,
      w: CELL_WIDTH,
      h: CELL_HEIGHT
    })),
    ...secondRow.map((pos, idx) => ({
      index: idx + 9,
      x: pos.x,
      y: pos.y,
      w: CELL_WIDTH,
      h: CELL_HEIGHT
    })),
    ...thirdRow.map((pos, idx) => ({
      index: idx + 18,
      x: pos.x,
      y: pos.y,
      w: SKILL_CELL_WIDTH,
      h: SKILL_CELL_HEIGHT
    }))
  ];

  return rects;
}

// 차원 대충돌 2.0 이면의파편
export function sliceClashV2SideSkills() {
  const CELL_WIDTH = 52;
  const CELL_HEIGHT = 45;

  const firstRow = [
    { x: 260, y: 349 },
    { x: 329, y: 349 },
    { x: 398, y: 349 },
  ];

  const rects = [
    ...firstRow.map((pos, idx) => ({
      index: idx + 1,
      x: pos.x,
      y: pos.y,
      w: CELL_WIDTH,
      h: CELL_HEIGHT
    }))
  ];

  return rects;
}