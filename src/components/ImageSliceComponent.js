import { useRef, useState } from 'react';
import { loadImage } from '../utils/function';
import { sliceClashCells, sliceClashV2Cells, sliceClashV2SideSkills, sliceDeepClashBossCells, sliceDeepClashPersCells, sliceFrontierCells } from '../utils/sliceCells';

const ImageSliceComponent = () => {
    const [allCells, setAllCells] = useState([]);
    const [loading, setLoading] = useState(false);
    const canvasRef = useRef(document.createElement('canvas'));

    const handleImageSlice = async (e, type) => {
        const files = Array.from(e.target.files);
        if (!files.length) return;

        setLoading(true);
        const results = [];

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const url = URL.createObjectURL(file);

            try {
                const img = await loadImage(url);
                const canvas = canvasRef.current;
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);

                let rects;
                switch (type) {
                    case 'clash':
                        rects = sliceClashCells();
                        break;
                    case 'frontier':
                        rects = sliceFrontierCells(canvas);
                        break;
                    case 'clashV2':
                        rects = sliceClashV2Cells('slice');
                        break;
                    case 'clashV2SideSkills':
                        rects = sliceClashV2SideSkills();
                        break;
                    case 'deepClashBoss':
                        rects = sliceDeepClashBossCells();
                        break;
                    case 'deepClashPers':
                        rects = sliceDeepClashPersCells();
                        break;
                    default:
                        throw new Error(`Unknown slice type: ${type}`);
                }

                const cells = rects.map((r, idx) => {
                    const off = document.createElement('canvas');
                    off.width = r.w;
                    off.height = r.h;
                    const offCtx = off.getContext('2d');
                    offCtx.drawImage(
                        canvas,
                        r.x, r.y, r.w, r.h,
                        0, 0, r.w, r.h
                    );
                    return { index: idx, url: off.toDataURL(), ...r };
                });

                results.push({ fileName: file.name, cells });
            } catch (err) {
                console.error(`Error slicing ${file.name}:`, err);
                results.push({ fileName: file.name, error: err.message, cells: [] });
            } finally {
                URL.revokeObjectURL(url);
            }
        }

        setAllCells(results);
        setLoading(false);
    };

    const SLICE_CONFIG = [
        { label: '🎨 차원 대충돌 이미지 (5+4 격자):', onChange: (e) => handleImageSlice(e, 'clash') },
        { label: '🎨 엘리아스 프론티어 이미지 (6+3 격자):', onChange: (e) => handleImageSlice(e, 'frontier') },
        { label: '🎨 차원 대충돌 2.0 이미지 (9+9 격자):', onChange: (e) => handleImageSlice(e, 'clashV2') },
        { label: '🎨 차원 대충돌 2.0 이면의파편:', onChange: (e) => handleImageSlice(e, 'clashV2SideSkills') },
        { label: '🎨 심해 대격돌 보스(6+3 격자): ', onChange: (e) => handleImageSlice(e, 'deepClashBoss') },
        { label: '🎨 심해 대격돌 성격별 해역(6칸):', onChange: (e) => handleImageSlice(e, 'deepClashPers') },
    ]

    return (
        <>
            {SLICE_CONFIG.map(config => (
                <div className='p-5 max-w-[800px] mx-auto'>
                    <div className='mb-3'>
                        <div className='mb-1 font-bold'>
                            {config.label}
                        </div>
                        <input
                            className='m-1'
                            type="file"
                            multiple
                            onChange={config.onChange}
                            disabled={loading}
                            accept="image/*"
                        />
                    </div>
                </div>
            ))}

            {/* 셀 분할 결과 */}
            {allCells.map(({ fileName, cells, error }, idx) => (
                <div key={idx} style={{ marginTop: 24 }}>
                    <h3>{fileName} {error && <span style={{ color: 'red' }}>오류: {error}</span>}</h3>
                    {cells.length > 0 ? (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,120px)', gap: 4 }}>
                            {cells.map(cell => (
                                <div key={cell.index} style={{ border: '1px solid #ccc', padding: 4 }}>
                                    <img src={cell.url} alt={`셀 ${cell.index}`} style={{ width: '100%', height: 80, objectFit: 'cover' }} />
                                    <div style={{ fontSize: 10, textAlign: 'center' }}>셀 {cell.index}</div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p>분할된 셀이 없습니다.</p>
                    )}
                </div>
            ))}

            <canvas ref={canvasRef} style={{ display: 'none' }} />
        </>
    );
}

export default ImageSliceComponent;