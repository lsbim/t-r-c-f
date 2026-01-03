// 캔버스에 이미지를 그리고 그 픽셀을 직접 조작해 그레이스케일 + 이진화를 적용하는 예
export function preprocessCanvas(canvas) {
    const ctx = canvas.getContext('2d');
    const { width: w, height: h } = canvas;
    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;

    // 그레이스케일 변환
    for (let i = 0; i < data.length; i += 4) {
        // 가중치 방식 (Rec. 601)을 사용하여 밝기 계산
        let gray = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
        data[i] = data[i + 1] = data[i + 2] = gray;
    }

    // 이진화 (임계값 level: 0~1)
    const level = 0.5; // 적절히 조정
    const thresh = level * 255;
    for (let i = 0; i < data.length; i += 4) {
        // 밝기(=R값) 기준으로 흰/검정 결정
        let val = (data[i] >= thresh) ? 255 : 0;
        data[i] = data[i + 1] = data[i + 2] = val;
    }

    ctx.putImageData(imageData, 0, 0);
}


// 색상 반전 & 컨트라스트 조정 (필요시) 예시
export function invertColors(canvas) {
    const ctx = canvas.getContext('2d');
    const { width: w, height: h } = canvas;
    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
        // R, G, B 값 반전
        data[i] = 255 - data[i];
        data[i + 1] = 255 - data[i + 1];
        data[i + 2] = 255 - data[i + 2];
    }
    ctx.putImageData(imageData, 0, 0);
}


// 이미지 전처리: 그레이스케일 → 대비 향상 → 블러
export function applyPreprocessing(canvas) {
    let workingCanvas = canvas;
    if (!canvas._willReadFrequently) {
        workingCanvas = document.createElement('canvas');
        workingCanvas.width = canvas.width;
        workingCanvas.height = canvas.height;

        // 여기가 핵심: willReadFrequently를 true로 설정
        const ctx = workingCanvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(canvas, 0, 0);
        workingCanvas._willReadFrequently = true; // 표시용 플래그
    }

    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    // 1) 그레이스케일
    for (let i = 0; i < data.length; i += 4) {
        const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        data[i] = data[i + 1] = data[i + 2] = gray;
    }
    ctx.putImageData(imageData, 0, 0);

    // 2) 대비 향상 (contrast)
    const contrast = 1.5;
    const factor = (259 * (contrast * 255 + 255)) / (255 * (259 - contrast * 255));
    const cData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 0; i < cData.length; i += 4) {
        cData[i] = Math.min(255, Math.max(0, factor * (cData[i] - 128) + 128));
        cData[i + 1] = Math.min(255, Math.max(0, factor * (cData[i + 1] - 128) + 128));
        cData[i + 2] = Math.min(255, Math.max(0, factor * (cData[i + 2] - 128) + 128));
    }
    ctx.putImageData(new ImageData(cData, canvas.width, canvas.height), 0, 0);

    // 3) 간단 블러(노이즈 제거)
    ctx.filter = 'blur(0.5px)';
    const temp = document.createElement('canvas');
    temp.width = canvas.width; temp.height = canvas.height;
    temp.getContext('2d').drawImage(canvas, 0, 0);
    ctx.filter = 'none';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(temp, 0, 0);

    return canvas;
}

// 이진화(Threshold) 처리: 픽셀을 0 또는 255로 완전 분리
export function applyBinarization(canvas, threshold = 128) {
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
        const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        const bw = gray > threshold ? 255 : 0;
        data[i] = data[i + 1] = data[i + 2] = bw;
    }
    ctx.putImageData(imageData, 0, 0);
    return canvas;
}

export function applyAdaptiveBinarization(canvas) {
    const ctx = canvas.getContext('2d');
    const { width, height } = canvas;
    const img = ctx.getImageData(0, 0, width, height);
    const data = img.data;

    // 간단하게 윈도우마다 지역 평균을 써서 임계값 적용
    const blockSize = 16, C = 8;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            // 주변 픽셀 밝기 평균 계산
            let sum = 0, count = 0;
            for (let dy = -blockSize / 2; dy < blockSize / 2; dy++) {
                for (let dx = -blockSize / 2; dx < blockSize / 2; dx++) {
                    const nx = x + dx, ny = y + dy;
                    if (nx >= 0 && ny >= 0 && nx < width && ny < height) {
                        const idx = (ny * width + nx) * 4;
                        sum += data[idx];
                        count++;
                    }
                }
            }
            const mean = sum / count;
            const idx = (y * width + x) * 4;
            const val = data[idx] > mean - C ? 255 : 0;
            data[idx] = data[idx + 1] = data[idx + 2] = val;
        }
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
}

export function applyPreprocessingV2(sourceCanvas, scale = 1) {
    const w = sourceCanvas.width;
    const h = sourceCanvas.height;

    const scaledCanvas = document.createElement('canvas');
    const padding = 20;
    scaledCanvas.width = (w * scale) + (padding * 2);
    scaledCanvas.height = (h * scale) + (padding * 2);
    const ctx = scaledCanvas.getContext('2d', { willReadFrequently: true });

    // 흰 배경(여백)
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, scaledCanvas.width, scaledCanvas.height);

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(sourceCanvas, 0, 0, w, h, padding, padding, w * scale, h * scale);

    const imageData = ctx.getImageData(0, 0, scaledCanvas.width, scaledCanvas.height);
    const data = imageData.data;

    const threshold = 160;

    for (let i = 0; i < data.length; i += 4) {
        const brightness = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        const color = brightness > threshold ? 0 : 255;

        data[i] = color;     // R
        data[i + 1] = color; // G
        data[i + 2] = color; // B
    }

    ctx.putImageData(imageData, 0, 0);

    return scaledCanvas;
}

export function extractGradeRobust(region1) {
    // 여러 패턴을 시도해보는 방식
    const patterns = [
        // 정상적인 케이스: [용암맛1]
        /\[([가-힣]+맛\d+)\]/,

        // 닫는 괄호만 없는 케이스: [용암맛1
        /\[([가-힣]+맛\d*)/,

        // 여는 괄호만 없는 케이스: 용암맛1]
        /([가-힣]+맛\d+)\]/,

        // 괄호 없는 케이스: 용암맛1
        /([가-힣]+맛\d*)/,

        // 괄호가 다른 문자로 오인식된 케이스: 1용암맛11
        /[^\w가-힣]*([가-힣]+맛)\d*[^\w가-힣]*/
    ];

    for (let pattern of patterns) {
        const match = region1.match(pattern);
        if (match) {
            let result = match[1];

            // 1) “맛” 뒤에 붙은 모든 숫자를 잘라낸 뒤
            const baseName = result.replace(/\d+$/, '');  // -> "용암맛"
            // 숫자 뭉치 전체를 뽑고,
            // 그 중 첫 글자만 등급으로 사용
            const fullDigits = result.match(/\d+/)?.[0] ?? "1";
            const gradeDigit = fullDigits.charAt(0);    // ex) "2"

            return baseName + gradeDigit;
        }
    }

    return null;
}