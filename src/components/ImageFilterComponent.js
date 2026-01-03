import { useEffect, useState } from 'react';
import {
    applyBinarization,
    applyPreprocessing,
    invertColors,
    preprocessCanvas
} from '../utils/ocrFunction';

const ImageFilterComponent = () => {
    const [src, setSrc] = useState(null);
    const [steps, setSteps] = useState([]);

    // 각 단계별 레이블
    const labels = [
        '원본',
        '그레이스케일 + 대비 + 블러',
        '그레이스케일 + 대비 + 블러 + 색반전',
        '그레이스케일+대비+블러+색반전+이진화',
        '색반전 + 그레이스케일 + 이진화',
        '도려내기 가공'
    ];

    // 업로드된 이미지를 읽어서 <img> 에 세팅
    const onFile = e => {
        const f = e.target.files[0];
        if (!f) return;
        setSrc(URL.createObjectURL(f));
    };

    // src가 바뀔 때마다 5단계 캔버스 미리 만들기
    useEffect(() => {
        if (!src) return;
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = async () => {
            const w = img.naturalWidth;
            const h = img.naturalHeight;

            // 1) 원본 캔버스
            const c0 = document.createElement('canvas');
            c0.width = w; c0.height = h;
            c0.getContext('2d').drawImage(img, 0, 0);

            // 2) 그레이스케일 + 대비 + 블러
            const c1 = document.createElement('canvas');
            c1.width = w; c1.height = h;
            c1.getContext('2d').drawImage(c0, 0, 0);
            applyPreprocessing(c1);

            // 3) 그레이스케일 + 대비 + 블러 + 색상반전
            const c2 = document.createElement('canvas');
            c2.width = w; c2.height = h;
            c2.getContext('2d').drawImage(c0, 0, 0);
            applyPreprocessing(c2);   // grayscale→contrast→blur
            invertColors(c2);         // 색 반전

            // 4) 그레이스케일+대비+블러+색반전+이진화
            const c3 = document.createElement('canvas');
            c3.width = w; c3.height = h;
            c3.getContext('2d').drawImage(c0, 0, 0);
            applyPreprocessing(c3);
            invertColors(c3);
            applyBinarization(c3, 128);

            // 5) 색반전 + 그레이스케일 + 이진화
            const c4 = document.createElement('canvas');
            c4.width = w; c4.height = h;
            c4.getContext('2d').drawImage(c0, 0, 0);
            invertColors(c4);
            preprocessCanvas(c4); // 그레이스케일+이진화

            // 이미지 도려내기
            const c5 = document.createElement('canvas');
            const cutX = 305
            const cutY = 392
            const cutW = 7
            const cutH = 11

            c5.width = cutW;
            c5.height = cutH;
            c5.getContext('2d', { willReadFrequently: true }).drawImage(img, cutX, cutY, cutW, cutH, 0, 0, cutW, cutH);

            setSteps([
                c0.toDataURL(),
                c1.toDataURL(),
                c2.toDataURL(),
                c3.toDataURL(),
                c4.toDataURL(),
                c5.toDataURL()
            ]);
        };
        img.src = src;

        // cleanup old URL
        return () => src && URL.revokeObjectURL(src);
    }, [src]);

    return (
        <div className="w-[1024] flex flex-col justify-center items-center gap-y-2 mb-4">
            <div className='font-bold'>
                이진화는 경계가 사라져 OCR 오인식이 잦음
            </div>
            <div>
                <input
                    type="file"
                    accept="image/*"
                    onChange={onFile}
                    className="mb-4"
                />
            </div>
            {!src && <p>이미지를 선택하세요📷</p>}
            {steps.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {steps.map((dataUrl, i) => (
                        <div key={i} className="text-center">
                            <div className="mb-2 font-medium">{labels[i]}</div>
                            <img
                                src={dataUrl}
                                alt={labels[i]}
                                className="border rounded"
                            />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default ImageFilterComponent;