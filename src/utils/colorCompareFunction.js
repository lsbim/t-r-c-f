export function getAverageColor(canvas, roi) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    const imageData = ctx.getImageData(roi.x, roi.y, roi.w, roi.h);
    const data = imageData.data;
    let r = 0, g = 0, b = 0;
    let count = 0;

    for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] > 128) {
            r += data[i];
            g += data[i + 1];
            b += data[i + 2];
            count++;
        }
    }

    if (count === 0) return null;

    return {
        r: Math.round(r / count),
        g: Math.round(g / count),
        b: Math.round(b / count),
    };
}

// 두 RGB 색상 간의 거리를 계산
function colorDistance(rgb1, rgb2) {
    const dr = rgb1.r - rgb2.r;
    const dg = rgb1.g - rgb2.g;
    const db = rgb1.b - rgb2.b;
    return Math.sqrt(dr * dr + dg * dg + db * db);
}

export function getClosestAttribute(rgb) {
    if (!rgb) return null;

    const attributes = [
        { name: '순수', color: { r: 102, g: 193, b: 124 } },
        { name: '냉정', color: { r: 131, g: 185, b: 235 } },  
        { name: '광기', color: { r: 235, g: 131, b: 154 } }, 
        { name: '활발', color: { r: 235, g: 219, b: 131 } },
        { name: '우울', color: { r: 198, g: 131, b: 236 } }, 
    ];

    let closestAttr = null;
    let minDistance = Infinity;

    attributes.forEach(attr => {
        const distance = colorDistance(rgb, attr.color);
        if (distance < minDistance) {
            minDistance = distance;
            closestAttr = attr.name;
        }
    });

    // 너무 멀리 떨어진 색이면 null (임계값 제한)
    // if (minDistance > 100) return null; 

    return closestAttr;
}