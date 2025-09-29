// const imgEl = await loadImage(url);
// const canvasRef = useRef(document.createElement('canvas'));
// import * as ort from 'onnxruntime-web';

import { loadImage } from "./function";

// 이미지 전처리 함수 - CLIP용으로 224x224 크기로 정규화
export function onnxPreprocess(imgEl, canvasRef, ort) {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    // CLIP 모델 입력 크기
    const targetSize = 224;
    canvas.width = targetSize;
    canvas.height = targetSize;

    // 이미지를 캔버스에 리사이즈하여 그리기
    ctx.drawImage(imgEl, 0, 0, targetSize, targetSize);

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