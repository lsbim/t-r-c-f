import { useRef, useState } from 'react';
import { loadImage } from '../utils/function';
import { sliceClashCells, sliceClashV2Cells, sliceFrontierCells } from '../utils/sliceCells';

const ImageSliceComponent = () => {
    const [allCells, setAllCells] = useState([]);
    const [loading, setLoading] = useState(false);
    const canvasRef = useRef(document.createElement('canvas')); // useRef에 초기값을 설정하여 .current가 항상 존재하도록 함

    // 다중 파일 → 모두 분할
    const onClash = async e => {
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

                // sliceCells는 [{x,y,w,h}, ...] 반환
                const rects = sliceClashCells();
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

    const onFrontier = async e => {
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

                // sliceCells는 [{x,y,w,h}, ...] 반환
                const rects = sliceFrontierCells(canvas);
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

    const onClashV2 = async e => {
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

                // sliceCells는 [{x,y,w,h}, ...] 반환
                const rects = sliceClashV2Cells();
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

    return (
        <>
            {/* 차원대충돌 */}
            <div style={{ padding: 20, maxWidth: 800, margin: '0 auto' }}>
                <div style={{ marginBottom: 12 }}>
                    <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>
                        🎨 검색할 차원 대충돌 이미지 (5+4 격자):
                    </label>
                    <input
                        type="file"
                        multiple
                        onChange={onClash}
                        disabled={loading}
                        accept="image/*"
                        style={{ padding: 4 }}
                    />
                </div>

            </div>
            {/* 엘리아스 프론티어 */}
            <div style={{ padding: 20, maxWidth: 800, margin: '0 auto' }}>
                <div style={{ marginBottom: 12 }}>
                    <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>
                        🎨 검색할 엘리아스 프론티어 이미지 (6+3 격자):
                    </label>
                    <input
                        type="file"
                        multiple
                        onChange={onFrontier}
                        disabled={loading}
                        accept="image/*"
                        style={{ padding: 4 }}
                    />
                </div>

            </div>
            {/* 차원 대충돌 2.0 */}
            <div style={{ padding: 20, maxWidth: 800, margin: '0 auto' }}>
                <div style={{ marginBottom: 12 }}>
                    <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>
                        🎨 검색할 차원 대충돌 2.0 이미지 (9+9 격자):
                    </label>
                    <input
                        type="file"
                        multiple
                        onChange={onClashV2}
                        disabled={loading}
                        accept="image/*"
                        style={{ padding: 4 }}
                    />
                </div>

            </div>
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