// 차원 대충돌 2.0 이면의 파편 레벨 템플릿 매칭 전용
const NUM_PATHS = ['/images/templates/0.png',
    '/images/templates/1.png', '/images/templates/2.png', '/images/templates/3.png', '/images/templates/4.png',
    '/images/templates/5.png', '/images/templates/6.png', '/images/templates/7.png', '/images/templates/8.png'
];

export let templateImages = [];

export const loadTemplates = async () => {
    const promises = NUM_PATHS.map((path, index) => {
        return new Promise((resolve) => {
            const img = new Image();
            img.src = path;
            img.onload = () => resolve({ index, img });
        });
    });
    const loaded = await Promise.all(promises);
    templateImages = loaded.sort((a, b) => a.index - b.index).map(item => item.img);
};

export function matchDigit(targetCanvas) {
    const tw = targetCanvas.width;
    const th = targetCanvas.height;
    const targetCtx = targetCanvas.getContext('2d', { willReadFrequently: true });
    const targetData = targetCtx.getImageData(0, 0, tw, th).data;

    let bestNumber = "0";
    let minDiff = Infinity;

    templateImages.forEach((tempImg, num) => {
        const canvas = document.createElement('canvas');
        canvas.width = tw;
        canvas.height = th;
        const ctx = canvas.getContext('2d');

        // 템플릿을 현재 캔버스 크기(7x11)에 맞춰 그려서 비교
        ctx.drawImage(tempImg, 0, 0, tw, th);
        const tempData = ctx.getImageData(0, 0, tw, th).data;

        let diff = 0;
        for (let i = 0; i < targetData.length; i += 4) {
            // R, G, B 값의 절대 차이 합산
            diff += Math.abs(targetData[i] - tempData[i]);
            diff += Math.abs(targetData[i + 1] - tempData[i + 1]);
            diff += Math.abs(targetData[i + 2] - tempData[i + 2]);
        }

        if (diff < minDiff) {
            minDiff = diff;
            bestNumber = num.toString();
        }
    });

    return bestNumber;
}