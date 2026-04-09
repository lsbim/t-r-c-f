import { getAverageColor, getClosestAttribute } from "./colorCompareFunction";
import { loadImage } from "./function";

// 이미지 전처리 함수 - CLIP용으로 224x224 크기로 정규화
export function onnxPreprocess(imgEl, canvasRef, ort) {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    // CLIP 모델 입력 크기
    const targetSize = 224;
    canvas.width = targetSize;
    canvas.height = targetSize;

    // 레터박스 배경 (CLIP 정규화 평균값에 가까운 중립 회색)
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, targetSize, targetSize);

    const scale = Math.min(targetSize / imgEl.width, targetSize / imgEl.height);
    const newWidth = Math.round(imgEl.width * scale);
    const newHeight = Math.round(imgEl.height * scale);
    const dx = Math.round((targetSize - newWidth) / 2);
    const dy = Math.round((targetSize - newHeight) / 2);
    ctx.drawImage(imgEl, dx, dy, newWidth, newHeight);

    // 이미지상 레벨태그 마스킹
    const maskW = Math.round(newWidth * 0.32); // 캐릭터 영역의 32%
    const maskH = Math.round(newHeight * 0.25); // 캐릭터 영역의 25%
    ctx.fillStyle = '#808080'; // 지우지 말고 놔둘 것
    ctx.fillRect(
        dx + newWidth - maskW,  // 캐릭터 우측 끝에서 maskW만큼 왼쪽
        dy + newHeight - maskH,  // 캐릭터 하단 끝에서 maskH만큼 위
        maskW,
        maskH
    );

    // 성격 태그 마스킹
    // const cornerW = Math.round(newWidth * 0.22);
    // const cornerH = Math.round(newHeight * 0.22);
    // ctx.fillRect(dx, dy, cornerW, cornerH);


    // -------------텐서 변환-----------------

    const imageData = ctx.getImageData(0, 0, targetSize, targetSize);
    const pixels = imageData.data; // RGBA 형식

    // CLIP 표준 정규화 값들
    const mean = [0.485, 0.456, 0.406];
    const std = [0.229, 0.224, 0.225];
    const data = new Float32Array(3 * targetSize * targetSize);

    // RGB 채널별로 정규화 처리
    for (let i = 0; i < targetSize * targetSize; i++) {
        // R 채널 (첫 번째 채널)
        data[i] = ((pixels[i * 4] / 255.0) - mean[0]) / std[0];
        // G 채널 (두 번째 채널)  
        data[targetSize * targetSize + i] = ((pixels[i * 4 + 1] / 255.0) - mean[1]) / std[1];
        // B 채널 (세 번째 채널)
        data[2 * targetSize * targetSize + i] = ((pixels[i * 4 + 2] / 255.0) - mean[2]) / std[2];
    }

    // ONNX 텐서로 변환하여 반환
    return new ort.Tensor('float32', data, [1, 3, targetSize, targetSize]);
}

// 여러 이미지를 단위벡터로 임베딩하여 임베딩 배열 반환
export async function batchEmbed(imageUrls, canvasRef, ort, session) {
    const N = imageUrls.length;
    const targetSize = 224;
    const totalSize = N * 3 * targetSize * targetSize;
    const bigData = new Float32Array(totalSize);

    // 이미지를 불러와 텐서객체로 변환 후 Float32Array에 삽입
    await Promise.all(imageUrls.map(async (url, idx) => {
        const img = await loadImage(url);
        const tensor = onnxPreprocess(img, canvasRef, ort);
        bigData.set(tensor.data, idx * tensor.data.length);
    }));

    const batchTensor = new ort.Tensor('float32', bigData, [N, 3, targetSize, targetSize]);
    const outputs = await session.run({ pixel_values: batchTensor });
    const batchedEmb = outputs.image_embeds.data;

    const dim = batchedEmb.length / N;
    return Array.from({ length: N }, (_, i) => {
        const slice = batchedEmb.slice(i * dim, (i + 1) * dim);
        const norm = Math.hypot(...slice);
        return slice.map(v => v / norm);
    });
}

const THRESH = 0.8;

export async function matchNames(embs, cells, storedEmbs, idx) {

    console.time(`match ${idx}`);

    const names = await Promise.all(embs.map(async (emb, i) => {
        const cell = cells[i];

        let best = { score: -1, name: '' };
        for (const { name, emb: store } of storedEmbs) {
            let sum = 0;
            for (let j = 0; j < store.length; j++) sum += store[j] * emb[j];
            if (sum > best.score) best = { score: sum, name };
        }

        if (best.score <= 0.935) console.warn(`🚨 유사도 낮음: ${best.name} = ${best.score}`);

        let finalName = null;
        if (best?.score >= THRESH) {
            // let baseName = best.name.split('_')[0]; // 예: "우로스"
            const parts = best.name.split('_');
            const charName = parts[0];
            const skinName = parts.slice(1).join(' ') || null;

            // '우로스'인 경우에만 색상 분석 수행
            if (charName.startsWith('우로스')) {
                const cellImg = await loadImage(cell.url);
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = cell.w;
                tempCanvas.height = cell.h;
                const tempCtx = tempCanvas.getContext('2d');
                tempCtx.drawImage(cellImg, 0, 0);

                // 색상 추출 영역
                const roi = { x: 1, y: 15, w: 3, h: 30 };

                const avgColor = getAverageColor(tempCanvas, roi);
                const attribute = getClosestAttribute(avgColor);

                if (attribute) {
                    finalName = { charName: `${charName}(${attribute})`, skinName }; // 예) "우로스(우울)"
                } else {
                    finalName = { charName, skinName }; // 색상 매칭 실패 시 기본 이름 사용
                }
            } else {
                // 우로스가 아니면 기본 이름 사용
                finalName = { charName, skinName };
            }
        }
        return finalName;
    }));

    console.timeEnd(`match ${idx}`);

    return names;
}